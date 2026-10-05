/**
 * MigrationJob - V1 to V2 Lead Attachment migration
 * 
 * Features:
 * - Cursor-based (keyset) pagination for efficient lead fetching
 * - Parallel attachment processing within each lead
 * - Lead-level status tracking (no re-processing of completed leads)
 * - Crash-safe checkpointing after each lead
 */
const checkpoint = require('./CheckpointService');
const duplicateDetection = require('./DuplicateDetectionService');
const parallelProcessor = require('./ParallelProcessor');
const V1LeadClient = require('./V1LeadClient');
const V2LeadClient = require('./V2LeadClient');

const v1Client = new V1LeadClient();
const v2Client = new V2LeadClient();
const OBJECT_TYPE = 'LEAD_ATTACHMENT';

// Default configuration (in-memory, loaded from DB on migration start)
let migrationConfig = {
    maxLeadsPerRun: 50,           // Leads to process per job run
    attachmentConcurrency: 5,     // Parallel attachment uploads per lead
    delayBetweenLeads: 500,       // Ms delay between leads (API throttling)
    delayBetweenAttachments: 100  // Ms delay between attachments
};

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function getMigrationConfig() { return { ...migrationConfig }; }
function setMigrationConfig(config) {
    if (config.maxLeadsPerRun) migrationConfig.maxLeadsPerRun = Math.max(1, Math.min(200, config.maxLeadsPerRun));
    if (config.attachmentConcurrency) migrationConfig.attachmentConcurrency = Math.max(1, Math.min(10, config.attachmentConcurrency));
    if (config.delayBetweenLeads !== undefined) migrationConfig.delayBetweenLeads = Math.max(0, config.delayBetweenLeads);
    if (config.delayBetweenAttachments !== undefined) migrationConfig.delayBetweenAttachments = Math.max(0, config.delayBetweenAttachments);
}

/**
 * Load configuration from database (called at migration start)
 */
async function loadConfigFromDb() {
    try {
        const dbConfig = await checkpoint.getBatchConfig(OBJECT_TYPE);
        if (dbConfig) {
            setMigrationConfig({
                maxLeadsPerRun: dbConfig.maxLeadsPerRun,
                attachmentConcurrency: dbConfig.attachmentConcurrency,
                delayBetweenLeads: dbConfig.delayBetweenLeads,
                delayBetweenAttachments: dbConfig.delayBetweenAttachments
            });
            console.log(`[MigrationJob] Config loaded from DB: maxLeadsPerRun=${migrationConfig.maxLeadsPerRun}, concurrency=${migrationConfig.attachmentConcurrency}`);
        } else {
            console.log(`[MigrationJob] No DB config found, using defaults`);
        }
    } catch (err) {
        console.warn(`[MigrationJob] Failed to load config from DB, using defaults: ${err.message}`);
    }
}

/**
 * Migrate a single attachment (file or web link)
 */
async function migrateAttachment(attachment, lead, v2Lead) {
    let attachmentId, downloadMs = 0, uploadMs = 0, contentHash = null;

    if (attachment.isWebLink) {
        console.log(`[MigrationJob]   → [LINK] ${attachment.name}`);
        const result = await v2Client.uploadWebLink(v2Lead.id, { title: attachment.name, url: attachment.linkWebURI });
        attachmentId = result.attachmentId;
        uploadMs = result.durationMs;
        contentHash = attachment.linkWebURI;
    } else {
        console.log(`[MigrationJob]   → [FILE] ${attachment.name} (${attachment.sizeInBytes || 0} bytes)`);
        const downloadResult = await v1Client.downloadAttachment(attachment.objectId, lead.ObjectID);
        downloadMs = downloadResult.durationMs;
        contentHash = duplicateDetection.computeContentHash(downloadResult.buffer);

        const uploadResult = await v2Client.uploadAttachment(v2Lead.id, {
            fileName: attachment.name, mimeType: attachment.mimeType,
            content: downloadResult.buffer, description: attachment.description
        });
        attachmentId = uploadResult.attachmentId;
        uploadMs = uploadResult.durationMs;
    }

    return { attachmentId, downloadMs, uploadMs, contentHash, isWebLink: attachment.isWebLink };
}

/**
 * Process all attachments for a single lead with parallel execution
 */
