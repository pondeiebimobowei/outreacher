import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';

export interface SenderAccount {
  id: string;
  workspaceId: string;
  integrationId: string;
  name: string;
  fromEmail: string;
  status: 'PENDING' | 'ACTIVE' | 'BOUNCING' | 'SUSPENDED';
  createdAt: string;
  updatedAt: string;
}

export function useSenderAccounts() {
  return useQuery<SenderAccount[]>({
    queryKey: ['sender-accounts'],
    queryFn: async () => {
      return apiClient.get('/sender-accounts');
    },
  });
}
