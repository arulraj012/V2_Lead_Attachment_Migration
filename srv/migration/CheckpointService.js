/**
 * CheckpointService - Manages migration checkpoint state and audit logging
 * 
 * NOTE: Parent objects (Lead, Ticket, etc.) are migrated via DTT tool.
 *       DTT preserves displayId, so V1 LeadID = V2 displayId.
 *       No ID mapping needed - we use ParentMigrationStatus for tracking progress.
 */
const cds = require('@sap/cds');
const LOCK_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_OBJECT_TYPE = 'LEAD_ATTACHMENT';

class CheckpointService {
    constructor() { this.db = null; this.entities = {}; }

    async init() {
        if (!this.db) {
            this.db = await cds.connect.to('db');
            this.entities = {
                Checkpoint: this.db.entities('migration').Checkpoint,
                RunHistory: this.db.entities('migration').RunHistory,
                BatchConfig: this.db.entities('migration').BatchConfig,
                ObjectAuditLog: this.db.entities('migration').ObjectAuditLog,
                ObjectFailedRecord: this.db.entities('migration').ObjectFailedRecord,
                ParentMigrationStatus: this.db.entities('migration').ParentMigrationStatus,
                ObjectQueue: this.db.entities('migration').ObjectQueue
            };
        }
    }

    async tryAcquireLock(mode, objectType = DEFAULT_OBJECT_TYPE, triggeredBy = 'BTP_JOB') {
        await this.init();
        const now = new Date();
        const existing = await SELECT.one.from(this.entities.Checkpoint).where({ objectType });

        if (existing?.status === 'RUNNING') {
            const lockAge = now.getTime() - new Date(existing.lastRunAt || 0).getTime();
            if (lockAge < LOCK_TIMEOUT_MS) {
                return { acquired: false, currentRun: { runId: existing.lastRunId, mode: existing.lastRunMode } };
            }
        }

        const runId = cds.utils.uuid();
        const data = { objectType, lastRunAt: now.toISOString(), status: 'RUNNING', lastRunId: runId, lastRunMode: mode };
        
        if (existing) await UPDATE(this.entities.Checkpoint).set(data).where({ objectType });
        else await INSERT.into(this.entities.Checkpoint).entries({ ...data, totalMigrated: 0 });

        await INSERT.into(this.entities.RunHistory).entries({ runId, objectType, mode, status: 'RUNNING', startedAt: now.toISOString(), triggeredBy });
        return { acquired: true, runId };
    }

    async releaseLock(objectType, migrated, failed, durationMs, skipped = 0) {
        await this.init();
        const now = new Date().toISOString();
        const cp = await SELECT.one.from(this.entities.Checkpoint).where({ objectType });
        
        await UPDATE(this.entities.Checkpoint).set({
            status: 'COMPLETED', lastSuccessAt: now, totalMigrated: (cp?.totalMigrated || 0) + migrated,
            lastRunMigrated: migrated, lastRunFailed: failed, lastRunSkipped: skipped, lastRunDurationMs: durationMs
        }).where({ objectType });

        if (cp?.lastRunId) {
            await UPDATE(this.entities.RunHistory).set({ status: 'COMPLETED', completedAt: now, migrated, failed, skipped, durationMs }).where({ runId: cp.lastRunId });
        }
    }

    async releaseLockFailed(objectType, errorMessage) {
        await this.init();
        const cp = await SELECT.one.from(this.entities.Checkpoint).where({ objectType });
        await UPDATE(this.entities.Checkpoint).set({ status: 'FAILED' }).where({ objectType });
        if (cp?.lastRunId) {
            await UPDATE(this.entities.RunHistory).set({ status: 'FAILED', completedAt: new Date().toISOString(), errorMessage: (errorMessage || '').substring(0, 500) }).where({ runId: cp.lastRunId });
        }
    }

    /**
     * Save successful migration to ObjectAuditLog (generic)
     * Uses parentDisplayId (preserved by DTT, same in V1 & V2)
     */
    async saveObjectSuccess(data) {
        await this.init();
        await INSERT.into(this.entities.ObjectAuditLog).entries({
            ID: cds.utils.uuid(),
            objectType: data.objectType || 'LEAD_ATTACHMENT',
            v1ObjectID: data.v1ObjectID,
            v1DisplayId: data.v1DisplayId,
            v2ObjectID: data.v2ObjectID,
            v2DisplayId: data.v2DisplayId,
            // Parent reference - uses displayId (preserved by DTT)
            parentDisplayId: data.parentDisplayId,
            parentV2ObjectID: data.parentV2ObjectID,
            // Attachment metadata
            fileName: data.fileName,
            fileSize: data.fileSize,
            mimeType: data.mimeType,
            contentHash: data.contentHash,
            categoryCode: data.categoryCode,
            migrationMode: data.migrationMode,
            recordSource: data.recordSource || 'CREATED',
            runId: data.runId,
            downloadDurationMs: data.downloadDurationMs,
            uploadDurationMs: data.uploadDurationMs
        });
    }

