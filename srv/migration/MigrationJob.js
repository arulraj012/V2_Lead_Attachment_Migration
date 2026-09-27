/**
 * MigrationJob - V1 to V2 Lead Attachment migration
 * Supports file attachments and web links.
 */
const checkpoint = require('./CheckpointService');
const duplicateDetection = require('./DuplicateDetectionService');
const V1LeadClient = require('./V1LeadClient');
const V2LeadClient = require('./V2LeadClient');

const v1Client = new V1LeadClient();
const v2Client = new V2LeadClient();
const OBJECT_TYPE = 'LEAD_ATTACHMENT';

let batchConfig = { batchSize: 10, maxRecordsPerRun: 500, delayBetweenBatches: 1000, delayBetweenRecords: 200 };

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function getBatchConfig() { return { ...batchConfig }; }
function setBatchConfig(config) {
    if (config.batchSize) batchConfig.batchSize = Math.max(1, Math.min(100, config.batchSize));
    if (config.maxRecordsPerRun !== undefined) batchConfig.maxRecordsPerRun = Math.max(0, config.maxRecordsPerRun);
    if (config.delayBetweenBatches !== undefined) batchConfig.delayBetweenBatches = Math.max(0, config.delayBetweenBatches);
    if (config.delayBetweenRecords !== undefined) batchConfig.delayBetweenRecords = Math.max(0, config.delayBetweenRecords);
}

async function migrateAttachment(attachment, lead, v2Lead) {
    let attachmentId, downloadMs = 0, uploadMs = 0, contentHash = null;

    if (attachment.isWebLink) {
        console.log(`[MigrationJob] Processing web link: ${attachment.name} -> ${attachment.linkWebURI}`);
        const result = await v2Client.uploadWebLink(v2Lead.id, { title: attachment.name, url: attachment.linkWebURI });
        attachmentId = result.attachmentId;
        uploadMs = result.durationMs;
        contentHash = attachment.linkWebURI;
        console.log(`[MigrationJob] Web link created: ID=${attachmentId}, took ${uploadMs}ms`);
    } else {
        console.log(`[MigrationJob] Downloading: ${attachment.name} (${attachment.sizeInBytes || 'unknown'} bytes)`);
        const downloadResult = await v1Client.downloadAttachment(attachment.objectId, lead.ObjectID);
        downloadMs = downloadResult.durationMs;
        contentHash = duplicateDetection.computeContentHash(downloadResult.buffer);
        console.log(`[MigrationJob] Downloaded ${downloadResult.buffer.length} bytes in ${downloadMs}ms`);

        console.log(`[MigrationJob] Uploading to V2 Lead: ${v2Lead.id}`);
        const uploadResult = await v2Client.uploadAttachment(v2Lead.id, {
            fileName: attachment.name, mimeType: attachment.mimeType,
            content: downloadResult.buffer, description: attachment.description
        });
        attachmentId = uploadResult.attachmentId;
        uploadMs = uploadResult.durationMs;
        console.log(`[MigrationJob] Upload complete: ID=${attachmentId}, took ${uploadMs}ms`);
    }

    try {
        const exists = await v2Client.attachmentExists(v2Lead.id, attachment.name);
        if (exists) console.log(`[MigrationJob] VERIFIED: "${attachment.name}" on V2 Lead`);
        else console.warn(`[MigrationJob] WARNING: "${attachment.name}" NOT found after upload!`);
    } catch (e) { console.warn(`[MigrationJob] Could not verify: ${e.message}`); }

    return { attachmentId, downloadMs, uploadMs, contentHash };
}

