import { apiClient } from '../../../api/client';
import { WorkspaceSummaryDto } from '../home.types';

export async function fetchWorkspaceSummary(): Promise<WorkspaceSummaryDto> {
  return apiClient.get<WorkspaceSummaryDto>('/workspace/summary');
}
