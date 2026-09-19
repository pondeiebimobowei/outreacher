import { Integration } from '@repo/db';

export type IntegrationResponseDto = Omit<Integration, 'secretReference' | 'metadata'>;

export function toIntegrationResponse(integration: Integration): IntegrationResponseDto {
  const { secretReference, metadata, ...safeIntegration } = integration;
  return safeIntegration;
}
