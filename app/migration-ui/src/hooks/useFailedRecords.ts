import { useQuery } from '@tanstack/react-query';
import { getFailedRecords } from '../services/migrationApi';

export function useFailedRecords(options: { top?: number; skip?: number } = {}) {
  return useQuery({
    queryKey: ['failedRecords', options],
    queryFn: () => getFailedRecords(options),
  });
}
