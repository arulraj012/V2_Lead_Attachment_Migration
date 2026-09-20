/**
 * MigrationJob - Core migration logic for V1 to V2 Lead Attachment migration
 */
const checkpoint = require('./CheckpointService');
const V1LeadClient = require('./V1LeadClient');
const V2LeadClient = require('./V2LeadClient');

const v1Client = new V1LeadClient();
const v2Client = new V2LeadClient();
const OBJECT_TYPE = 'LEAD_ATTACHMENT';

let batchConfig = {
    batchSize: 10, maxRecordsPerRun: 500,
    delayBetweenBatches: 1000, delayBetweenRecords: 200
};

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function getBatchConfig() { return { ...batchConfig }; }
function setBatchConfig(config) {
    if (config.batchSize) batchConfig.batchSize = Math.max(1, Math.min(100, config.batchSize));
    if (config.maxRecordsPerRun !== undefined) batchConfig.maxRecordsPerRun = Math.max(0, config.maxRecordsPerRun);
    if (config.delayBetweenBatches !== undefined) batchConfig.delayBetweenBatches = Math.max(0, config.delayBetweenBatches);
    if (config.delayBetweenRecords !== undefined) batchConfig.delayBetweenRecords = Math.max(0, config.delayBetweenRecords);
}

async function runMigration(filterOptions = {}, runId = null) {
    const startTime = Date.now();
    let migrated = 0, failed = 0, skipped = 0;

    try {
        console.log(`[MigrationJob] Starting lead attachment migration. RunId: ${runId}`);
        
        // Fetch leads with attachments from V1
        const leadsWithAttachments = await v1Client.fetchLeads(filterOptions);
        console.log(`[MigrationJob] Found ${leadsWithAttachments.length} leads`);

        let totalAttachments = 0;
        for (const lead of leadsWithAttachments) {
            const attachments = await v1Client.fetchLeadAttachments(lead.ObjectID);
            if (attachments.length === 0) continue;

            // Find matching V2 lead
            const v2Lead = await v2Client.findLeadByDisplayId(lead.LeadID);
            if (!v2Lead) {
                console.log(`[MigrationJob] No V2 lead found for ${lead.LeadID}, skipping`);
                skipped += attachments.length;
                continue;
            }

            for (const attachment of attachments) {
                if (batchConfig.maxRecordsPerRun > 0 && totalAttachments >= batchConfig.maxRecordsPerRun) break;
                totalAttachments++;

                try {
                    // Check if already exists
                    const exists = await v2Client.attachmentExists(v2Lead.id, attachment.name);
                    if (exists) { skipped++; continue; }

                    // Download from V1
                    const { buffer, durationMs: downloadMs } = await v1Client.downloadAttachment(attachment.objectId);

                    // Upload to V2
                    const { attachmentId, durationMs: uploadMs } = await v2Client.uploadAttachment(v2Lead.id, {
                        fileName: attachment.name, mimeType: attachment.mimeType,
                        content: buffer, description: attachment.description
                    });

                    await checkpoint.saveLeadAttachmentSuccess({
                        v1LeadObjectID: lead.ObjectID, v1LeadDisplayId: lead.LeadID,
                        v1AttachmentID: attachment.objectId, v2LeadObjectID: v2Lead.id,
                        v2LeadDisplayId: v2Lead.displayId, v2AttachmentID: attachmentId,
                        attachmentName: attachment.name, attachmentSize: attachment.sizeInBytes,
                        mimeType: attachment.mimeType, mode: 'ATTACHMENT_ONLY', runId
                    });
                    migrated++;
                    console.log(`[MigrationJob] Migrated: ${attachment.name} → ${v2Lead.displayId}`);

                } catch (err) {
                    await checkpoint.saveLeadAttachmentFailed({
                        v1LeadObjectID: lead.ObjectID, v1LeadDisplayId: lead.LeadID,
                        v1AttachmentID: attachment.objectId, attachmentName: attachment.name,
                        errorStep: err.step || 'UNKNOWN', errorMessage: err.message, runId
                    });
                    failed++;
                }

                if (batchConfig.delayBetweenRecords > 0) await sleep(batchConfig.delayBetweenRecords);
            }
        }

        const durationMs = Date.now() - startTime;
        await checkpoint.releaseLock(OBJECT_TYPE, migrated, failed, durationMs);
        console.log(`[MigrationJob] Complete. Migrated:${migrated} Failed:${failed} Skipped:${skipped}`);
        return { migrated, failed, skipped, durationMs };

    } catch (err) {
        await checkpoint.releaseLockFailed(OBJECT_TYPE, err.message);
        throw err;
    }
}

module.exports = { runMigration, getBatchConfig, setBatchConfig, OBJECT_TYPE };
