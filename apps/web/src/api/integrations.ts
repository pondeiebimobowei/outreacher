import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';

export interface Integration {
  id: string;
  workspaceId: string;
  name: string;
  provider: 'RESEND';
  status: 'ACTIVE' | 'INVALID_CREDENTIALS' | 'DISABLED';
  createdAt: string;
  updatedAt: string;
}

export interface CreateIntegrationDto {
  name: string;
  provider: 'RESEND';
  secretReference: string;
}

export interface TestIntegrationResult {
  success: boolean;
  reason?: 'INVALID_CREDENTIALS' | 'PROVIDER_UNAVAILABLE' | 'CONNECTION_FAILED' | string;
}

export function useIntegrations() {
  return useQuery<Integration[]>({
    queryKey: ['integrations'],
    queryFn: async () => {
      return apiClient.get('/integrations');
    },
  });
}

export function useCreateIntegration() {
  const queryClient = useQueryClient();
  return useMutation<Integration, Error, CreateIntegrationDto>({
    mutationFn: async (data) => {
      return apiClient.post('/integrations', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });
}

export function useTestIntegration() {
  const queryClient = useQueryClient();
  return useMutation<TestIntegrationResult, Error, string>({
    mutationFn: async (id: string) => {
      return apiClient.post(`/integrations/${id}/test`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });
}

export function useDisableIntegration() {
  const queryClient = useQueryClient();
  return useMutation<Integration, Error, string>({
    mutationFn: async (id: string) => {
      return apiClient.patch(`/integrations/${id}/disable`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });
}

export function useEnableIntegration() {
  const queryClient = useQueryClient();
  return useMutation<Integration, Error, string>({
    mutationFn: async (id: string) => {
      return apiClient.post(`/integrations/${id}/enable`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
  });
}
