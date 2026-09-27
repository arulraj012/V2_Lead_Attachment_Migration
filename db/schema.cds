/**
 * Migration Framework Schema - Attachment Migration from V1 to V2
 * 
 * NOTE: Parent objects (Lead, Ticket, Account, etc.) are migrated via DTT tool.
 *       DTT preserves displayId, so V1 LeadID = V2 displayId.
 *       This tool migrates ATTACHMENTS only, using the preserved displayId for lookup.
 */
namespace migration;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & ENUMS
// ═══════════════════════════════════════════════════════════════════════════════

type MigrationStatus : String(20) enum { IDLE; RUNNING; COMPLETED; FAILED; PAUSED; }

/** 
 * ObjectType - Types of objects this tool can migrate (attachments only)
 * Parent types (LEAD, TICKET, etc.) are for reference only - migrated via DTT
 */
type ObjectType : String(40) enum { 
    // Attachment types - what this tool migrates
    LEAD_ATTACHMENT; 
    TICKET_ATTACHMENT; 
    ACCOUNT_ATTACHMENT;
    CONTACT_ATTACHMENT;
    OPPORTUNITY_ATTACHMENT;
}

type MigrationMode : String(30) enum { FULL; DELTA; ATTACHMENT_ONLY; DTT_COMPLEMENT; RETRY; }
type ErrorStep : String(50) enum { 
    FETCH_V1; 
    FIND_TARGET; 
    CREATE_TARGET; 
    DOWNLOAD; 
    UPLOAD; 
    TRANSFORM; 
    VALIDATE;
    // V2 Document Service specific steps
    CREATE_DOCUMENT_METADATA;
    UPLOAD_TO_S3;
    VERIFY_DOCUMENT;
    LINK_DOCUMENT;
    // Generic/fallback
    UNKNOWN;
}
type TriggerSource : String(50) enum { BTP_JOB; CPI; UI; SCHEDULER; API; RETRY; }
type RecordSource : String(20) enum { CREATED; DTT; IMPORTED; EXISTING; MANUAL; }
type QueueStatus : String(20) enum { PENDING; PROCESSING; COMPLETED; FAILED; SKIPPED; CANCELLED; }

// ═══════════════════════════════════════════════════════════════════════════════
// ASPECTS (Reusable Mixins)
// ═══════════════════════════════════════════════════════════════════════════════

aspect timestamped { 
    createdAt  : Timestamp @cds.on.insert: $now; 
    modifiedAt : Timestamp @cds.on.insert: $now @cds.on.update: $now; 
}

aspect v1Source { 
    v1ObjectID   : String(40);
    v1DisplayId  : String(40);
    v1ObjectData : LargeString;
}

aspect v2Target { 
    v2ObjectID  : String(40);
    v2DisplayId : String(40);
}

aspect errorTracked { 
    errorStep    : ErrorStep; 
    errorMessage : String(500); 
    errorDetails : LargeString; 
    retryCount   : Integer default 0; 
}

/** 
 * Parent reference - Links attachment to its parent object (Lead, Ticket, etc.)
 * Since DTT preserves displayId: parentDisplayId is same in V1 and V2
 */
aspect parentRef { 
    parentDisplayId   : String(40);  // Same in V1 and V2 (DTT preserves it)
    parentV2ObjectID  : String(40);  // V2 internal UUID (for caching/optimization)
}

