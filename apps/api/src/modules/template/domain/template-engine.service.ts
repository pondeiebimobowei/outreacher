import { Injectable } from '@nestjs/common';
import { ALLOWED_PLACEHOLDERS, AllowedPlaceholder } from '@repo/shared';
import { AppValidationException } from '../../../common/errors/application.exception';

export interface TemplateContext {
  contact?: {
    firstName?: string | null;
    lastName?: string | null;
    title?: string | null;
  };
  company?: {
    name?: string | null;
    websiteUrl?: string | null;
    domain?: string | null;
  };
  opportunity?: {
    roleTitle?: string | null;
  };
  recipient?: {
    role?: string | null;
  };
  sender?: {
    fromName?: string | null;
  };
}

export interface EmailTemplateWithSteps {
  id: string;
  name: string;
  isArchived: boolean;
  steps: Array<{
    sequence: number;
    subjectTemplate: string;
    bodyTemplate: string;
  }>;
}

@Injectable()
export class TemplateEngineService {
  private readonly allowedSet = new Set<string>(ALLOWED_PLACEHOLDERS);

  /**
   * Scans text for {{placeholder}} tokens and checks against allowlist.
   */
  validateTemplateText(text: string): {
    isValid: boolean;
    invalidPlaceholders: string[];
    hasSenderPlaceholder: boolean;
  } {
    const regex = /\{\{([^{}]+)\}\}/g;
    const invalidPlaceholders: string[] = [];
    let hasSenderPlaceholder = false;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const placeholder = match[1].trim();
      if (placeholder === 'sender.name') {
        hasSenderPlaceholder = true;
      }
      if (!this.allowedSet.has(placeholder)) {
        invalidPlaceholders.push(placeholder);
      }
    }

    return {
      isValid: invalidPlaceholders.length === 0,
      invalidPlaceholders,
      hasSenderPlaceholder,
    };
  }

  /**
   * Throws AppValidationException if text contains invalid placeholders.
   */
  assertValidPlaceholders(text: string): void {
    const result = this.validateTemplateText(text);
    if (!result.isValid) {
      throw new AppValidationException(
        `Invalid placeholder(s): ${result.invalidPlaceholders.map((p) => `{{${p}}}`).join(', ')}`,
      );
    }
  }

  /**
   * Asserts every integer sequence 0..maxFollowUps exists in steps array.
   */
  validateTemplateSequences(
    steps: Array<{ sequence: number }>,
    maxFollowUps: number,
  ): void {
    const seqSet = new Set(steps.map((s) => s.sequence));
    for (let i = 0; i <= maxFollowUps; i++) {
      if (!seqSet.has(i)) {
        throw new AppValidationException(
          `Template is missing required sequence ${i} for maxFollowUps ${maxFollowUps}`,
        );
      }
    }
  }

  /**
   * Asserts sequences start at 0 and are strictly contiguous: 0, 1, ..., N-1.
   */
  validateContiguousSequences(steps: Array<{ sequence: number }>): void {
    const sorted = [...steps].sort((a, b) => a.sequence - b.sequence);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].sequence !== i) {
        throw new AppValidationException(
          `Template steps must be contiguous starting from sequence 0. Found missing or non-contiguous sequence ${i}`,
        );
      }
    }
  }

  /**
   * Validates template for campaign use:
   * - Must not be archived
   * - Must have contiguous sequences 0..maxFollowUps
   * - Must NOT contain {{sender.name}}
   */
  validateTemplateForCampaign(
    template: EmailTemplateWithSteps | { name: string; isArchived: boolean; steps: any[] },
    maxFollowUps: number,
  ): void {
    if (template.isArchived) {
      throw new AppValidationException(`Cannot use archived template "${template.name}"`);
    }

    this.validateTemplateSequences(template.steps, maxFollowUps);

    for (const step of template.steps) {
      const subjectCheck = this.validateTemplateText(step.subjectTemplate);
      const bodyCheck = this.validateTemplateText(step.bodyTemplate);
      if (subjectCheck.hasSenderPlaceholder || bodyCheck.hasSenderPlaceholder) {
        throw new AppValidationException(
          `Template "${template.name}" contains {{sender.name}} which is not supported for campaigns because senders are dynamically resolved at send time`,
        );
      }
    }
  }

  /**
   * Validates template for one-off outreach:
   * - Must not be archived
   * - Must have contiguous sequences 0..maxFollowUps
   * - If {{sender.name}} used, senderAccountId must be provided
   */
  validateTemplateForOneOff(
    template: EmailTemplateWithSteps,
    maxFollowUps: number,
    senderAccountId?: string | null,
  ): void {
    if (template.isArchived) {
      throw new AppValidationException(`Cannot use archived template "${template.name}"`);
    }

    this.validateTemplateSequences(template.steps, maxFollowUps);

    let hasSenderName = false;
    for (const step of template.steps) {
      if (
        this.validateTemplateText(step.subjectTemplate).hasSenderPlaceholder ||
        this.validateTemplateText(step.bodyTemplate).hasSenderPlaceholder
      ) {
        hasSenderName = true;
        break;
      }
    }

    if (hasSenderName && (!senderAccountId || senderAccountId.trim() === '')) {
      throw new AppValidationException(
        'senderAccountId is required for templates containing {{sender.name}}',
      );
    }
  }

  /**
   * Deterministically renders placeholders from context.
   */
  renderTemplate(text: string, context: TemplateContext): string {
    return text.replace(/\{\{([^{}]+)\}\}/g, (_, rawKey) => {
      const key = rawKey.trim();
      switch (key) {
        case 'contact.firstName':
          return context.contact?.firstName ?? '';
        case 'contact.lastName':
          return context.contact?.lastName ?? '';
        case 'contact.title':
          return context.contact?.title ?? '';
        case 'company.name':
          return context.company?.name ?? '';
        case 'company.website':
          return (
            context.company?.websiteUrl || context.company?.domain || ''
          );
        case 'opportunity.title':
          return context.opportunity?.roleTitle ?? '';
        case 'recipient.role':
          return context.recipient?.role ?? '';
        case 'sender.name':
          return context.sender?.fromName ?? '';
        default:
          return '';
      }
    });
  }
}
