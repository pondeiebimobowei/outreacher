import { Injectable } from '@nestjs/common';
import { IdempotencyRecord, Prisma } from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import {
  CreateIdempotencyRecordData,
  IIdempotencyRepository,
} from '../domain/idempotency.repository.interface';

@Injectable()
export class PrismaIdempotencyRepository implements IIdempotencyRepository {
  constructor(private readonly prisma: PrismaService) {}

  private getClient(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma;
  }

  public async findByKey(
    workspaceId: string,
    key: string,
    tx?: Prisma.TransactionClient,
  ): Promise<IdempotencyRecord | null> {
    const client = this.getClient(tx);
    return client.idempotencyRecord.findUnique({
      where: {
        workspaceId_key: {
          workspaceId,
          key,
        },
      },
    });
  }

  public async create(
    data: CreateIdempotencyRecordData,
    tx?: Prisma.TransactionClient,
  ): Promise<IdempotencyRecord> {
    const client = this.getClient(tx);
    return client.idempotencyRecord.create({
      data: {
        workspaceId: data.workspaceId,
        key: data.key,
        route: data.route,
        targetId: data.targetId,
        jobId: data.jobId ?? null,
        responseStatus: data.responseStatus ?? 202,
        responseBody: data.responseBody,
      },
    });
  }
}