aspect attachmentMeta { 
    fileName     : String(255);
    fileSize     : Integer64;
    mimeType     : String(100); 
    categoryCode : String(20);
    contentHash  : String(64);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BASE ENTITIES (Generic Migration Infrastructure)
// ═══════════════════════════════════════════════════════════════════════════════

entity Checkpoint {
    key objectType            : ObjectType;
    lastRunAt                 : Timestamp;
    lastSuccessAt             : Timestamp;
    status                    : MigrationStatus default 'IDLE';
    totalMigrated             : Integer default 0;
    
    // Cursor fields for keyset pagination
    cursorLeadId              : String(40);       // Last processed Lead ID
    cursorCreationDateTime    : Timestamp;        // Last processed Lead's CreationDateTime
    cursorPosition            : Integer default 0; // Total leads processed (for progress %)
    
    // Run configuration (persisted for resume)
    filterCreatedFrom         : Date;             // Date range start
    filterCreatedTo           : Date;             // Date range end
    totalLeadsInRange         : Integer;          // For progress calculation
    
    lastRunId            : UUID;
    lastRunMode          : MigrationMode;
    lastRunMigrated      : Integer default 0;
    lastRunFailed        : Integer default 0;
    lastRunSkipped       : Integer default 0;
    lastRunDurationMs    : Integer default 0;
}

entity RunHistory : timestamped {
    key runId        : UUID;
    objectType       : ObjectType;
    mode             : MigrationMode;
    status           : MigrationStatus;
    startedAt        : Timestamp;
    completedAt      : Timestamp;
    migrated         : Integer default 0;
    failed           : Integer default 0;
    skipped          : Integer default 0;
    durationMs       : Integer default 0;
    errorMessage     : String(500);
    triggeredBy      : TriggerSource default 'BTP_JOB';
    filterCriteria   : LargeString;
}

entity BatchConfig : timestamped {
    key objectType        : ObjectType;
    batchSize             : Integer default 10;
    maxRecordsPerRun      : Integer default 500;
    delayBetweenBatches   : Integer default 1000;
    delayBetweenRecords   : Integer default 200;
    isActive              : Boolean default true;
    retryMaxAttempts      : Integer default 3;
    retryDelayMs          : Integer default 5000;
}

entity MappingConfig : timestamped {
    key objectType  : ObjectType;
    key mappingType : String(50);
    mappings        : LargeString;
    description     : String(255);
    isActive        : Boolean default true;
    version         : String(20);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERIC MIGRATION ENTITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ObjectAuditLog - Audit trail for ALL migrated objects
 * 
 * Examples:
 *   - Lead attachment: objectType='LEAD_ATTACHMENT', v1ObjectID=attachmentId, parentObjectType='LEAD'
 *   - Lead record:     objectType='LEAD', v1ObjectID=leadId, parentObjectType=null
 */
entity ObjectAuditLog : timestamped, v1Source, v2Target, parentRef, attachmentMeta {
    key ID              : UUID;
    objectType          : ObjectType @mandatory;
    migrationMode       : MigrationMode;
    recordSource        : RecordSource default 'CREATED';
    runId               : UUID;
    downloadDurationMs  : Integer;
    uploadDurationMs    : Integer;
    transformDurationMs : Integer;
}

/**
 * ObjectFailedRecord - Failed migration records for ANY object type
 */
entity ObjectFailedRecord : timestamped, v1Source, errorTracked, parentRef, attachmentMeta {
    key ID              : UUID;
    objectType          : ObjectType @mandatory;
    runId               : UUID;
    resolvedAt          : Timestamp;
    resolvedBy          : String(100);
    resolutionNote      : String(500);
    resolvedRunId       : UUID;
}

/**
 * ObjectQueue - Queue for pending migrations (any object type)
 */
entity ObjectQueue : timestamped, v1Source, parentRef, attachmentMeta {
    key ID              : UUID;
    objectType          : ObjectType @mandatory;
    status              : QueueStatus default 'PENDING';
    priority            : Integer default 5;
    assignedRunId       : UUID;
    processedAt         : Timestamp;
    attemptCount        : Integer default 0;
    errorStep           : ErrorStep;
    errorMessage        : String(500);
    nextRetryAt         : Timestamp;
}

/**
 * ParentMigrationStatus - Track which parents have been processed for attachment migration
 * NOT for ID mapping (DTT preserves IDs) - just for tracking progress
 */
/** Lead processing status for cursor-based migration */
type LeadProcessingStatus : String(20) enum { PENDING; PROCESSING; COMPLETED; FAILED; SKIPPED; }

entity ParentMigrationStatus : timestamped {
    key objectType      : ObjectType;           // e.g., LEAD_ATTACHMENT
    key parentDisplayId : String(40);           // Lead/Ticket/Account displayId (same in V1 & V2)
    parentV2ObjectID    : String(40);           // Cached V2 UUID for performance
    v2Validated         : Boolean default false; // Confirmed parent exists in V2
    status              : LeadProcessingStatus default 'PENDING';  // Processing status
    attachmentsMigrated : Integer default 0;
    attachmentsPending  : Integer default 0;
    attachmentsFailed   : Integer default 0;
    attachmentsSkipped  : Integer default 0;    // Already existed in V2
    totalAttachments    : Integer default 0;    // Total attachments for this lead
    lastProcessedAt     : Timestamp;
    processedInRunId    : UUID;                 // Which run processed this lead
    v1CreationDateTime  : Timestamp;            // For cursor ordering
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIEWS
// ═══════════════════════════════════════════════════════════════════════════════

// Generic Views
view UnresolvedFailedRecords as 
    select from ObjectFailedRecord { * } 
    where resolvedAt is null;

view PendingQueueItems as 
    select from ObjectQueue { * } 
    where status = 'PENDING' 
    order by priority asc, createdAt asc;

view FailedQueueItems as 
    select from ObjectQueue { * } 
    where status = 'FAILED';

// Lead Attachment Views (convenience)
view LeadAttachmentAuditLog as 
    select from ObjectAuditLog { * } 
    where objectType = 'LEAD_ATTACHMENT';

view LeadAttachmentFailedRecords as 
    select from ObjectFailedRecord { * } 
    where objectType = 'LEAD_ATTACHMENT' and resolvedAt is null;

view LeadAttachmentQueue as 
    select from ObjectQueue { * } 
    where objectType = 'LEAD_ATTACHMENT' and status = 'PENDING'
    order by priority asc, createdAt asc;

view LeadMigrationProgress as 
    select from ParentMigrationStatus { 
        key parentDisplayId as leadDisplayId,
        parentV2ObjectID as v2LeadId,
        v2Validated as leadExistsInV2,
        attachmentsMigrated, 
        attachmentsPending, 
        attachmentsFailed,
        lastProcessedAt
    } where objectType = 'LEAD_ATTACHMENT';
