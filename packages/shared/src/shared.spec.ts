import {
  CONTENT_SOURCES,
  ALLOWED_PLACEHOLDERS,
  CAMPAIGN_RECIPIENT_STATUSES,
  OUTREACH_STATUSES,
  AI_GENERATION_STATUSES,
  CONVERSATION_STATES,
  JOB_CANCELLATION_REASONS,
  SUPPRESSION_REASONS,
  SUPPRESSION_ACTIONS,
  EmailTemplateSummaryDto,
  EmailTemplateDto,
  EmailTemplateStepDto,
  ListTemplatesQueryDto,
  CampaignDto,
  CreateCampaignRequest,
  UpdateCampaignRequest,
  CampaignRecipientDto,
  OutreachDto,
  CreateOutreachRequest,
  EmailSendDto,
} from './index';

describe('@repo/shared domain contracts & lifecycle types', () => {
  it('should export all required domain enums and constants', () => {
    expect(CONTENT_SOURCES).toEqual(['MANUAL', 'TEMPLATE', 'AI']);
    expect(ALLOWED_PLACEHOLDERS).toEqual([
      'contact.firstName',
      'contact.lastName',
      'contact.title',
      'company.name',
      'company.website',
      'opportunity.title',
      'recipient.role',
      'sender.name',
    ]);
    expect(CAMPAIGN_RECIPIENT_STATUSES).toEqual([
      'PENDING',
      'ACTIVE',
      'PAUSED',
      'COMPLETED',
      'SUPPRESSED',
      'FAILED',
      'REMOVED',
    ]);
    expect(OUTREACH_STATUSES).toEqual([
      'DRAFT',
      'APPROVED',
      'SENDING',
      'ACTIVE',
      'PAUSED',
      'COMPLETED',
      'FAILED',
      'CANCELLED',
    ]);
    expect(AI_GENERATION_STATUSES).toEqual([
      'PENDING',
      'SUCCEEDED',
      'FAILED',
      'SKIPPED',
    ]);
    expect(CONVERSATION_STATES).toEqual([
      'NO_REPLY',
      'ACTIVE',
      'REPLIED',
      'STOPPED',
    ]);
    expect(JOB_CANCELLATION_REASONS).toEqual([
      'PAUSED',
      'SUPPRESSED',
      'CANCELLED_BY_USER',
    ]);
    expect(SUPPRESSION_REASONS).toEqual([
      'USER_REQUEST',
      'UNSUBSCRIBED',
      'BOUNCED',
      'COMPLAINT',
      'MANUAL',
      'SYSTEM',
    ]);
    expect(SUPPRESSION_ACTIONS).toEqual(['SUPPRESSED', 'UNSUPPRESSED']);
  });

  it('should enforce contract typing for template DTOs', () => {
    const step: EmailTemplateStepDto = {
      id: 'step-1',
      templateId: 'tmpl-1',
      sequence: 0,
      subjectTemplate: 'Hello {{contact.firstName}}',
      bodyTemplate: 'Message for {{company.name}}',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    const summary: EmailTemplateSummaryDto = {
      id: 'tmpl-1',
      workspaceId: 'ws-1',
      name: 'Initial Outreach',
      isArchived: false,
      stepCount: 1,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    const detail: EmailTemplateDto = {
      id: 'tmpl-1',
      workspaceId: 'ws-1',
      name: 'Initial Outreach',
      isArchived: false,
      steps: [step],
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    const query: ListTemplatesQueryDto = {
      includeArchived: true,
    };

    expect(summary.stepCount).toBe(1);
    expect(detail.steps[0].sequence).toBe(0);
    expect(query.includeArchived).toBe(true);
  });

  it('should enforce contract typing for multi-company Campaign and Recipient DTOs', () => {
    const campaign: CampaignDto = {
      id: 'camp-1',
      workspaceId: 'ws-1',
      name: 'Q4 Enterprise Hiring',
      status: 'ACTIVE',
      contentSource: 'TEMPLATE',
      templateId: 'tmpl-1',
      aiPromptContext: null,
      followUpDelayBusinessDays: 3,
      maxFollowUps: 2,
      senderAccountIds: ['sender-1'],
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    const recipient: CampaignRecipientDto = {
      id: 'recip-1',
      workspaceId: 'ws-1',
      campaignId: 'camp-1',
      personCompanyAssociationId: 'pca-1',
      status: 'PENDING',
      targetRole: 'VP Engineering',
      selectedOpportunityId: 'opp-1',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    const createReq: CreateCampaignRequest = {
      name: 'Q4 Enterprise Hiring',
      contentSource: 'TEMPLATE',
      templateId: 'tmpl-1',
      senderAccountIds: ['sender-1'],
      maxFollowUps: 2,
    };

    const updateReq: UpdateCampaignRequest = {
      name: 'Updated Campaign',
      contentSource: 'AI',
      aiPromptContext: 'Tone: concise',
      maxFollowUps: 1,
    };

    expect(campaign.contentSource).toBe('TEMPLATE');
    expect(recipient.status).toBe('PENDING');
    expect(createReq.contentSource).toBe('TEMPLATE');
    expect(updateReq.contentSource).toBe('AI');
  });

  it('should enforce contract typing for Outreach and EmailSend DTOs without generateWithAi', () => {
    const outreach: OutreachDto = {
      id: 'outreach-1',
      workspaceId: 'ws-1',
      personCompanyAssociationId: 'pca-1',
      campaignRecipientId: null,
      senderAccountId: 'sender-1',
      contentSource: 'MANUAL',
      templateId: null,
      aiPromptContext: null,
      aiGenerationStatus: null,
      draftVersion: 0,
      subject: 'Hello',
      message: 'World',
      outreachReason: 'Referral',
      status: 'DRAFT',
      maxFollowUps: 2,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };

    const emailSend: EmailSendDto = {
      id: 'send-1',
      workspaceId: 'ws-1',
      outreachId: 'outreach-1',
      senderAccountId: 'sender-1',
      sequence: 0,
      type: 'INITIAL',
      subject: 'Hello',
      body: 'World',
      status: 'SENT',
      expectedStateVersion: 1,
      scheduledAt: null,
      reservedAt: '2026-10-01T00:00:00.000Z',
      sentAt: '2026-10-01T00:01:00.000Z',
      failedAt: null,
      firstProviderAttemptAt: '2026-10-01T00:00:30.000Z',
      providerMessageId: 'msg-1',
      messageId: 'uuid-1',
      provider: 'RESEND',
      errorCode: null,
      errorMessage: null,
      replyToToken: 'reply-tok-1',
      retryable: false,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:01:00.000Z',
    };

    const createReq: CreateOutreachRequest = {
      personCompanyAssociationId: 'pca-1',
      contentSource: 'MANUAL',
      subject: 'Hello',
      message: 'World',
    };

    expect(outreach.draftVersion).toBe(0);
    expect(emailSend.firstProviderAttemptAt).toBe('2026-10-01T00:00:30.000Z');
    expect(createReq.contentSource).toBe('MANUAL');
    // Ensure generateWithAi is strictly absent from CreateOutreachRequest definition
    // @ts-expect-error generateWithAi must not exist on CreateOutreachRequest
    expect(createReq.generateWithAi).toBeUndefined();
  });
});
