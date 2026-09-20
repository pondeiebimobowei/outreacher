import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AppNotFoundException, AppValidationException } from '../../../common/errors/application.exception';
import { IntegrationStatus } from '@repo/db';
import { SECRET_RESOLVER_TOKEN } from '../../email/domain/secret-resolver.interface';
import type { ISecretResolver } from '../../email/domain/secret-resolver.interface';
import { CONNECTION_TESTER_REGISTRY_TOKEN } from '../domain/connection-tester.interface';
import type { IConnectionTesterRegistry } from '../domain/connection-tester.interface';
import { toIntegrationResponse } from '../dto/integration-response.dto';

@Injectable()
export class EnableIntegrationUseCase {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SECRET_RESOLVER_TOKEN) private readonly secretResolver: ISecretResolver,
    @Inject(CONNECTION_TESTER_REGISTRY_TOKEN) private readonly testerRegistry: IConnectionTesterRegistry,
  ) {}

  public async execute(workspaceId: string, integrationId: string) {
    const integration = await this.prisma.integration.findUnique({
      where: { workspaceId_id: { workspaceId, id: integrationId } },
    });

    if (!integration) {
      throw new AppNotFoundException('Integration not found');
    }

    // Idempotent: already ACTIVE, nothing to do
    if (integration.status === IntegrationStatus.ACTIVE) {
      return toIntegrationResponse(integration);
    }

    // enable is specifically the mechanism for DISABLED → ACTIVE.
    // INVALID_CREDENTIALS transitions to ACTIVE via POST /:id/test.
    if (integration.status !== IntegrationStatus.DISABLED) {
      throw new AppValidationException(
        `enable is only applicable to DISABLED integrations. Use POST /:id/test to promote INVALID_CREDENTIALS → ACTIVE.`,
      );
    }

    const resolvedSecret = await this.secretResolver.resolve(integration.workspaceId, integration.secretReference, integration.provider);
    const tester = this.testerRegistry.getTester(integration.provider);
    const result = await tester.testConnection(resolvedSecret);

    if (!result.success) {
      // Do NOT mutate to INVALID_CREDENTIALS on a failed enable—the integration is still DISABLED
      // and the reason is reported to the caller.
      throw new AppValidationException(
        `Cannot enable integration: connection test failed (${result.reason ?? 'UNKNOWN'})`,
      );
    }

    const updated = await this.prisma.integration.update({
      where: { id: integration.id },
      data: { status: IntegrationStatus.ACTIVE },
    });

    return toIntegrationResponse(updated);
  }
}
