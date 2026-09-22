import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CanonicalDeliveryEvent } from '../domain/delivery-event-provider.adapter';
import { AppConflictException } from '../../../common/errors/application.exception';
import { EmailEventType, SuppressionReason } from '@repo/db';

interface ProcessDeliveryEventInput {
  workspaceId: string;
  provider: string;
  idempotencyKey: string;
  event: CanonicalDeliveryEvent;
}

@Injectable()
export class ProcessDeliveryEventUseCase {
  private readonly logger = new Logger(ProcessDeliveryEventUseCase.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(input: ProcessDeliveryEventInput): Promise<void> {
    const { workspaceId, provider, idempotencyKey, event } = input;

    // Find the EmailSend
    const emailSend = await this.prisma.emailSend.findFirst({
      where: {
        workspaceId,
        providerMessageId: event.providerMessageId,
      },
      select: {
        id: true,
        workspaceId: true,
      },
    });

    if (!emailSend) {
      this.logger.warn(`Dropping safely uncorrelated delivery event: no EmailSend found for providerMessageId ${event.providerMessageId}`);
      return; // Drop, log, 202
    }

    if (emailSend.workspaceId !== workspaceId) {
      this.logger.error(`Cross-tenant correlation attempted. EmailSend ${emailSend.id} belongs to ${emailSend.workspaceId}, webhook is for ${workspaceId}`);
      return; // Drop, log, 202
    }

    try {
      await this.prisma.$transaction(async (tx: any) => {
        // 1. Idempotency Record (authoritative serialization primitive)
        await tx.idempotencyRecord.create({
          data: {
            workspaceId,
            key: idempotencyKey,
            route: 'webhook:delivery',
            targetId: event.providerEventId,
            responseStatus: 202,
            responseBody: { accepted: true },
          },
        });

        // 2. Email Event
        await tx.emailEvent.create({
          data: {
            workspaceId,
            emailSendId: emailSend.id,
            provider,
            providerEventId: event.providerEventId,
            eventType: event.eventType,
            occurredAt: event.occurredAt,
            payload: event.rawPayload,
          },
        });

        // 3. Suppression (if bounced or complained)
        if (event.eventType === EmailEventType.BOUNCED || event.eventType === EmailEventType.COMPLAINED) {
          const reason = event.eventType === EmailEventType.BOUNCED ? SuppressionReason.BOUNCED : SuppressionReason.COMPLAINT;

          await tx.suppression.upsert({
            where: {
              workspaceId_email: {
                workspaceId,
                email: event.recipientEmail,
              },
            },
            create: {
              workspaceId,
              email: event.recipientEmail,
              reason,
              source: `webhook:${provider}:${event.providerEventId}`,
            },
            update: {}, // Leave existing suppression unchanged
          });
        }
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        // Unique constraint violation - handle collision
        const targetStr = Array.isArray(err.meta?.target) ? err.meta?.target.join(',') : String(err.meta?.target || '');
        const errMessage = err.message || '';

        if (
          targetStr.includes('key') ||
          targetStr.includes('providerEventId') ||
          targetStr.includes('provider_event_id') ||
          errMessage.includes('email_events_provider_provider_event_id_key') ||
          errMessage.includes('idempotency_records')
        ) {
          // Verify if it's a legitimate duplicate or identity conflict
          const existingEvent = await this.prisma.emailEvent.findUnique({
            where: {
              provider_providerEventId: {
                provider,
                providerEventId: event.providerEventId,
              },
            },
            include: {
              emailSend: true,
            },
          });

          if (existingEvent) {
            if (existingEvent.emailSend?.providerMessageId === event.providerMessageId) {
              this.logger.log(`Idempotent delivery webhook deduplication for providerEventId: ${event.providerEventId}`);
              return; // Legitimate duplicate
            } else {
              this.logger.error(`Identity conflict for providerEventId ${event.providerEventId}: expected msgId ${existingEvent.emailSend?.providerMessageId}, got ${event.providerMessageId}`);
              throw new AppConflictException(`Identity conflict: providerEventId ${event.providerEventId} already associated with a different providerMessageId`);
            }
          } else {
            // It hit idempotencyRecord unique constraint but no EmailEvent found (unlikely unless data corrupted, or another process is just committing)
            this.logger.log(`Idempotent delivery webhook deduplication for idempotencyKey: ${idempotencyKey}`);
            return;
          }
        } else {
           console.log('P2002 but did not match target:', targetStr, errMessage);
        }
      }
      throw err;
    }
  }
}