    /**
     * Save failed migration to ObjectFailedRecord (generic)
     * Uses parentDisplayId (preserved by DTT, same in V1 & V2)
     */
    async saveObjectFailed(data) {
        await this.init();
        try {
            const record = {
                ID: cds.utils.uuid(),
                objectType: data.objectType || 'LEAD_ATTACHMENT',
                v1ObjectID: data.v1ObjectID,
                v1DisplayId: data.v1DisplayId,
                // Parent reference - uses displayId (preserved by DTT)
                parentDisplayId: data.parentDisplayId,
                fileName: data.fileName,
                fileSize: data.fileSize,
                mimeType: data.mimeType,
                errorStep: data.errorStep || 'UNKNOWN',
                errorMessage: (data.errorMessage || '').substring(0, 500),
                errorDetails: data.errorDetails,
                runId: data.runId
            };
            await INSERT.into(this.entities.ObjectFailedRecord).entries(record);
            console.log(`[CheckpointService] Saved failed record: ${data.fileName} (step: ${record.errorStep})`);
        } catch (err) {
            console.error(`[CheckpointService] ERROR saving failed record: ${err.message}`, {
                fileName: data.fileName,
                errorStep: data.errorStep,
                originalError: data.errorMessage
            });
            // Re-throw to ensure caller knows the save failed
            throw err;
        }
    }

    // Lead Attachment methods - use parentDisplayId (preserved by DTT)
    async saveLeadAttachmentSuccess(data) {
        return this.saveObjectSuccess({
            objectType: 'LEAD_ATTACHMENT',
            v1ObjectID: data.v1AttachmentID,
            v1DisplayId: data.v1AttachmentID,
            v2ObjectID: data.v2AttachmentID,
            // Use parentDisplayId (same in V1 and V2, preserved by DTT)
            parentDisplayId: data.parentDisplayId,
            parentV2ObjectID: data.parentV2ObjectID,
            fileName: data.attachmentName,
            fileSize: data.attachmentSize,
            mimeType: data.mimeType,
            contentHash: data.contentHash,
            migrationMode: data.mode,
            runId: data.runId,
            downloadDurationMs: data.downloadDurationMs,
            uploadDurationMs: data.uploadDurationMs
        });
    }

    async saveLeadAttachmentFailed(data) {
        return this.saveObjectFailed({
            objectType: 'LEAD_ATTACHMENT',
            v1ObjectID: data.v1AttachmentID,
            v1DisplayId: data.v1AttachmentID,
            // Use parentDisplayId (same in V1 and V2, preserved by DTT)
            parentDisplayId: data.parentDisplayId,
            fileName: data.attachmentName,
            errorStep: data.errorStep,
            errorMessage: data.errorMessage,
            runId: data.runId
        });
    }

    async getCheckpoint(objectType = DEFAULT_OBJECT_TYPE) {
        await this.init();
        return await SELECT.one.from(this.entities.Checkpoint).where({ objectType });
    }

    async getUnresolvedFailedCount(objectType = DEFAULT_OBJECT_TYPE) {
        await this.init();
        const r = await SELECT.one
            .from(this.entities.ObjectFailedRecord)
            .columns('count(*) as count')
            .where({ objectType, resolvedAt: null });
        return r?.count || 0;
    }

    async getPendingQueueCount(objectType = DEFAULT_OBJECT_TYPE) {
        await this.init();
        const r = await SELECT.one
            .from(this.entities.ObjectQueue)
            .columns('count(*) as count')
            .where({ objectType, status: 'PENDING' });
        return r?.count || 0;
    }

    /**
     * Get parent migration status
     * @param {string} objectType - e.g., LEAD_ATTACHMENT
     * @param {string} parentDisplayId - Lead/Ticket displayId (same in V1 and V2)
     */
    async getParentMigrationStatus(objectType, parentDisplayId) {
        await this.init();
        return await SELECT.one
            .from(this.entities.ParentMigrationStatus)
            .where({ objectType, parentDisplayId });
    }

