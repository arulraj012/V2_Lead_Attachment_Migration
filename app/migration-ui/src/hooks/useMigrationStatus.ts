import { useQuery } from '@tanstack/react-query';
import { getMigrationStatus } from '../services/migrationApi';

export function useMigrationStatus() {
  return useQuery({
    queryKey: ['migrationStatus'],
    queryFn: getMigrationStatus,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'RUNNING' ? 3000 : 30000;
    },
  });
}