async function processLeadAttachments(lead, v2Lead, runId) {
    const attachments = await v1Client.fetchLeadAttachments(lead.ObjectID);
    if (attachments.length === 0) return { migrated: 0, failed: 0, skipped: 0, total: 0 };

    console.log(`[MigrationJob] Lead ${lead.ID}: ${attachments.length} attachments (concurrency: ${migrationConfig.attachmentConcurrency})`);

    const results = await parallelProcessor.process(attachments, async (attachment) => {
        const dupCheck = await duplicateDetection.shouldSkip({
            objectType: OBJECT_TYPE, v1ObjectID: attachment.objectId, parentDisplayId: lead.ID, fileName: attachment.name,
            v2ApiCheck: async () => ({ exists: await v2Client.attachmentExists(v2Lead.id, attachment.name), id: null })
        });
        if (dupCheck.skip) {
            console.log(`[MigrationJob]   - SKIP (${dupCheck.reason}): ${attachment.name}`);
            // Save skipped attachment to audit log for visibility
            await checkpoint.saveLeadAttachmentSkipped({
                parentDisplayId: lead.ID, parentV2ObjectID: v2Lead.id, v1AttachmentID: attachment.objectId,
                attachmentName: attachment.name, attachmentSize: attachment.isWebLink ? 0 : attachment.sizeInBytes,
                mimeType: attachment.isWebLink ? 'text/uri-list' : attachment.mimeType,
                skipReason: dupCheck.reason, runId
            });
            return { status: 'skipped', reason: dupCheck.reason, attachment };
        }

        const result = await migrateAttachment(attachment, lead, v2Lead);
        await checkpoint.saveLeadAttachmentSuccess({
            parentDisplayId: lead.ID, parentV2ObjectID: v2Lead.id, v1AttachmentID: attachment.objectId,
            v2AttachmentID: result.attachmentId, attachmentName: attachment.name,
            attachmentSize: attachment.isWebLink ? 0 : attachment.sizeInBytes,
            mimeType: attachment.isWebLink ? 'text/uri-list' : attachment.mimeType,
            contentHash: result.contentHash, mode: attachment.isWebLink ? 'WEB_LINK' : 'ATTACHMENT_ONLY',
            runId, downloadDurationMs: result.downloadMs, uploadDurationMs: result.uploadMs
        });
        return { status: 'migrated', attachment, result };
    }, { concurrency: migrationConfig.attachmentConcurrency, delayBetweenItems: migrationConfig.delayBetweenAttachments });

    let migrated = 0, failed = 0, skipped = 0;
    for (const r of results) {
        if (r.status === 'fulfilled') {
            if (r.value.status === 'migrated') migrated++;
            else if (r.value.status === 'skipped') skipped++;
        } else {
            failed++;
            console.error(`[MigrationJob]   X FAILED: ${r.item.name}: ${r.reason?.message}`);
            try { await checkpoint.saveLeadAttachmentFailed({ parentDisplayId: lead.ID, v1AttachmentID: r.item.objectId, attachmentName: r.item.name, errorStep: r.reason?.step || 'UNKNOWN', errorMessage: r.reason?.message, runId }); } catch (e) {}
        }
    }
    console.log(`[MigrationJob] Lead ${lead.ID}: Done - Migrated:${migrated} Skipped:${skipped} Failed:${failed}`);
    return { migrated, failed, skipped, total: attachments.length };
}

/**
 * Main migration function with cursor-based pagination
 * Processes leads sequentially (for cursor integrity), attachments in parallel
 */
