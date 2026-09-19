import { useQuery } from '@tanstack/react-query';
import { fetchWorkspaceSummary } from '../api/workspace-summary';
import { mapWorkspaceSummaryToViewModel } from '../home.mapper';
import { HomeViewModel, WorkspaceSummaryDto } from '../home.types';

export function useWorkspaceSummary() {
  const query = useQuery<WorkspaceSummaryDto, Error, HomeViewModel>({
    queryKey: ['workspace-summary'],
    queryFn: fetchWorkspaceSummary,
    select: mapWorkspaceSummaryToViewModel,
  });

  return query;
}
