import { useQuery } from '@tanstack/react-query';
import { getRunHistory } from '../services/migrationApi';

export function useRunHistory(options: { top?: number; skip?: number } = {}) {
  return useQuery({
    queryKey: ['runHistory', options],
    queryFn: () => getRunHistory(options),
  });
}