async function runMigration(filterOptions = {}, runId = null) {
    const startTime = Date.now();
    let migrated = 0, failed = 0, skipped = 0;

    try {
        console.log(`[MigrationJob] Starting lead attachment migration. RunId: ${runId}`);
        const leadsWithAttachments = await v1Client.fetchLeads(filterOptions);
        console.log(`[MigrationJob] Found ${leadsWithAttachments.length} leads`);

        let totalAttachments = 0;
        for (const lead of leadsWithAttachments) {
            console.log(`[MigrationJob] Fetching attachments for lead: ${lead.ID}`);
            const attachments = await v1Client.fetchLeadAttachments(lead.ObjectID);
            if (attachments.length === 0) { console.log(`[MigrationJob] No attachments, skipping`); continue; }
            console.log(`[MigrationJob] Lead ${lead.ID} has ${attachments.length} attachment(s)`);

            const v2Lead = await v2Client.findLeadByDisplayId(lead.ID);
            if (!v2Lead) {
                console.log(`[MigrationJob] No V2 lead for displayId=${lead.ID}, skipping`);
                skipped += attachments.length;
                continue;
            }
            console.log(`[MigrationJob] Found V2 Lead: ${v2Lead.id}`);

            let parentMigrated = 0, parentFailed = 0;
            for (const attachment of attachments) {
                if (batchConfig.maxRecordsPerRun > 0 && totalAttachments >= batchConfig.maxRecordsPerRun) break;
                totalAttachments++;

                try {
                    const dupCheck = await duplicateDetection.shouldSkip({
                        objectType: OBJECT_TYPE, v1ObjectID: attachment.objectId,
                        parentDisplayId: lead.ID, fileName: attachment.name,
                        v2ApiCheck: async () => ({ exists: await v2Client.attachmentExists(v2Lead.id, attachment.name), id: null })
                    });
                    if (dupCheck.skip) { console.log(`[MigrationJob] Skipped (${dupCheck.reason}): ${attachment.name}`); skipped++; continue; }

                    const result = await migrateAttachment(attachment, lead, v2Lead);
                    await checkpoint.saveLeadAttachmentSuccess({
                        parentDisplayId: lead.ID, parentV2ObjectID: v2Lead.id,
                        v1AttachmentID: attachment.objectId, v2AttachmentID: result.attachmentId,
                        attachmentName: attachment.name,
                        attachmentSize: attachment.isWebLink ? 0 : attachment.sizeInBytes,
                        mimeType: attachment.isWebLink ? 'text/uri-list' : attachment.mimeType,
                        contentHash: result.contentHash,
                        mode: attachment.isWebLink ? 'WEB_LINK' : 'ATTACHMENT_ONLY',
                        runId, downloadDurationMs: result.downloadMs, uploadDurationMs: result.uploadMs
                    });
                    migrated++; parentMigrated++;
                    console.log(`[MigrationJob] Migrated ${attachment.isWebLink ? '[LINK]' : '[FILE]'}: ${attachment.name}`);
                } catch (err) {
                    console.error(`[MigrationJob] Failed: ${attachment.name}: ${err.message}`);
                    try { await checkpoint.saveLeadAttachmentFailed({ parentDisplayId: lead.ID, v1AttachmentID: attachment.objectId, attachmentName: attachment.name, errorStep: err.step || 'UNKNOWN', errorMessage: err.message, runId }); } catch (e) {}
                    failed++; parentFailed++;
                }
                if (batchConfig.delayBetweenRecords > 0) await sleep(batchConfig.delayBetweenRecords);
            }
            await checkpoint.incrementParentAttachmentCounts(OBJECT_TYPE, lead.ID, { migrated: parentMigrated, failed: parentFailed });
        }

        const durationMs = Date.now() - startTime;
        await checkpoint.releaseLock(OBJECT_TYPE, migrated, failed, durationMs, skipped);
        console.log(`[MigrationJob] Complete. Migrated:${migrated} Failed:${failed} Skipped:${skipped}`);
        return { migrated, failed, skipped, durationMs };
    } catch (err) {
        await checkpoint.releaseLockFailed(OBJECT_TYPE, err.message);
        throw err;
    }
}

module.exports = { runMigration, getBatchConfig, setBatchConfig, OBJECT_TYPE };

