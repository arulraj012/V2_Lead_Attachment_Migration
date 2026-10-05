using { migration } from '../db/schema';

/**
 * MigrationService - CAP service for V1 to V2 Attachment migration
 * 
 * NOTE: Parent objects (Lead, Ticket, etc.) are migrated via DTT tool.
 *       DTT preserves displayId, so we use it to find V2 parents.
 *       This service migrates ATTACHMENTS only.
 */
@path: '/migration'
@requires: 'authenticated-user'
service MigrationService {

    // ═══════════════════════════════════════════════════════════════════════════
    // BASE ENTITIES
    // ═══════════════════════════════════════════════════════════════════════════
    
    @readonly entity Checkpoint     as projection on migration.Checkpoint;
    @readonly entity RunHistory     as projection on migration.RunHistory;
    @readonly entity BatchConfig    as projection on migration.BatchConfig;
    @readonly entity MappingConfig  as projection on migration.MappingConfig;

    // ═══════════════════════════════════════════════════════════════════════════
    // MIGRATION ENTITIES
    // ═══════════════════════════════════════════════════════════════════════════
    
    @readonly entity ObjectAuditLog          as projection on migration.ObjectAuditLog;
    @readonly entity ObjectFailedRecord      as projection on migration.ObjectFailedRecord;
    @readonly entity ObjectQueue             as projection on migration.ObjectQueue;
    @readonly entity ParentMigrationStatus   as projection on migration.ParentMigrationStatus;
    
    // ═══════════════════════════════════════════════════════════════════════════
    // GENERIC VIEWS
    // ═══════════════════════════════════════════════════════════════════════════
    
    @readonly entity UnresolvedFailedRecords as projection on migration.UnresolvedFailedRecords;
    @readonly entity PendingQueueItems       as projection on migration.PendingQueueItems;
    @readonly entity FailedQueueItems        as projection on migration.FailedQueueItems;

    // ═══════════════════════════════════════════════════════════════════════════
    // LEAD ATTACHMENT VIEWS
    // ═══════════════════════════════════════════════════════════════════════════
    
    @readonly entity LeadAttachmentAuditLog     as projection on migration.LeadAttachmentAuditLog;
    @readonly entity LeadAttachmentFailedRecords as projection on migration.LeadAttachmentFailedRecords;
    @readonly entity LeadAttachmentQueue        as projection on migration.LeadAttachmentQueue;
    @readonly entity LeadMigrationProgress      as projection on migration.LeadMigrationProgress;

    // ═══════════════════════════════════════════════════════════════════════════
    // MIGRATION JOB CONTROL ACTIONS
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Trigger an immediate migration run
     * @param objectType Type of object to migrate (LEAD_ATTACHMENT, TICKET_ATTACHMENT, etc.)
     * @param mode Migration mode: 'FULL', 'DELTA', 'ATTACHMENT_ONLY'
     * @param parentId V1 Parent ID filter (e.g., Lead ID for attachments)
     * @param createdFrom Filter records created on or after this date
     * @param createdTo Filter records created on or before this date
     * @param maxRecords Maximum records to process (for testing)
     * @returns Summary message of migration results
     */
    action triggerRun(
        objectType      : String default 'LEAD_ATTACHMENT',
        mode            : String default 'ATTACHMENT_ONLY',
        parentId        : String,
        createdFrom     : Date,
        createdTo       : Date,
        maxRecords      : Integer,
        maxLeadsPerRun  : Integer default 50,
        resetCursor     : Boolean default false
    ) returns String;

    /**
     * Get current migration status and statistics for an object type
     */
    function getStatus(objectType : String default 'LEAD_ATTACHMENT') returns {
        objectType        : String;
        status            : String;
        lastRunAt         : Timestamp;
        lastSuccessAt     : Timestamp;
        totalMigrated     : Integer;
        pendingFailed     : Integer;
        pendingInQueue    : Integer;
        isActive          : Boolean;
        lastRunId         : UUID;
        lastRunMode       : String;
        lastRunMigrated   : Integer;
        lastRunFailed     : Integer;
        lastRunSkipped    : Integer;
        lastRunDurationMs : Integer;
    };

    /**
     * Retry a specific failed record
     */
    action retryFailed(recordId : UUID) returns String;

    /**
     * Retry all unresolved failed records for an object type
     */
    action retryAllFailed(objectType : String default 'LEAD_ATTACHMENT') returns String;

    /**
     * Test migration with limited records
     * Supports same filters as triggerRun for targeted testing
     */
    action testMigration(
        objectType  : String default 'LEAD_ATTACHMENT',
        parentId    : String,
        createdFrom : Date,
        createdTo   : Date,
        maxRecords  : Integer default 5
    ) returns String;

    // ═══════════════════════════════════════════════════════════════════════════
    // PARENT VALIDATION & QUEUE MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Validate that parents exist in V2 system
     * Since DTT preserves displayId, this checks V2 by displayId
     * @param objectType Attachment type (LEAD_ATTACHMENT, TICKET_ATTACHMENT, etc.)
     * @param parentDisplayIds JSON array of parent displayIds to validate
     */
    action validateParentsInV2(
        objectType       : String default 'LEAD_ATTACHMENT',
        parentDisplayIds : String
    ) returns String;

    /**
     * Queue attachments for migration
     * @param objectType Type of attachment to queue (LEAD_ATTACHMENT, etc.)
     * @param parentDisplayId Optional: queue only for specific parent (Lead/Ticket displayId)
     * @param priority Queue priority (1=highest, 10=lowest)
     */
    action queueAttachments(
        objectType       : String default 'LEAD_ATTACHMENT',
        parentDisplayId  : String,
        priority         : Integer default 5
    ) returns String;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONFIGURATION MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Get batch configuration for an object type
     */
    function getBatchConfig(objectType : String default 'LEAD_ATTACHMENT') returns String;

    /**
     * Update batch configuration
     */
    action updateBatchConfig(
        objectType             : String default 'LEAD_ATTACHMENT',
        batchSize              : Integer,
        maxRecordsPerRun       : Integer,
        maxLeadsPerRun         : Integer default 50,
        attachmentConcurrency  : Integer default 5,
        delayBetweenBatches    : Integer,
        delayBetweenRecords    : Integer,
        delayBetweenLeads      : Integer,
        delayBetweenAttachments: Integer,
        isActive               : Boolean
    ) returns String;

    /**
     * Get field mapping configuration
     */
    function getMappingConfig(
        objectType  : String default 'LEAD_ATTACHMENT',
        mappingType : String default 'FIELD_MAPPING'
    ) returns String;

    /**
     * Update field mapping configuration
     */
    action updateMappingConfig(
        objectType  : String default 'LEAD_ATTACHMENT',
        mappingType : String default 'FIELD_MAPPING',
        mappings    : String,
        description : String
    ) returns String;

    // ═══════════════════════════════════════════════════════════════════════════
    // CPI / BTP JOB SCHEDULING ENDPOINT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * CPI trigger endpoint - fire and forget
     * Returns 202 immediately, migration runs in background
     */
    @requires: 'MigrationJob'
    action runMigration(
        objectType  : String default 'LEAD_ATTACHMENT',
        mode        : String default 'ATTACHMENT_ONLY',
        parentId    : String,
        createdFrom : Date,
        createdTo   : Date,
        maxRecords  : Integer
    ) returns String;
}
