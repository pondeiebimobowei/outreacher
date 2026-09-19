import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';

export interface SenderAccount {
  id: string;
  workspaceId: string;
  integrationId: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'DISABLED';
  dailyLimit?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSenderAccountDto {
  integrationId: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  dailyLimit?: number;
}

export interface UpdateSenderAccountDto {
  fromName?: string;
  fromEmail?: string;
  replyTo?: string | null;
  status?: 'ACTIVE' | 'PAUSED' | 'DISABLED';
  dailyLimit?: number;
}

export function useSenderAccounts() {
  return useQuery<SenderAccount[]>({
    queryKey: ['sender-accounts'],
    queryFn: async () => {
      return apiClient.get('/sender-accounts');
    },
    retry: 1,
  });
}

export function useCreateSenderAccount() {
  const queryClient = useQueryClient();
  return useMutation<SenderAccount, Error, CreateSenderAccountDto>({
    mutationFn: async (data) => {
      return apiClient.post('/sender-accounts', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sender-accounts'] });
    },
  });
}

export function useUpdateSenderAccount() {
  const queryClient = useQueryClient();
  return useMutation<SenderAccount, Error, { id: string; data: UpdateSenderAccountDto }>({
    mutationFn: async ({ id, data }) => {
      return apiClient.patch(`/sender-accounts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sender-accounts'] });
    },
  });
}
