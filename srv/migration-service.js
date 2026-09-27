const cds = require('@sap/cds');
const { runMigration, getMigrationConfig, setMigrationConfig, getBatchConfig, setBatchConfig, OBJECT_TYPE } = require('./migration/MigrationJob');
const checkpoint = require('./migration/CheckpointService');
const fieldMapping = require('./migration/FieldMappingService');

/**
 * MigrationService - CAP service for V1 to V2 Attachment migration
 * 
 * NOTE: Parent objects (Lead, Ticket, etc.) are migrated via DTT tool.
 *       DTT preserves displayId, so we use it to find V2 parents.
 */
class MigrationService extends cds.ApplicationService {
    async init() {
        // Migration actions
        this.on('triggerRun', this.handleTriggerRun.bind(this));
        this.on('getStatus', this.handleGetStatus.bind(this));
        this.on('retryFailed', this.handleRetryFailed.bind(this));
        this.on('retryAllFailed', this.handleRetryAllFailed.bind(this));
        this.on('testMigration', this.handleTestMigration.bind(this));
        this.on('runMigration', this.handleRunMigration.bind(this));
        
        // Configuration actions
        this.on('getBatchConfig', this.handleGetBatchConfig.bind(this));
        this.on('updateBatchConfig', this.handleUpdateBatchConfig.bind(this));
        this.on('getMappingConfig', this.handleGetMappingConfig.bind(this));
        this.on('updateMappingConfig', this.handleUpdateMappingConfig.bind(this));
        
        // Parent validation & queue management
        this.on('validateParentsInV2', this.handleValidateParentsInV2.bind(this));
        this.on('queueAttachments', this.handleQueueAttachments.bind(this));
        
        await super.init();
    }

    async handleTriggerRun(req) {
        const { objectType, mode, parentId, createdFrom, createdTo, maxRecords, maxLeadsPerRun, resetCursor } = req.data;
        const targetObjectType = objectType || OBJECT_TYPE;

        const filters = {
            createdFrom: createdFrom || null,
            createdTo: createdTo || null,
            maxLeadsPerRun: maxLeadsPerRun || maxRecords || 50,
            resetCursor: resetCursor === true || resetCursor === 'true'
        };
        if (parentId) filters.leadId = parentId;

        const lockResult = await checkpoint.tryAcquireLock(mode || 'ATTACHMENT_ONLY', targetObjectType, 'UI');
        if (!lockResult.acquired) {
            return JSON.stringify({ status: 'busy', message: 'Migration already running', currentRunId: lockResult.currentRun?.runId });
        }

        const runId = lockResult.runId;
        (async () => {
            try {
                const result = await runMigration(filters, runId);
                console.log(`[MigrationService] Run ${runId} completed:`, JSON.stringify(result));
            } catch (err) {
                console.error(`[MigrationService] Run ${runId} failed: ${err.message}`);
            }
        })();

        return JSON.stringify({ status: 'accepted', runId, objectType: targetObjectType, message: 'Migration started',
            config: { createdFrom: filters.createdFrom, createdTo: filters.createdTo, maxLeadsPerRun: filters.maxLeadsPerRun }
        });
    }

    async handleGetStatus(req) {
        const objectType = req.data?.objectType || OBJECT_TYPE;
        const cp = await checkpoint.getCheckpoint(objectType);
        const pendingFailed = await checkpoint.getUnresolvedFailedCount(objectType);
        const pendingInQueue = await checkpoint.getPendingQueueCount(objectType);
        
        return {
            objectType,
            status: cp?.status || 'IDLE',
            lastRunAt: cp?.lastRunAt,
            lastSuccessAt: cp?.lastSuccessAt,
            totalMigrated: cp?.totalMigrated || 0,
            pendingFailed,
            pendingInQueue,
            isActive: true,
            lastRunId: cp?.lastRunId,
            lastRunMode: cp?.lastRunMode,
            lastRunMigrated: cp?.lastRunMigrated || 0,
            lastRunFailed: cp?.lastRunFailed || 0,
            lastRunSkipped: cp?.lastRunSkipped || 0,
            lastRunDurationMs: cp?.lastRunDurationMs || 0
        };
    }