async function runMigration(filterOptions = {}, runId = null) {
    const startTime = Date.now();
    
    // Load config from database first (ensures we use persisted settings)
    await loadConfigFromDb();
    
    const { createdFrom, createdTo, maxLeadsPerRun = migrationConfig.maxLeadsPerRun, resetCursor = false, leadId } = filterOptions;
    
    let totalMigrated = 0, totalFailed = 0, totalSkipped = 0, leadsProcessed = 0;

    try {
        console.log(`[MigrationJob] Starting migration. RunId: ${runId}`);
        console.log(`[MigrationJob] Config: maxLeadsPerRun=${maxLeadsPerRun}, concurrency=${migrationConfig.attachmentConcurrency}, delayLeads=${migrationConfig.delayBetweenLeads}ms`);
        
        let leads = [];
        
        // Single lead mode: fetch specific lead by ID (bypasses cursor)
        if (leadId) {
            console.log(`[MigrationJob] Single lead mode: fetching lead ${leadId}`);
            leads = await v1Client.fetchLeads({ leadId });
            
            if (leads.length === 0) {
                console.log(`[MigrationJob] Lead ${leadId} not found in V1 system.`);
                const durationMs = Date.now() - startTime;
                await checkpoint.releaseLock(OBJECT_TYPE, 0, 0, durationMs, 0);
                return { status: 'NOT_FOUND', migrated: 0, failed: 0, skipped: 0, leadsProcessed: 0, durationMs, message: `Lead ${leadId} not found` };
            }
            
            console.log(`[MigrationJob] Found lead ${leadId}: ${leads[0].Name || 'N/A'}`);
        } else {
            // Batch mode: use cursor-based pagination
            console.log(`[MigrationJob] Date range: ${createdFrom || 'any'} to ${createdTo || 'any'}`);
            console.log(`[MigrationJob] Max leads per run: ${maxLeadsPerRun}`);

            // Get total count for progress tracking
            const totalLeads = await v1Client.countLeadsInRange(createdFrom, createdTo);
            
            // Initialize/update cursor with date range
            await checkpoint.initializeCursor(OBJECT_TYPE, { createdFrom, createdTo, totalLeadsInRange: totalLeads, resetCursor });

            // Get current cursor position
            const cursor = await checkpoint.getCursor(OBJECT_TYPE);
            console.log(`[MigrationJob] Cursor position: Lead ${cursor.cursorLeadId || 'START'}, Position ${cursor.cursorPosition}/${totalLeads || '?'}`);

            // Fetch next batch of leads using keyset pagination
            leads = await v1Client.fetchLeadsAfterCursor({
                createdFrom, createdTo,
                afterLeadId: cursor.cursorLeadId,
                afterCreationDateTime: cursor.cursorCreationDateTime,
                limit: maxLeadsPerRun
            });

            if (leads.length === 0) {
                console.log(`[MigrationJob] No more leads to process. Migration complete for this date range.`);
                const durationMs = Date.now() - startTime;
                await checkpoint.releaseLock(OBJECT_TYPE, 0, 0, durationMs, 0);
                return { status: 'COMPLETED', migrated: 0, failed: 0, skipped: 0, leadsProcessed: 0, durationMs, message: 'All leads processed' };
            }
        }

        console.log(`[MigrationJob] Processing ${leads.length} lead(s)...`);

        // Process each lead sequentially (for cursor integrity)
        for (const lead of leads) {
            // Check if already completed (safety check) - but skip this check in single-lead mode
            // In single-lead mode (leadId provided), we always re-process to allow re-testing
            if (!leadId) {
                const alreadyDone = await checkpoint.isLeadCompleted(OBJECT_TYPE, lead.ID);
                if (alreadyDone) {
                    console.log(`[MigrationJob] Lead ${lead.ID}: Already completed, skipping`);
                    totalSkipped++;
                    leadsProcessed++;
                    continue;
                }
            }

            // Mark lead as processing
            await checkpoint.markLeadProcessing(OBJECT_TYPE, lead, runId);

            // Find V2 lead by displayId
            const v2Lead = await v2Client.findLeadByDisplayId(lead.ID);
            if (!v2Lead) {
                console.log(`[MigrationJob] Lead ${lead.ID}: Not found in V2, marking as skipped`);
                await checkpoint.markLeadSkipped(OBJECT_TYPE, lead.ID);
                // Only update cursor in batch mode (not single lead mode)
                if (!leadId) {
                    await checkpoint.updateCursor(OBJECT_TYPE, { cursorLeadId: lead.ID, cursorCreationDateTime: lead.CreationDateTime });
                }
                totalSkipped++;
                leadsProcessed++;
                continue;
            }

            // Process all attachments for this lead (parallel)
            const result = await processLeadAttachments(lead, v2Lead, runId);

            // Mark lead as completed
            await checkpoint.markLeadCompleted(OBJECT_TYPE, lead.ID, {
                v2LeadId: v2Lead.id, migrated: result.migrated, failed: result.failed, skipped: result.skipped, total: result.total
            });

            // Update cursor (checkpoint after each lead for crash safety) - only in batch mode
            if (!leadId) {
                await checkpoint.updateCursor(OBJECT_TYPE, { cursorLeadId: lead.ID, cursorCreationDateTime: lead.CreationDateTime });
            }

            totalMigrated += result.migrated;
            totalFailed += result.failed;
            totalSkipped += result.skipped;
            leadsProcessed++;

            // Delay between leads
            if (migrationConfig.delayBetweenLeads > 0) await sleep(migrationConfig.delayBetweenLeads);
        }

        const durationMs = Date.now() - startTime;
        await checkpoint.releaseLock(OBJECT_TYPE, totalMigrated, totalFailed, durationMs, totalSkipped);

        const stats = await checkpoint.getProcessingStats(OBJECT_TYPE);
        console.log(`[MigrationJob] Run complete. Leads:${leadsProcessed} Migrated:${totalMigrated} Failed:${totalFailed} Skipped:${totalSkipped}`);
        console.log(`[MigrationJob] Overall progress: ${stats.progressPercent}`);

        return { status: 'SUCCESS', migrated: totalMigrated, failed: totalFailed, skipped: totalSkipped, leadsProcessed, durationMs, progress: stats };

    } catch (err) {
        console.error(`[MigrationJob] Error: ${err.message}`);
        await checkpoint.releaseLockFailed(OBJECT_TYPE, err.message);
        throw err;
    }
}

// Legacy function name for backward compatibility
function getBatchConfig() { return getMigrationConfig(); }
function setBatchConfig(config) { return setMigrationConfig(config); }

module.exports = { runMigration, getMigrationConfig, setMigrationConfig, getBatchConfig, setBatchConfig, OBJECT_TYPE };
