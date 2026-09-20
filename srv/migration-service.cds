using { migration } from '../db/schema';

/**
 * MigrationService - CAP service for V1 to V2 Lead Attachment migration
 * Provides read access to migration entities and actions for job control
 */
@path: '/migration'
@requires: 'authenticated-user'
service MigrationService {

    // Base Migration Entities
    @readonly entity Checkpoint     as projection on migration.Checkpoint;
    @readonly entity FailedRecord   as projection on migration.FailedRecord;
    @readonly entity AuditLog       as projection on migration.AuditLog;
    @readonly entity RunHistory     as projection on migration.RunHistory;
    @readonly entity BatchConfig    as projection on migration.BatchConfig;
    @readonly entity MappingConfig  as projection on migration.MappingConfig;

    // Lead Attachment Specific Entities
    @readonly entity LeadAttachmentAuditLog     as projection on migration.LeadAttachmentAuditLog;
    @readonly entity LeadAttachmentFailedRecord as projection on migration.LeadAttachmentFailedRecord;
    @readonly entity LeadMigrationMapping       as projection on migration.LeadMigrationMapping;
    @readonly entity LeadAttachmentQueue        as projection on migration.LeadAttachmentQueue;
    
    // Views
    @readonly entity UnresolvedFailedAttachments as projection on migration.UnresolvedFailedAttachments;
    @readonly entity PendingAttachments          as projection on migration.PendingAttachments;
    @readonly entity LeadAttachmentSummary       as projection on migration.LeadAttachmentSummary;

    // ============================================
    // Migration Job Control Actions
    // ============================================
    
    /**
     * Trigger an immediate migration run
     * @param mode Migration mode: 'FULL', 'DELTA', 'ATTACHMENT_ONLY'
     * @param leadId V1 Lead ID filter (human-readable ID)
     * @param createdFrom Filter leads created on or after this date
     * @param createdTo Filter leads created on or before this date
     * @param maxRecords Maximum records to process (for testing)
     * @returns Summary message of migration results
     */
    action triggerRun(
        mode        : String default 'ATTACHMENT_ONLY',
        leadId      : String,
        createdFrom : Date,
        createdTo   : Date,
        maxRecords  : Integer
    ) returns String;

    /**
     * Get current migration status and statistics
     */
    function getStatus() returns {
        status            : String;
        lastRunAt         : Timestamp;
        lastSuccessAt     : Timestamp;
        totalMigrated     : Integer;
        pendingFailed     : Integer;
        isActive          : Boolean;
        lastRunId         : UUID;
        lastRunMode       : String;
        lastRunMigrated   : Integer;
        lastRunFailed     : Integer;
        lastRunDurationMs : Integer;
        // Attachment specific
        pendingInQueue    : Integer;
        leadsWithPending  : Integer;
    };

    /**
     * Retry a specific failed record
     */
    action retryFailed(recordId : UUID) returns String;

    /**
     * Retry all unresolved failed records
     */
    action retryAllFailed() returns String;

    /**
     * Test migration with limited records
     */
    action testMigration(
        leadId     : String,
        maxRecords : Integer default 5
    ) returns String;

    // ============================================
    // Lead Mapping Management
    // ============================================

    /**
     * Import V1 to V2 Lead mappings (for DTT-migrated leads)
     * @param mappings JSON array of {v1LeadId, v2LeadId} pairs
     */
    action importLeadMappings(mappings : String) returns String;

    /**
     * Refresh lead mappings by querying V2 system
     * Finds V2 leads that have matching V1 displayIds
     */
    action refreshLeadMappings(leadIdPattern : String) returns String;

    /**
     * Queue attachments for a specific lead
     */
    action queueLeadAttachments(v1LeadId : String) returns String;

    /**
     * Queue all attachments for leads with existing mappings
     */
    action queueAllAttachments() returns String;

    // ============================================
    // Configuration Management
    // ============================================

    /**
     * Get current batch configuration
     */
    function getBatchConfig() returns String;

    /**
     * Update batch configuration
     */
    action updateBatchConfig(
        batchSize           : Integer,
        maxRecordsPerRun    : Integer,
        delayBetweenBatches : Integer,
        delayBetweenRecords : Integer,
        isActive            : Boolean
    ) returns String;

    /**
     * Get field mapping configuration
     */
    function getMappingConfig() returns String;

    /**
     * Update field mapping configuration
     */
    action updateMappingConfig(
        mappingType : String,
        mappings    : String
    ) returns String;

    // ============================================
    // CPI / BTP Job Scheduling Service Endpoint
    // ============================================

    /**
     * CPI trigger endpoint - fire and forget
     * Returns 202 immediately, migration runs in background
     */
    @requires: 'MigrationJob'
    action runMigration(
        mode        : String default 'ATTACHMENT_ONLY',
        leadId      : String,
        createdFrom : Date,
        createdTo   : Date,
        maxRecords  : Integer
    ) returns String;
}
