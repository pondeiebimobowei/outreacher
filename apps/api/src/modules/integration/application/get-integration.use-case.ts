import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AppNotFoundException } from '../../../common/errors/application.exception';

@Injectable()
export class GetIntegrationUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async execute(workspaceId: string, integrationId: string) {
    const integration = await this.prisma.integration.findUnique({
      where: { workspaceId_id: { workspaceId, id: integrationId } },
    });

    if (!integration) {
      throw new AppNotFoundException('Integration not found');
    }

    return integration;
  }
}