    /**
     * Retry a specific failed record
     */
    async handleRetryFailed(req) {
        const { recordId } = req.data;
        if (!recordId) {
            return JSON.stringify({ status: 'error', message: 'recordId is required' });
        }

        const failedRecord = await checkpoint.getFailedRecordById(recordId);
        if (!failedRecord) {
            return JSON.stringify({ status: 'error', message: 'Failed record not found', recordId });
        }
        if (failedRecord.resolvedAt) {
            return JSON.stringify({ status: 'error', message: 'Record already resolved', recordId });
        }

        console.log(`[MigrationService] Retrying: ${failedRecord.fileName}`);

        try {
            const V1LeadClient = require('./migration/V1LeadClient');
            const V2LeadClient = require('./migration/V2LeadClient');
            const duplicateDetection = require('./migration/DuplicateDetectionService');
            const v1Client = new V1LeadClient();
            const v2Client = new V2LeadClient();

            // Find V2 Lead by displayId (DTT preserves it)
            const v2Lead = await v2Client.findLeadByDisplayId(failedRecord.parentDisplayId);
            if (!v2Lead) {
                await checkpoint.incrementRetryCount(recordId, `V2 Lead not found: ${failedRecord.parentDisplayId}`);
                return JSON.stringify({ status: 'failed', message: 'V2 Lead not found', recordId });
            }

            // Download from V1
            const { buffer, durationMs: downloadMs } = await v1Client.downloadAttachment(failedRecord.v1ObjectID);
            const contentHash = duplicateDetection.computeContentHash(buffer);

            // Upload to V2
            const { attachmentId, durationMs: uploadMs } = await v2Client.uploadAttachment(v2Lead.id, {
                fileName: failedRecord.fileName,
                mimeType: failedRecord.mimeType || 'application/octet-stream',
                content: buffer
            });

            // Save success
            await checkpoint.saveLeadAttachmentSuccess({
                parentDisplayId: failedRecord.parentDisplayId,
                parentV2ObjectID: v2Lead.id,
                v1AttachmentID: failedRecord.v1ObjectID,
                v2AttachmentID: attachmentId,
                attachmentName: failedRecord.fileName,
                attachmentSize: failedRecord.fileSize,
                mimeType: failedRecord.mimeType,
                contentHash, mode: 'RETRY', runId: null,
                downloadDurationMs: downloadMs, uploadDurationMs: uploadMs
            });

            // Mark resolved & update counts
            await checkpoint.resolveFailedRecord(recordId);
            await checkpoint.incrementParentAttachmentCounts(failedRecord.objectType, failedRecord.parentDisplayId, { migrated: 1, failed: -1 });

            console.log(`[MigrationService] Retry success: ${failedRecord.fileName}`);
            return JSON.stringify({ status: 'success', message: `Retried: ${failedRecord.fileName}`, recordId, v2AttachmentId: attachmentId });

        } catch (err) {
            console.error(`[MigrationService] Retry failed: ${err.message}`);
            await checkpoint.incrementRetryCount(recordId, err.message);
            return JSON.stringify({ status: 'failed', message: err.message, recordId, errorStep: err.step || 'UNKNOWN' });
        }
    }

    /**
     * Retry all unresolved failed records for an object type
     */
    async handleRetryAllFailed(req) {
        const objectType = req.data?.objectType || OBJECT_TYPE;
        const maxRetries = req.data?.maxRetries || 50;
        
        const failedRecords = await checkpoint.getUnresolvedFailedRecords(objectType, maxRetries);
        if (failedRecords.length === 0) {
            return JSON.stringify({ status: 'success', message: 'No failed records to retry', objectType, retried: 0, succeeded: 0, failed: 0 });
        }

        console.log(`[MigrationService] Retrying ${failedRecords.length} failed records`);
        let succeeded = 0, failed = 0;
        const results = [];

        for (const record of failedRecords) {
            try {
                const retryResult = await this.handleRetryFailed({ data: { recordId: record.ID } });
                const parsed = JSON.parse(retryResult);
                if (parsed.status === 'success') {
                    succeeded++;
                    results.push({ recordId: record.ID, fileName: record.fileName, status: 'success' });
                } else {
                    failed++;
                    results.push({ recordId: record.ID, fileName: record.fileName, status: 'failed', error: parsed.message });
                }
            } catch (err) {
                failed++;
                results.push({ recordId: record.ID, fileName: record.fileName, status: 'error', error: err.message });
            }
            await new Promise(resolve => setTimeout(resolve, 200)); // Small delay
        }

        console.log(`[MigrationService] Retry all: ${succeeded} succeeded, ${failed} failed`);
        return JSON.stringify({ 
            status: 'success', 
            message: `Retried ${failedRecords.length}: ${succeeded} succeeded, ${failed} failed`,
            objectType, retried: failedRecords.length, succeeded, failed, details: results
        });
    }

    async handleTestMigration(req) {
        const { objectType, parentId, createdFrom, createdTo, maxRecords } = req.data;
        return this.handleTriggerRun({ 
            data: { 
                objectType: objectType || OBJECT_TYPE,
                mode: 'ATTACHMENT_ONLY', 
                parentId,
                createdFrom,
                createdTo,
                maxRecords: maxRecords || 5 
            } 
        });
    }

    async handleGetBatchConfig(req) {
        const objectType = req.data?.objectType || OBJECT_TYPE;
        const config = getBatchConfig();
        const dbConfig = await checkpoint.getBatchConfig(objectType);
        return JSON.stringify({ objectType, ...config, ...dbConfig });
    }