    /**
     * Update or create parent migration status
     * Used to track which parents exist in V2 and their attachment migration progress
     * 
     * @param {Object} data - { objectType, parentDisplayId, parentV2ObjectID, v2Validated, ... }
     */
    async updateParentMigrationStatus(data) {
        await this.init();
        const existing = await this.getParentMigrationStatus(data.objectType, data.parentDisplayId);
        
        if (existing) {
            const updates = { modifiedAt: new Date() };
            if (data.parentV2ObjectID !== undefined) updates.parentV2ObjectID = data.parentV2ObjectID;
            if (data.v2Validated !== undefined) updates.v2Validated = data.v2Validated;
            if (data.attachmentsMigrated !== undefined) updates.attachmentsMigrated = data.attachmentsMigrated;
            if (data.attachmentsPending !== undefined) updates.attachmentsPending = data.attachmentsPending;
            if (data.attachmentsFailed !== undefined) updates.attachmentsFailed = data.attachmentsFailed;
            if (data.lastProcessedAt !== undefined) updates.lastProcessedAt = data.lastProcessedAt;
            
            await UPDATE(this.entities.ParentMigrationStatus)
                .set(updates)
                .where({ objectType: data.objectType, parentDisplayId: data.parentDisplayId });
        } else {
            await INSERT.into(this.entities.ParentMigrationStatus).entries({
                objectType: data.objectType,
                parentDisplayId: data.parentDisplayId,
                parentV2ObjectID: data.parentV2ObjectID,
                v2Validated: data.v2Validated ?? false,
                attachmentsMigrated: data.attachmentsMigrated || 0,
                attachmentsPending: data.attachmentsPending || 0,
                attachmentsFailed: data.attachmentsFailed || 0,
                lastProcessedAt: data.lastProcessedAt
            });
        }
    }

    /**
     * Increment attachment counts on parent migration status
     */
    async incrementParentAttachmentCounts(objectType, parentDisplayId, { migrated = 0, failed = 0 }) {
        await this.init();
        const existing = await this.getParentMigrationStatus(objectType, parentDisplayId);
        
        if (existing) {
            await UPDATE(this.entities.ParentMigrationStatus)
                .set({
                    attachmentsMigrated: (existing.attachmentsMigrated || 0) + migrated,
                    attachmentsFailed: (existing.attachmentsFailed || 0) + failed,
                    lastProcessedAt: new Date(),
                    modifiedAt: new Date()
                })
                .where({ objectType, parentDisplayId });
        }
    }

    async getBatchConfig(objectType = DEFAULT_OBJECT_TYPE) {
        await this.init();
        return await SELECT.one.from(this.entities.BatchConfig).where({ objectType });
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // RETRY SUPPORT METHODS
    // ═══════════════════════════════════════════════════════════════════════════════

    /**
     * Get a specific failed record by ID
     */
    async getFailedRecordById(recordId) {
        await this.init();
        return await SELECT.one.from(this.entities.ObjectFailedRecord).where({ ID: recordId });
    }

    /**
     * Get all unresolved failed records for an object type
     * @param {string} objectType - e.g., 'LEAD_ATTACHMENT'
     * @param {number} limit - Max records to return (default 100)
     */
    async getUnresolvedFailedRecords(objectType = DEFAULT_OBJECT_TYPE, limit = 100) {
        await this.init();
        return await SELECT.from(this.entities.ObjectFailedRecord)
            .where({ objectType, resolvedAt: null })
            .orderBy('retryCount asc', 'createdAt asc')
            .limit(limit);
    }

    /**
     * Mark a failed record as resolved (successfully retried)
     */
    async resolveFailedRecord(recordId, resolvedRunId = null) {
        await this.init();
        await UPDATE(this.entities.ObjectFailedRecord)
            .set({
                resolvedAt: new Date(),
                resolvedRunId,
                modifiedAt: new Date()
            })
            .where({ ID: recordId });
    }

    /**
     * Increment retry count on a failed record
     */
    async incrementRetryCount(recordId, newErrorMessage = null) {
        await this.init();
        const record = await this.getFailedRecordById(recordId);
        if (!record) return;

        const updates = {
            retryCount: (record.retryCount || 0) + 1,
            modifiedAt: new Date()
        };
        if (newErrorMessage) {
            updates.errorMessage = newErrorMessage.substring(0, 500);
        }

        await UPDATE(this.entities.ObjectFailedRecord)
            .set(updates)
            .where({ ID: recordId });
    }

    /**
     * Delete a failed record (after successful retry)
     */
    async deleteFailedRecord(recordId) {
        await this.init();
        await DELETE.from(this.entities.ObjectFailedRecord).where({ ID: recordId });
    }
}

module.exports = new CheckpointService();
