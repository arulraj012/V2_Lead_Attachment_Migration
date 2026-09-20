/**
 * CheckpointService - Manages migration checkpoint state and audit logging
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
                LeadAttachmentAuditLog: this.db.entities('migration').LeadAttachmentAuditLog,
                LeadAttachmentFailedRecord: this.db.entities('migration').LeadAttachmentFailedRecord,
                LeadMigrationMapping: this.db.entities('migration').LeadMigrationMapping
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

    async releaseLock(objectType, migrated, failed, durationMs) {
        await this.init();
        const now = new Date().toISOString();
        const cp = await SELECT.one.from(this.entities.Checkpoint).where({ objectType });
        
        await UPDATE(this.entities.Checkpoint).set({
            status: 'COMPLETED', lastSuccessAt: now, totalMigrated: (cp?.totalMigrated || 0) + migrated,
            lastRunMigrated: migrated, lastRunFailed: failed, lastRunDurationMs: durationMs
        }).where({ objectType });

        if (cp?.lastRunId) {
            await UPDATE(this.entities.RunHistory).set({ status: 'COMPLETED', completedAt: now, migrated, failed, durationMs }).where({ runId: cp.lastRunId });
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

    async saveLeadAttachmentSuccess(data) {
        await this.init();
        await INSERT.into(this.entities.LeadAttachmentAuditLog).entries({
            ID: cds.utils.uuid(), v1ObjectID: data.v1LeadObjectID, v1DisplayId: data.v1LeadDisplayId,
            v1AttachmentID: data.v1AttachmentID, v2ObjectID: data.v2LeadObjectID, v2DisplayId: data.v2LeadDisplayId,
            v2AttachmentID: data.v2AttachmentID, attachmentName: data.attachmentName, attachmentSize: data.attachmentSize,
            mimeType: data.mimeType, parentObjectType: 'LEAD', parentV1ObjectID: data.v1LeadObjectID,
            migrationMode: data.mode, runId: data.runId
        });
    }

    async saveLeadAttachmentFailed(data) {
        await this.init();
        await INSERT.into(this.entities.LeadAttachmentFailedRecord).entries({
            ID: cds.utils.uuid(), v1ObjectID: data.v1LeadObjectID, v1DisplayId: data.v1LeadDisplayId,
            v1AttachmentID: data.v1AttachmentID, attachmentName: data.attachmentName,
            parentObjectType: 'LEAD', parentV1ObjectID: data.v1LeadObjectID,
            errorStep: data.errorStep, errorMessage: (data.errorMessage || '').substring(0, 500), runId: data.runId
        });
    }

    async getCheckpoint(objectType = DEFAULT_OBJECT_TYPE) {
        await this.init();
        return await SELECT.one.from(this.entities.Checkpoint).where({ objectType });
    }

    async getUnresolvedFailedCount() {
        await this.init();
        const r = await SELECT.one.from(this.entities.LeadAttachmentFailedRecord).columns('count(*) as count').where({ resolvedAt: null });
        return r?.count || 0;
    }

    async getBatchConfig(objectType = DEFAULT_OBJECT_TYPE) {
        await this.init();
        return await SELECT.one.from(this.entities.BatchConfig).where({ objectType });
    }
}

module.exports = new CheckpointService();
