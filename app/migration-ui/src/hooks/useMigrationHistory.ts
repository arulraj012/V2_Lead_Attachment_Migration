import { useQuery } from '@tanstack/react-query';
import { getAuditLogs } from '../services/migrationApi';

export function useMigrationHistory(options: { top?: number; skip?: number } = {}) {
  return useQuery({
    queryKey: ['auditLogs', options],
    queryFn: () => getAuditLogs(options),
  });
}
