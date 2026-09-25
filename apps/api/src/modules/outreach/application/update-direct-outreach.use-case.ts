import { Injectable } from '@nestjs/common';
import { OutreachStatus, Prisma } from '@repo/db';
import {
  AppConflictException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';

export interface UpdateDirectOutreachCommand {
  workspaceId: string;
  outreachId: string;
  subject?: string;
  message?: string;
  expectedUpdatedAt?: Date;
}

@Injectable()
export class UpdateDirectOutreachUseCase {
  constructor(private readonly prisma: PrismaService) {}

  public async execute(command: UpdateDirectOutreachCommand) {
    const { workspaceId, outreachId, subject, message, expectedUpdatedAt } =
      command;

    const trimmedSubject =
      typeof subject === 'string' ? subject.trim() : subject;
    const trimmedMessage =
      typeof message === 'string' ? message.trim() : message;

    if (trimmedSubject === undefined && trimmedMessage === undefined) {
      throw new AppValidationException(
        'At least one of subject or message must be provided',
      );
    }

    if (
      trimmedSubject !== undefined &&
      (trimmedSubject.length < 3 || trimmedSubject.length > 150)
    ) {
      throw new AppValidationException(
        'Subject must be between 3 and 150 characters',
      );
    }

    if (
      trimmedMessage !== undefined &&
      (trimmedMessage.length < 20 || trimmedMessage.length > 4000)
    ) {
      throw new AppValidationException(
        'Message must be between 20 and 4000 characters',
      );
    }

    return await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const outreach = await tx.outreach.findUnique({
          where: { id: outreachId },
        });

        if (!outreach || outreach.workspaceId !== workspaceId) {
          throw new AppNotFoundException(`Outreach ${outreachId} not found`);
        }

        if (
          expectedUpdatedAt &&
          outreach.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()
        ) {
          throw new AppConflictException('CONCURRENCY_ERROR');
        }

        const allowedStatuses: OutreachStatus[] = ['DRAFT', 'FAILED'];
        if (!allowedStatuses.includes(outreach.status)) {
          throw new AppConflictException(
            `Cannot edit outreach in ${outreach.status} status`,
          );
        }

        const updatedSubject =
          trimmedSubject !== undefined ? trimmedSubject : outreach.subject;
        const updatedMessage =
          trimmedMessage !== undefined ? trimmedMessage : outreach.message;

        return await tx.outreach.update({
          where: { id: outreachId },
          data: {
            subject: updatedSubject,
            message: updatedMessage,
            status: 'DRAFT',
          },
        });
      },
    );
  }
}
