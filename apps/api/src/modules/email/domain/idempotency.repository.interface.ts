import { IdempotencyRecord, Prisma } from '@repo/db';

export const IDEMPOTENCY_REPOSITORY_TOKEN = 'IIdempotencyRepository';

export interface CreateIdempotencyRecordData {
  workspaceId: string;
  key: string;
  route: string;
  targetId: string;
  jobId?: string | null;
  responseStatus?: number;
  responseBody: Prisma.InputJsonValue;
}

export interface IIdempotencyRepository {
  findByKey(
    workspaceId: string,
    key: string,
    tx?: Prisma.TransactionClient,
  ): Promise<IdempotencyRecord | null>;

  create(
    data: CreateIdempotencyRecordData,
    tx?: Prisma.TransactionClient,
  ): Promise<IdempotencyRecord>;
}