    async handleUpdateBatchConfig(req) {
        const { objectType, batchSize, maxRecordsPerRun, delayBetweenBatches, delayBetweenRecords, isActive } = req.data;
        setBatchConfig({ batchSize, maxRecordsPerRun, delayBetweenBatches, delayBetweenRecords });
        return JSON.stringify({ status: 'updated', objectType: objectType || OBJECT_TYPE, config: getBatchConfig() });
    }

    async handleGetMappingConfig(req) {
        const { objectType, mappingType } = req.data;
        try {
            const config = await fieldMapping.loadConfig(objectType || OBJECT_TYPE);
            return JSON.stringify({ status: 'success', objectType: objectType || OBJECT_TYPE, mappingType, config });
        } catch (err) {
            return JSON.stringify({ status: 'error', message: err.message });
        }
    }

    async handleUpdateMappingConfig(req) {
        const { objectType, mappingType, mappings, description } = req.data;
        
        // Validate JSON
        try {
            JSON.parse(mappings);
        } catch (e) {
            return JSON.stringify({ status: 'error', message: 'Invalid JSON in mappings' });
        }
        
        const db = await cds.connect.to('db');
        const { MappingConfig } = db.entities('migration');
        const targetObjectType = objectType || OBJECT_TYPE;
        const targetMappingType = mappingType || 'FIELD_MAPPING';
        
        const existing = await SELECT.one.from(MappingConfig).where({ objectType: targetObjectType, mappingType: targetMappingType });
        
        if (existing) {
            await UPDATE(MappingConfig)
                .set({ mappings, description, modifiedAt: new Date() })
                .where({ objectType: targetObjectType, mappingType: targetMappingType });
        } else {
            await INSERT.into(MappingConfig).entries({
                objectType: targetObjectType, mappingType: targetMappingType,
                mappings, description, isActive: true, version: '1.0.0'
            });
        }
        
        // Clear cache
        fieldMapping.clearCache();
        
        return JSON.stringify({ status: 'success', objectType: targetObjectType, mappingType: targetMappingType });
    }

    async handleRunMigration(req) {
        return this.handleTriggerRun({ data: { ...req.data, triggeredBy: 'BTP_JOB' } });
    }

    /**
     * Validate that parent objects exist in V2 system
     * Since DTT preserves displayId, we look up V2 parents by displayId
     */
    async handleValidateParentsInV2(req) {
        const { objectType, parentDisplayIds } = req.data;
        const targetObjectType = objectType || OBJECT_TYPE;
        
        let displayIdArray;
        try {
            displayIdArray = JSON.parse(parentDisplayIds);
            if (!Array.isArray(displayIdArray)) throw new Error('parentDisplayIds must be an array');
        } catch (e) {
            return JSON.stringify({ status: 'error', message: `Invalid JSON: ${e.message}` });
        }
        
        // Determine which V2 client to use based on object type
        const V2LeadClient = require('./migration/V2LeadClient');
        const v2Client = new V2LeadClient();
        
        let validated = 0, notFound = 0, errors = 0;
        const results = [];
        
        for (const displayId of displayIdArray) {
            try {
                // For Lead attachments, look up lead by displayId
                const v2Parent = await v2Client.findLeadByDisplayId(displayId);
                
                if (v2Parent) {
                    // Update parent status in DB
                    await checkpoint.updateParentMigrationStatus({
                        objectType: targetObjectType,
                        parentDisplayId: displayId,
                        parentV2ObjectID: v2Parent.id,
                        v2Validated: true
                    });
                    validated++;
                    results.push({ displayId, status: 'found', v2Id: v2Parent.id });
                } else {
                    await checkpoint.updateParentMigrationStatus({
                        objectType: targetObjectType,
                        parentDisplayId: displayId,
                        v2Validated: false
                    });
                    notFound++;
                    results.push({ displayId, status: 'not_found' });
                }
            } catch (err) {
                console.error(`[MigrationService] Validate parent ${displayId} error: ${err.message}`);
                errors++;
                results.push({ displayId, status: 'error', message: err.message });
            }
        }
        
        return JSON.stringify({ 
            status: 'success', 
            objectType: targetObjectType, 
            validated, 
            notFound, 
            errors,
            details: results 
        });
    }

    /**
     * Queue attachments for migration
     */
    async handleQueueAttachments(req) {
        const { objectType, parentDisplayId, priority } = req.data;
        const targetObjectType = objectType || OBJECT_TYPE;
        
        // TODO: Fetch attachments from V1 and add to queue
        // For now, return not implemented
        return JSON.stringify({ 
            status: 'not_implemented', 
            message: 'Queue attachments coming soon - will fetch from V1 and add to ObjectQueue', 
            objectType: targetObjectType, 
            parentDisplayId, 
            priority: priority || 5 
        });
    }
}

module.exports = MigrationService;

module.exports = MigrationService;


