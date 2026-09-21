import { useMutation, useQueryClient } from '@tanstack/react-query';
import { triggerMigration, retryFailed, retryAllFailed } from '../services/migrationApi';

export function useMigrationActions() {
  const queryClient = useQueryClient();
  
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['migrationStatus'] });
    queryClient.invalidateQueries({ queryKey: ['failedRecords'] });
    queryClient.invalidateQueries({ queryKey: ['runHistory'] });
  };

  const triggerMutation = useMutation({
    mutationFn: triggerMigration,
    onSuccess: invalidateAll,
  });

  const retryMutation = useMutation({
    mutationFn: retryFailed,
    onSuccess: invalidateAll,
  });

  const retryAllMutation = useMutation({
    mutationFn: retryAllFailed,
    onSuccess: invalidateAll,
  });

  return {
    triggerMigration: triggerMutation.mutateAsync,
    retryFailed: retryMutation.mutateAsync,
    retryAllFailed: retryAllMutation.mutateAsync,
    isTriggering: triggerMutation.isPending,
    isRetrying: retryMutation.isPending || retryAllMutation.isPending,
  };
}
