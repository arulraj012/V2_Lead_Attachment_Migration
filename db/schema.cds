/**
 * Migration Framework Schema - Reusable entities for V1 to V2 data migration
 */
namespace migration;

// TYPES & ENUMS (Reusable)
type MigrationStatus : String(20) enum { IDLE; RUNNING; COMPLETED; FAILED; PAUSED; }
type ObjectType : String(40) enum { LEAD_ATTACHMENT; LEAD; TICKET; ACCOUNT; CONTACT; }
type MigrationMode : String(30) enum { FULL; DELTA; ATTACHMENT_ONLY; DTT_COMPLEMENT; }
type ErrorStep : String(50) enum { FETCH_V1; FIND_TARGET; CREATE_TARGET; DOWNLOAD; UPLOAD; }
type TriggerSource : String(50) enum { BTP_JOB; CPI; UI; SCHEDULER; API; }
type RecordSource : String(20) enum { CREATED; DTT; IMPORTED; EXISTING; }

// ASPECTS (Reusable Mixins)
aspect timestamped { createdAt : Timestamp @cds.on.insert: $now; modifiedAt : Timestamp @cds.on.insert: $now @cds.on.update: $now; }
aspect v1Source { v1ObjectID : String(40); v1DisplayId : String(40); v1ObjectData : LargeString; }
aspect v2Target { v2ObjectID : String(40); v2DisplayId : String(40); }
aspect errorTracked { errorStep : ErrorStep; errorMessage : String(500); errorDetails : LargeString; retryCount : Integer default 0; }
aspect attachmentMeta { attachmentName : String(255); attachmentSize : Integer64; mimeType : String(100); categoryCode : String(20); }
aspect parentRef { parentObjectType : ObjectType; parentV1ObjectID : String(40); parentV2ObjectID : String(40); }

// BASE ENTITIES (Generic Migration Tracking)
entity Checkpoint {
    key objectType : ObjectType; lastRunAt : Timestamp; lastSuccessAt : Timestamp;
    status : MigrationStatus default 'IDLE'; totalMigrated : Integer default 0;
    lastRunId : UUID; lastRunMode : MigrationMode;
    lastRunMigrated : Integer default 0; lastRunFailed : Integer default 0; lastRunDurationMs : Integer default 0;
}

entity FailedRecord : timestamped, v1Source, errorTracked {
    key ID : UUID; objectType : ObjectType; resolvedAt : Timestamp; runId : UUID;
}

entity AuditLog : timestamped, v1Source, v2Target {
    key ID : UUID; objectType : ObjectType; migrationMode : MigrationMode; recordSource : RecordSource default 'CREATED'; runId : UUID;
}

entity RunHistory {
    key runId : UUID; objectType : ObjectType; mode : MigrationMode; status : MigrationStatus;
    startedAt : Timestamp; completedAt : Timestamp;
    migrated : Integer default 0; failed : Integer default 0; skipped : Integer default 0; durationMs : Integer default 0;
    errorMessage : String(500); triggeredBy : TriggerSource default 'BTP_JOB'; filterCriteria : LargeString;
}

entity BatchConfig {
    key objectType : ObjectType; batchSize : Integer default 10; maxRecordsPerRun : Integer default 500;
    delayBetweenBatches : Integer default 1000; delayBetweenRecords : Integer default 200;
    isActive : Boolean default true; updatedAt : Timestamp;
}

entity MappingConfig : timestamped {
    key objectType : ObjectType; key mappingType : String(50);
    mappings : LargeString; description : String(255); isActive : Boolean default true;
}

// LEAD ATTACHMENT ENTITIES (Specific)
entity LeadAttachmentAuditLog : timestamped, v1Source, v2Target, attachmentMeta, parentRef {
    key ID : UUID; v1AttachmentID : String(40); v1FolderID : String(40);
    v2AttachmentID : String(40); migrationMode : MigrationMode; runId : UUID;
    contentHash : String(64); downloadDurationMs : Integer; uploadDurationMs : Integer;
}

entity LeadAttachmentFailedRecord : timestamped, v1Source, errorTracked, attachmentMeta, parentRef {
    key ID : UUID; v1AttachmentID : String(40); v1FolderID : String(40);
    resolvedAt : Timestamp; resolvedBy : String(100); resolutionNote : String(500); runId : UUID;
}

entity LeadMigrationMapping : timestamped {
    key v1LeadObjectID : String(40); v1LeadDisplayId : String(40);
    v2LeadObjectID : String(40); v2LeadDisplayId : String(40);
    mappingSource : RecordSource; isValidated : Boolean default false;
    attachmentsMigrated : Integer default 0; attachmentsPending : Integer default 0; attachmentsFailed : Integer default 0;
}

entity LeadAttachmentQueue : timestamped, attachmentMeta {
    key ID : UUID; v1LeadObjectID : String(40); v1LeadDisplayId : String(40);
    v1AttachmentID : String(40); v1FolderID : String(40);
    v2LeadObjectID : String(40); v2LeadDisplayId : String(40);
    status : String(20) default 'PENDING'; priority : Integer default 5;
    assignedRunId : UUID; processedAt : Timestamp; errorStep : ErrorStep; errorMessage : String(500);
}

// VIEWS
view UnresolvedFailedAttachments as select from LeadAttachmentFailedRecord { * } where resolvedAt is null;
view PendingAttachments as select from LeadAttachmentQueue { * } where status = 'PENDING' order by priority asc, createdAt asc;
view LeadAttachmentSummary as select from LeadMigrationMapping { key v1LeadObjectID, v1LeadDisplayId, v2LeadDisplayId, attachmentsMigrated, attachmentsPending, attachmentsFailed };
