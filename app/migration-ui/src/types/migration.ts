// Migration status types matching the CAP backend
export type MigrationStatusType = 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED';
export type ErrorStep = 'FETCH_V1' | 'FIND_TARGET' | 'CREATE_TARGET' | 'DOWNLOAD' | 'UPLOAD' | 'TRANSFORM' | 'VALIDATE' | 'CREATE_DOCUMENT_METADATA' | 'UPLOAD_TO_S3' | 'VERIFY_DOCUMENT' | 'LINK_DOCUMENT' | 'UNKNOWN';
export type RunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface MigrationStatus {
  status: MigrationStatusType;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  totalMigrated: number;
  pendingFailed: number;
  isActive: boolean;
  lastRunId: string | null;
  lastRunMode: string | null;
  lastRunMigrated: number;
  lastRunFailed: number;
  lastRunDurationMs: number;
  leadsWithPending?: number;
}

export interface LeadAttachmentFailedRecord {
  ID: string;
  v1ObjectID: string;
  v1DisplayId: string;
  fileName: string;         // renamed from attachmentName in schema
  fileSize: number;         // renamed from attachmentSize in schema
  mimeType: string;
  parentDisplayId: string;  // Same in V1 and V2 (DTT preserves it)
  errorStep: ErrorStep;
  errorMessage: string;
  retryCount: number;
  createdAt: string;
  resolvedAt: string | null;
  // Legacy aliases for backward compatibility in UI
  attachmentName?: string;
  attachmentSize?: number;
}

export interface LeadAttachmentAuditLog {
  ID: string;
  v1ObjectID: string;
  v1DisplayId: string;
  v2ObjectID: string | null;  // null for skipped attachments
  v2DisplayId: string | null;
  parentDisplayId: string;    // Lead ID (same in V1 and V2)
  fileName: string;
  fileSize: number;
  mimeType: string;
  migrationMode: string;
  recordSource: string;       // CREATED, EXISTS_IN_V2, etc.
  createdAt: string;
}

export interface LeadMigrationMapping {
  v1LeadObjectID: string;
  v1LeadDisplayId: string;
  v2LeadObjectID: string;
  v2LeadDisplayId: string;
  mappingSource: string;
  isValidated: boolean;
  migrated: number;
  pending: number;
  failed: number;
}

export interface RunHistory {
  runId: string;
  objectType: string;
  mode: string;
  status: RunStatus;
  startedAt: string;
  completedAt: string | null;
  migrated: number;
  failed: number;
  skipped: number;
  durationMs: number;
  errorMessage: string | null;
  triggeredBy: string;
}

export interface ODataResponse<T> {
  value: T[];
  '@odata.count'?: number;
}

export interface BatchConfig {
  // Actually used settings (in MigrationJob.js)
  maxLeadsPerRun: number;         // Leads to process per job run (default: 50)
  attachmentConcurrency: number;  // Parallel attachment uploads per lead (default: 5)
  delayBetweenLeads: number;      // Ms delay between leads for API throttling (default: 500)
  delayBetweenAttachments: number; // Ms delay between attachments (default: 100)
  // Legacy/DB-backed settings (kept for backward compatibility)
  batchSize?: number;
  maxRecordsPerRun?: number;
  delayBetweenBatches?: number;
  delayBetweenRecords?: number;
  isActive?: boolean;
}

/**
 * Options for triggering migration with filters
 */
export interface MigrationTriggerOptions {
  objectType?: string;      // LEAD_ATTACHMENT, TICKET_ATTACHMENT, etc.
  mode?: string;            // FULL, DELTA, ATTACHMENT_ONLY
  parentId?: string;        // V1 Lead ID (displayId) - filter specific lead
  createdFrom?: string;     // ISO date YYYY-MM-DD - filter by creation date
  createdTo?: string;       // ISO date YYYY-MM-DD - filter by creation date
  maxRecords?: number;      // Limit records (for testing)
}

/**
 * Response from migration trigger
 */
export interface MigrationTriggerResponse {
  status: 'accepted' | 'busy' | 'error';
  runId?: string;
  message: string;
  objectType?: string;
  currentRunId?: string;    // When status is 'busy'
}
