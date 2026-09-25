import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreateIntegrationDto } from '../dto/create-integration.dto';
import { IntegrationProvider, IntegrationStatus } from '@repo/db';
import {
  AppValidationException,
  AppConflictException,
} from '../../../common/errors/application.exception';

@Injectable()
export class CreateIntegrationUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async execute(workspaceId: string, dto: CreateIntegrationDto) {
    if (dto.provider !== IntegrationProvider.RESEND) {
      throw new AppValidationException(`Provider ${dto.provider} coming later`);
    }

    const existing = await this.prisma.integration.findUnique({
      where: { workspaceId_name: { workspaceId, name: dto.name } },
    });

    if (existing) {
      throw new AppConflictException(
        'An integration with this name already exists in the workspace.',
      );
    }

    return this.prisma.integration.create({
      data: {
        workspaceId,
        name: dto.name,
        provider: dto.provider,
        secretReference: dto.secretReference,
        status: IntegrationStatus.INVALID_CREDENTIALS,
      },
    });
  }
}
