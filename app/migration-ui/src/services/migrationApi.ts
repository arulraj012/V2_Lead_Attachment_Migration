import type { MigrationStatus, LeadAttachmentFailedRecord, LeadAttachmentAuditLog, LeadMigrationMapping, RunHistory, ODataResponse, BatchConfig } from '../types/migration';
import { getHttpErrorMessage } from '../utils/apiError';

const BASE_URL = '/migration';

function buildODataQuery(params: Record<string, string>): string {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

async function fetchApi<T>(url: string, options: RequestInit = {}): Promise<T> {
  const isLocalhost = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(isLocalhost && { Authorization: 'Basic YWRtaW46YWRtaW4=' }),
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorMessage: string;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error?.message || getHttpErrorMessage(response.status);
    } catch {
      errorMessage = getHttpErrorMessage(response.status);
    }
    throw new Error(errorMessage);
  }

  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text);
}

// Status API
export async function getMigrationStatus(): Promise<MigrationStatus> {
  return fetchApi<MigrationStatus>(`${BASE_URL}/getStatus()`);
}

// Migration Actions
export async function triggerMigration(options: { mode?: string; leadId?: string; maxRecords?: number } = {}): Promise<{ status: string; runId?: string; message: string }> {
  const result = await fetchApi<{ value: string }>(`${BASE_URL}/triggerRun`, {
    method: 'POST',
    body: JSON.stringify(options),
  });
  return JSON.parse(result.value);
}

export async function retryFailed(recordId: string): Promise<string> {
  const result = await fetchApi<{ value: string }>(`${BASE_URL}/retryFailed`, {
    method: 'POST',
    body: JSON.stringify({ recordId }),
  });
  return result.value;
}

export async function retryAllFailed(): Promise<string> {
  const result = await fetchApi<{ value: string }>(`${BASE_URL}/retryAllFailed`, { method: 'POST' });
  return result.value;
}

// Failed Records API
export async function getFailedRecords(options: { top?: number; skip?: number } = {}): Promise<{ records: LeadAttachmentFailedRecord[]; count: number }> {
  const params: Record<string, string> = { '$orderby': 'createdAt desc', '$count': 'true' };
  if (options.top) params['$top'] = String(options.top);
  if (options.skip) params['$skip'] = String(options.skip);
  
  const result = await fetchApi<ODataResponse<LeadAttachmentFailedRecord>>(`${BASE_URL}/LeadAttachmentFailedRecord${buildODataQuery(params)}`);
  return { records: result.value || [], count: result['@odata.count'] ?? result.value?.length ?? 0 };
}

// Audit Log API
export async function getAuditLogs(options: { top?: number; skip?: number } = {}): Promise<{ records: LeadAttachmentAuditLog[]; count: number }> {
  const params: Record<string, string> = { '$orderby': 'createdAt desc', '$count': 'true' };
  if (options.top) params['$top'] = String(options.top);
  if (options.skip) params['$skip'] = String(options.skip);
  
  const result = await fetchApi<ODataResponse<LeadAttachmentAuditLog>>(`${BASE_URL}/LeadAttachmentAuditLog${buildODataQuery(params)}`);
  return { records: result.value || [], count: result['@odata.count'] ?? result.value?.length ?? 0 };
}

// Lead Mappings API
export async function getLeadMappings(options: { top?: number; skip?: number } = {}): Promise<{ records: LeadMigrationMapping[]; count: number }> {
  const params: Record<string, string> = { '$count': 'true' };
  if (options.top) params['$top'] = String(options.top);
  if (options.skip) params['$skip'] = String(options.skip);
  
  const result = await fetchApi<ODataResponse<LeadMigrationMapping>>(`${BASE_URL}/LeadMigrationMapping${buildODataQuery(params)}`);
  return { records: result.value || [], count: result['@odata.count'] ?? result.value?.length ?? 0 };
}

// Run History API
export async function getRunHistory(options: { top?: number; skip?: number } = {}): Promise<{ records: RunHistory[]; count: number }> {
  const params: Record<string, string> = { '$orderby': 'startedAt desc', '$count': 'true' };
  if (options.top) params['$top'] = String(options.top);
  if (options.skip) params['$skip'] = String(options.skip);
  
  const result = await fetchApi<ODataResponse<RunHistory>>(`${BASE_URL}/RunHistory${buildODataQuery(params)}`);
  return { records: result.value || [], count: result['@odata.count'] ?? result.value?.length ?? 0 };
}

// Batch Config API
export async function getBatchConfig(): Promise<BatchConfig> {
  const result = await fetchApi<{ value: string } | string>(`${BASE_URL}/getBatchConfig()`);
  const jsonStr = typeof result === 'string' ? result : result.value;
  return JSON.parse(jsonStr);
}

export async function updateBatchConfig(config: Partial<BatchConfig>): Promise<BatchConfig> {
  const result = await fetchApi<{ value: string } | string>(`${BASE_URL}/updateBatchConfig`, {
    method: 'POST',
    body: JSON.stringify(config),
  });
  const jsonStr = typeof result === 'string' ? result : result.value;
  return JSON.parse(jsonStr);
}
