import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { SendEligibilityService } from '../../email/domain/send-eligibility.service';
import { Prisma } from '@repo/db';
import {
  AppConflictException,
  AppNotFoundException,
} from '../../../common/errors/application.exception';

export interface SendDirectOutreachCommand {
  workspaceId: string;
  outreachId: string;
  idempotencyKey?: string;
}

@Injectable()
export class SendDirectOutreachUseCase {
  private readonly logger = new Logger(SendDirectOutreachUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibilityService: SendEligibilityService,
  ) {}

  public async execute(command: SendDirectOutreachCommand) {
    const { workspaceId, outreachId, idempotencyKey } = command;

    if (idempotencyKey) {
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: { workspaceId_key: { workspaceId, key: idempotencyKey } },
      });
      if (existing) {
        if (existing.jobId) return { jobId: existing.jobId, status: 'QUEUED' };
        return existing.responseBody;
      }
    }

    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const outreach = await tx.outreach.findUnique({
          where: { id: outreachId },
          include: { personCompanyAssociation: { include: { person: true } } },
        });

        if (!outreach || outreach.workspaceId !== workspaceId) {
          throw new AppNotFoundException(`Outreach ${outreachId} not found`);
        }

        await this.eligibilityService.checkOutreachEligibility(
          workspaceId,
          outreach,
          outreach.personCompanyAssociation.person.email,
        );

        const emailSend =
          await this.eligibilityService.reserveSenderCapacityAndCreateEmailSendForOutreach(
            tx,
            workspaceId,
            outreachId,
            outreach.senderAccountId,
            {
              subject: outreach.subject,
              body: outreach.message,
            },
          );

        await tx.outreach.update({
          where: { id: outreachId },
          data: { status: 'SENDING' },
        });

        const job = await tx.job.create({
          data: {
            workspaceId,
            type: 'EMAIL_DISPATCH',
            status: 'PENDING',
            payload: {
              emailSendId: emailSend.id,
              outreachId: outreach.id,
            },
          },
        });

        if (idempotencyKey) {
          await tx.idempotencyRecord.create({
            data: {
              workspaceId,
              key: idempotencyKey,
              route: 'POST /outreaches/:id/send',
              targetId: outreachId,
              jobId: job.id,
              responseStatus: 202,
              responseBody: { jobId: job.id, status: 'QUEUED' },
            },
          });
        }

        return { jobId: job.id, status: 'QUEUED' };
      },
    );
  }
}
