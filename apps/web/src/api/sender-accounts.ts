import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';

export interface SenderAccount {
  id: string;
  workspaceId: string;
  integrationId: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'DISABLED';
  dailyLimit?: number | null;
  createdAt: string;
  updatedAt: string;
}

export function useSenderAccounts() {
  return useQuery<SenderAccount[]>({
    queryKey: ['sender-accounts'],
    queryFn: async () => {
      return apiClient.get('/sender-accounts');
    },
    // Don't fail the whole page if this fails
    retry: 1,
  });
}
