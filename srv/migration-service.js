const cds = require('@sap/cds');
const { runMigration, getBatchConfig, setBatchConfig, OBJECT_TYPE } = require('./migration/MigrationJob');
const checkpoint = require('./migration/CheckpointService');

class MigrationService extends cds.ApplicationService {
    async init() {
        this.on('triggerRun', this.handleTriggerRun.bind(this));
        this.on('getStatus', this.handleGetStatus.bind(this));
        this.on('retryFailed', this.handleRetryFailed.bind(this));
        this.on('retryAllFailed', this.handleRetryAllFailed.bind(this));
        this.on('testMigration', this.handleTestMigration.bind(this));
        this.on('getBatchConfig', this.handleGetBatchConfig.bind(this));
        this.on('updateBatchConfig', this.handleUpdateBatchConfig.bind(this));
        this.on('runMigration', this.handleRunMigration.bind(this));
        this.on('importLeadMappings', this.handleImportLeadMappings.bind(this));
        this.on('refreshLeadMappings', this.handleRefreshLeadMappings.bind(this));
        await super.init();
    }

    async handleTriggerRun(req) {
        const { mode, leadId, createdFrom, createdTo, maxRecords } = req.data;
        const filters = {};
        if (leadId) filters.leadId = leadId;
        if (createdFrom) filters.createdFrom = createdFrom;
        if (createdTo) filters.createdTo = createdTo;
        if (maxRecords) filters.maxRecords = maxRecords;

        const lockResult = await checkpoint.tryAcquireLock(mode || 'ATTACHMENT_ONLY', OBJECT_TYPE, 'UI');
        if (!lockResult.acquired) {
            return JSON.stringify({ status: 'busy', message: 'Migration already running', currentRunId: lockResult.currentRun?.runId });
        }

        const runId = lockResult.runId;
        (async () => {
            try {
                await runMigration(filters, runId);
            } catch (err) {
                console.error(`[MigrationService] Run ${runId} failed: ${err.message}`);
            }
        })();

        return JSON.stringify({ status: 'accepted', runId, message: 'Migration started' });
    }

    async handleGetStatus() {
        const cp = await checkpoint.getCheckpoint(OBJECT_TYPE);
        const pendingFailed = await checkpoint.getUnresolvedFailedCount();
        
        return {
            status: cp?.status || 'IDLE',
            lastRunAt: cp?.lastRunAt,
            lastSuccessAt: cp?.lastSuccessAt,
            totalMigrated: cp?.totalMigrated || 0,
            pendingFailed,
            isActive: true,
            lastRunId: cp?.lastRunId,
            lastRunMode: cp?.lastRunMode,
            lastRunMigrated: cp?.lastRunMigrated || 0,
            lastRunFailed: cp?.lastRunFailed || 0,
            lastRunDurationMs: cp?.lastRunDurationMs || 0
        };
    }

    async handleRetryFailed(req) {
        return JSON.stringify({ status: 'not_implemented', message: 'Retry functionality coming soon' });
    }

    async handleRetryAllFailed(req) {
        return JSON.stringify({ status: 'not_implemented', message: 'Retry all functionality coming soon' });
    }

    async handleTestMigration(req) {
        const { leadId, maxRecords } = req.data;
        return this.handleTriggerRun({ data: { mode: 'ATTACHMENT_ONLY', leadId, maxRecords: maxRecords || 5 } });
    }

    async handleGetBatchConfig() {
        const config = getBatchConfig();
        const dbConfig = await checkpoint.getBatchConfig(OBJECT_TYPE);
        return JSON.stringify({ ...config, ...dbConfig });
    }

    async handleUpdateBatchConfig(req) {
        const { batchSize, maxRecordsPerRun, delayBetweenBatches, delayBetweenRecords, isActive } = req.data;
        setBatchConfig({ batchSize, maxRecordsPerRun, delayBetweenBatches, delayBetweenRecords });
        return JSON.stringify({ status: 'updated', config: getBatchConfig() });
    }

    async handleRunMigration(req) {
        return this.handleTriggerRun({ data: { ...req.data, triggeredBy: 'BTP_JOB' } });
    }

    async handleImportLeadMappings(req) {
        return JSON.stringify({ status: 'not_implemented', message: 'Import mappings coming soon' });
    }

    async handleRefreshLeadMappings(req) {
        return JSON.stringify({ status: 'not_implemented', message: 'Refresh mappings coming soon' });
    }
}

module.exports = MigrationService;
