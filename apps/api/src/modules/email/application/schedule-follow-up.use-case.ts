import { Injectable } from '@nestjs/common';
import { Prisma } from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';

export interface ScheduleFollowUpCheckInput {
  workspaceId: string;
  outreachId: string;
  sequence: number;
  delayDays: number;
}

@Injectable()
export class ScheduleFollowUpUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async scheduleFollowUpCheck(
    tx: Prisma.TransactionClient,
    input: ScheduleFollowUpCheckInput,
  ): Promise<void> {
    const { workspaceId, outreachId, sequence, delayDays } = input;
    const idempotencyKey = `follow-up:${outreachId}:${sequence}`;

    const scheduledAt = this.calculateFollowUpDate(new Date(), delayDays);

    await tx.$executeRaw`
      INSERT INTO jobs (
        id, workspace_id, type, status, payload, idempotency_key, available_at, lease_version, max_attempts, attempt_count, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        ${workspaceId},
        'SCHEDULED_FOLLOW_UP_CHECK'::"JobType",
        'PENDING'::"JobStatus",
        ${JSON.stringify({ outreachId, sequence })}::jsonb,
        ${idempotencyKey},
        ${scheduledAt},
        0,
        3,
        0,
        NOW(),
        NOW()
      )
      ON CONFLICT (workspace_id, type, idempotency_key) DO NOTHING
    `;
  }

  public calculateFollowUpDate(startDate: Date, businessDays: number): Date {
    const date = new Date(startDate.getTime());
    let added = 0;
    while (added < businessDays) {
      date.setUTCDate(date.getUTCDate() + 1);
      const dayOfWeek = date.getUTCDay();
      // Skip Saturday (6) and Sunday (0)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        added++;
      }
    }
    return date;
  }
}
