import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AppNotFoundException } from '../../../common/errors/application.exception';
import { IntegrationStatus } from '@repo/db';
import { SECRET_RESOLVER_TOKEN } from '../../email/domain/secret-resolver.interface';
import type { ISecretResolver } from '../../email/domain/secret-resolver.interface';
import { CONNECTION_TESTER_REGISTRY_TOKEN } from '../domain/connection-tester.interface';
import type { IConnectionTesterRegistry } from '../domain/connection-tester.interface';

@Injectable()
export class TestIntegrationUseCase {
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

    const resolvedSecret = await this.secretResolver.resolve(integration.workspaceId, integration.secretReference, integration.provider);
    const tester = this.testerRegistry.getTester(integration.provider);
    const result = await tester.testConnection(resolvedSecret);

    if (integration.status === IntegrationStatus.DISABLED) {
      // Rule: Testing only reports health; does not automatically transition user-intent state to ACTIVE if DISABLED
      return result;
    }

    if (result.success && integration.status === IntegrationStatus.INVALID_CREDENTIALS) {
      await this.prisma.integration.update({
        where: { id: integration.id },
        data: { status: IntegrationStatus.ACTIVE },
      });
    } else if (!result.success && integration.status === IntegrationStatus.ACTIVE && result.reason === 'INVALID_CREDENTIALS') {
      await this.prisma.integration.update({
        where: { id: integration.id },
        data: { status: IntegrationStatus.INVALID_CREDENTIALS },
      });
    }

    return result;
  }
}
