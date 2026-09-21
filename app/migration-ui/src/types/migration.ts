// Migration status types matching the CAP backend
export type MigrationStatusType = 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED';
export type ErrorStep = 'FETCH_V1' | 'FIND_TARGET' | 'CREATE_TARGET' | 'DOWNLOAD' | 'UPLOAD' | 'UNKNOWN';
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
  pendingInQueue?: number;
  leadsWithPending?: number;
}

export interface LeadAttachmentFailedRecord {
  ID: string;
  v1ObjectID: string;
  v1DisplayId: string;
  v1AttachmentID: string;
  attachmentName: string;
  attachmentSize: number;
  mimeType: string;
  parentV1ObjectID: string;
  errorStep: ErrorStep;
  errorMessage: string;
  retryCount: number;
  createdAt: string;
  resolvedAt: string | null;
}

export interface LeadAttachmentAuditLog {
  ID: string;
  v1ObjectID: string;
  v1DisplayId: string;
  v1AttachmentID: string;
  v2ObjectID: string;
  v2DisplayId: string;
  v2AttachmentID: string;
  attachmentName: string;
  attachmentSize: number;
  mimeType: string;
  migrationMode: string;
  createdAt: string;
}

export interface LeadMigrationMapping {
  v1LeadObjectID: string;
  v1LeadDisplayId: string;
  v2LeadObjectID: string;
  v2LeadDisplayId: string;
  mappingSource: string;
  isValidated: boolean;
  attachmentsMigrated: number;
  attachmentsPending: number;
  attachmentsFailed: number;
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
  batchSize: number;
  maxRecordsPerRun: number;
  delayBetweenBatches: number;
  delayBetweenRecords: number;
  isActive: boolean;
}
