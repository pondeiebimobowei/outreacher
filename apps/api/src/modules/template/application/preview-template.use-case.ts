import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@repo/db';
import {
  AppForbiddenException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { TemplateEngineService } from '../domain/template-engine.service';
import { PreviewTemplateDto } from '../dto/preview-template.dto';

export interface RenderedTemplateStepPreview {
  sequence: number;
  subject: string;
  body: string;
}

@Injectable()
export class PreviewTemplateUseCase {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly templateEngine: TemplateEngineService,
  ) {}

  async execute(
    workspaceId: string,
    templateId: string,
    dto: PreviewTemplateDto,
  ): Promise<{ steps: RenderedTemplateStepPreview[] }> {
    const template = await this.prisma.emailTemplate.findFirst({
      where: {
        id: templateId,
        workspaceId,
      },
      include: {
        steps: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!template) {
      throw new AppNotFoundException(`Email template ${templateId} not found`);
    }

    // Check if template contains {{sender.name}}
    let hasSenderName = false;
    for (const step of template.steps) {
      if (
        this.templateEngine.validateTemplateText(step.subjectTemplate).hasSenderPlaceholder ||
        this.templateEngine.validateTemplateText(step.bodyTemplate).hasSenderPlaceholder
      ) {
        hasSenderName = true;
        break;
      }
    }

    if (hasSenderName && (!dto.senderAccountId || dto.senderAccountId.trim() === '')) {
      throw new AppValidationException(
        'senderAccountId is required for templates containing {{sender.name}}',
      );
    }

    let senderAccount: any = null;
    if (dto.senderAccountId) {
      senderAccount = await this.prisma.senderAccount.findUnique({
        where: { id: dto.senderAccountId },
      });
      if (!senderAccount || senderAccount.workspaceId !== workspaceId) {
        throw new AppForbiddenException(
          `Sender account ${dto.senderAccountId} does not belong to this workspace`,
        );
      }
    }

    // Fetch PCA and associations
    const pca = await this.prisma.personCompanyAssociation.findFirst({
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
        `Contact association ${dto.personCompanyAssociationId} not found`,
      );
    }

    let opportunity: any = null;
    if (dto.opportunityId) {
      opportunity = await this.prisma.opportunity.findFirst({
        where: {
          id: dto.opportunityId,
          workspaceId,
        },
      });
      if (!opportunity) {
        throw new AppNotFoundException(`Opportunity ${dto.opportunityId} not found`);
      }
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
      opportunity: {
        roleTitle: opportunity?.roleTitle,
      },
      recipient: {
        role: pca.role,
      },
      sender: {
        fromName: senderAccount?.fromName,
      },
    };

    const renderedSteps: RenderedTemplateStepPreview[] = template.steps.map((step) => ({
      sequence: step.sequence,
      subject: this.templateEngine.renderTemplate(step.subjectTemplate, context),
      body: this.templateEngine.renderTemplate(step.bodyTemplate, context),
    }));

    return { steps: renderedSteps };
  }
}
