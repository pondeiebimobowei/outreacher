import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { ContentSource, OutreachDto } from '@repo/shared';
import { PrismaClient } from '@repo/db';
import {
  AppConflictException,
  AppForbiddenException,
  AppNotFoundException,
  AppUnprocessableEntityException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { TemplateEngineService } from '../../template/domain/template-engine.service';
import { CreateOutreachDto } from '../dto/create-outreach.dto';

@Injectable()
export class CreateOutreachUseCase {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly templateEngine: TemplateEngineService,
  ) {}

  async execute(
    workspaceId: string,
    dto: CreateOutreachDto,
    idempotencyKey?: string,
  ): Promise<OutreachDto> {
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw new AppValidationException('idempotency-key header is required');
    }

    const targetId = dto.campaignRecipientId || dto.personCompanyAssociationId;
    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(dto))
      .digest('hex');

    // ContentSource Mutual Exclusion & Validation
    if (dto.campaignRecipientId) {
      if (
        dto.contentSource !== undefined ||
        dto.templateId !== undefined ||
        dto.aiPromptContext !== undefined ||
        dto.maxFollowUps !== undefined ||
        dto.senderAccountId !== undefined ||
        dto.subject !== undefined ||
        dto.message !== undefined
      ) {
        throw new AppValidationException(
          'Campaign configuration governs content, template, aiPromptContext, maxFollowUps, and sender selection for campaign-linked outreach',
        );
      }
    } else {
      const contentSource: ContentSource = dto.contentSource ?? 'MANUAL';
      if (contentSource === 'MANUAL') {
        if (dto.templateId || dto.aiPromptContext) {
          throw new AppValidationException(
            'MANUAL content source must not provide templateId or aiPromptContext',
          );
        }
      } else if (contentSource === 'TEMPLATE') {
        if (!dto.templateId || dto.aiPromptContext) {
          throw new AppValidationException(
            'TEMPLATE content source requires templateId and must not provide aiPromptContext',
          );
        }
      } else if (contentSource === 'AI') {
        if (dto.templateId) {
          throw new AppValidationException(
            'AI content source must not provide templateId',
          );
        }
      }
    }

    return this.prisma.$transaction(async (tx: any) => {
      // Step 1: Check Idempotency Record
      const existingRecord = await tx.idempotencyRecord.findFirst({
        where: {
          workspaceId,
          operation: 'POST:/outreaches',
          key: idempotencyKey,
        },
      });

      if (existingRecord) {
        if (existingRecord.targetId !== targetId) {
          throw new AppConflictException(
            'Idempotency key reused for different target',
          );
        }
        if (existingRecord.requestHash !== requestHash) {
          throw new AppConflictException(
            'Idempotency key reused with different request payload',
          );
        }

        // Return existing outreach if already created
        const existingOutreach = await tx.outreach.findFirst({
          where: {
            workspaceId,
            ...(dto.campaignRecipientId
              ? { campaignRecipientId: dto.campaignRecipientId }
              : { personCompanyAssociationId: dto.personCompanyAssociationId }),
          },
        });
        if (existingOutreach) {
          return this.mapToDto(existingOutreach);
        }
      }

      // Step 2: Fetch PCA & check suppression / stopped state
      const pca = await tx.personCompanyAssociation.findFirst({
        where: {
          id: dto.personCompanyAssociationId,
          workspaceId,
        },
        include: {
          person: true,
          company: true,
        },
      });

      if (!pca) {
        throw new AppNotFoundException(
          `PersonCompanyAssociation ${dto.personCompanyAssociationId} not found`,
        );
      }

      if (pca.conversationState === 'STOPPED') {
        throw new AppUnprocessableEntityException('Contact is suppressed/stopped');
      }

      if (pca.person?.email) {
        const suppression = await tx.suppression.findFirst({
          where: {
            workspaceId,
            email: pca.person.email,
          },
        });
        if (suppression) {
          throw new AppUnprocessableEntityException(
            'Contact is suppressed/stopped',
          );
        }
      }

      let contentSource: ContentSource;
      let templateId: string | null = null;
      let aiPromptContext: string | null = null;
      let maxFollowUps: number;
      let subject = '';
      let message = '';
      let senderAccountId: string | null = dto.senderAccountId ?? null;

      if (dto.campaignRecipientId) {
        // Campaign-linked outreach
        const recipient = await tx.campaignRecipient.findFirst({
          where: {
            id: dto.campaignRecipientId,
            workspaceId,
          },
        });
        if (!recipient) {
          throw new AppNotFoundException(
            `Campaign recipient ${dto.campaignRecipientId} not found`,
          );
        }

        const existingOutreach = await tx.outreach.findFirst({
          where: { campaignRecipientId: dto.campaignRecipientId },
        });
        if (existingOutreach) {
          throw new AppConflictException(
            'An outreach already exists for this campaign recipient',
          );
        }

        const campaign = await tx.campaign.findFirst({
          where: {
            id: recipient.campaignId,
            workspaceId,
          },
        });
        if (!campaign) {
          throw new AppNotFoundException(`Campaign ${recipient.campaignId} not found`);
        }

        contentSource = campaign.contentSource;
        maxFollowUps = campaign.maxFollowUps;

        if (contentSource === 'TEMPLATE') {
          templateId = campaign.templateId;
          aiPromptContext = null;

          const template = await tx.emailTemplate.findFirst({
            where: { id: templateId!, workspaceId },
            include: { steps: { orderBy: { sequence: 'asc' } } },
          });
          if (!template) {
            throw new AppNotFoundException(`Template ${templateId} not found`);
          }
          this.templateEngine.validateTemplateForCampaign(template, maxFollowUps);

          const step0 = template.steps.find((s: any) => s.sequence === 0);
          if (!step0) {
            throw new AppValidationException(
              `Template is missing required sequence 0 for maxFollowUps ${maxFollowUps}`,
            );
          }

          const context = {
            contact: {
              firstName: pca.person?.firstName,
              lastName: pca.person?.lastName,
              title: pca.role,
            },
            company: {
              name: pca.company?.name,
              websiteUrl: pca.company?.websiteUrl,
              domain: pca.company?.domain,
            },
            recipient: {
              role: recipient.targetRole ?? pca.role,
            },
          };

          subject = this.templateEngine.renderTemplate(step0.subjectTemplate, context);
          message = this.templateEngine.renderTemplate(step0.bodyTemplate, context);
        } else if (contentSource === 'AI') {
          templateId = null;
          aiPromptContext = campaign.aiPromptContext;
          subject = '';
          message = '';
        } else {
          templateId = null;
          aiPromptContext = null;
        }
      } else {
        // One-off outreach
        contentSource = dto.contentSource ?? 'MANUAL';
        maxFollowUps = dto.maxFollowUps ?? 2;

        if (contentSource === 'TEMPLATE') {
          templateId = dto.templateId!;
          aiPromptContext = null;

          const template = await tx.emailTemplate.findFirst({
            where: { id: templateId, workspaceId },
            include: { steps: { orderBy: { sequence: 'asc' } } },
          });
          if (!template) {
            throw new AppNotFoundException(`Template ${templateId} not found`);
          }

          let resolvedSenderAccount: any = null;
          if (dto.senderAccountId) {
            resolvedSenderAccount = await tx.senderAccount.findFirst({
              where: { id: dto.senderAccountId },
            });
            if (
              !resolvedSenderAccount ||
              resolvedSenderAccount.workspaceId !== workspaceId
            ) {
              throw new AppForbiddenException(
                'Sender account does not belong to this workspace',
              );
            }
          }

          this.templateEngine.validateTemplateForOneOff(
            template,
            maxFollowUps,
            dto.senderAccountId,
          );

          const step0 = template.steps.find((s: any) => s.sequence === 0);
          if (!step0) {
            throw new AppValidationException(
              `Template is missing required sequence 0 for maxFollowUps ${maxFollowUps}`,
            );
          }

          const context = {
            contact: {
              firstName: pca.person?.firstName,
              lastName: pca.person?.lastName,
              title: pca.role,
            },
            company: {
              name: pca.company?.name,
              websiteUrl: pca.company?.websiteUrl,
              domain: pca.company?.domain,
            },
            recipient: {
              role: pca.role,
            },
            sender: {
              fromName: resolvedSenderAccount?.fromName,
            },
          };

          subject = this.templateEngine.renderTemplate(step0.subjectTemplate, context);
          message = this.templateEngine.renderTemplate(step0.bodyTemplate, context);
        } else if (contentSource === 'AI') {
          templateId = null;
          aiPromptContext = dto.aiPromptContext ?? null;
          subject = '';
          message = '';
        } else {
          contentSource = 'MANUAL';
          templateId = null;
          aiPromptContext = null;
          subject = dto.subject ?? '';
          message = dto.message ?? '';
        }
      }

      // Create Outreach
      const outreach = await tx.outreach.create({
        data: {
          workspaceId,
          personCompanyAssociationId: dto.personCompanyAssociationId,
          campaignRecipientId: dto.campaignRecipientId ?? null,
          senderAccountId,
          contentSource,
          templateId,
          aiPromptContext,
          aiGenerationStatus: contentSource === 'AI' ? 'PENDING' : null,
          draftVersion: 0,
          subject,
          message,
          status: 'DRAFT',
          maxFollowUps,
        },
      });

      // Enqueue generation job if AI mode
      if (contentSource === 'AI') {
        await tx.job.create({
          data: {
            workspaceId,
            type: 'OUTREACH_GENERATION',
            idempotencyKey: `outreach-gen:${outreach.id}`,
            payload: {
              outreachId: outreach.id,
              expectedDraftVersion: 0,
            },
          },
        });
      }

      // Record Idempotency Claim
      await tx.idempotencyRecord.create({
        data: {
          workspaceId,
          operation: 'POST:/outreaches',
          key: idempotencyKey,
          targetId,
          requestHash,
        },
      });

      return this.mapToDto(outreach);
    });
  }

  private mapToDto(outreach: any): OutreachDto {
    return {
      id: outreach.id,
      workspaceId: outreach.workspaceId,
      personCompanyAssociationId: outreach.personCompanyAssociationId,
      campaignRecipientId: outreach.campaignRecipientId ?? null,
      senderAccountId: outreach.senderAccountId ?? null,
      contentSource: outreach.contentSource,
      templateId: outreach.templateId ?? null,
      aiPromptContext: outreach.aiPromptContext ?? null,
      aiGenerationStatus: outreach.aiGenerationStatus ?? null,
      draftVersion: outreach.draftVersion,
      subject: outreach.subject,
      message: outreach.message,
      outreachReason: outreach.outreachReason ?? null,
      status: outreach.status,
      maxFollowUps: outreach.maxFollowUps,
      createdAt: outreach.createdAt?.toISOString?.() ?? new Date().toISOString(),
      updatedAt: outreach.updatedAt?.toISOString?.() ?? new Date().toISOString(),
    };
  }
}
