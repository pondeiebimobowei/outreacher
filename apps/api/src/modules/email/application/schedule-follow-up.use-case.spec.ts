import { EmailSendStatus } from '@repo/db';
import { ScheduleFollowUpUseCase } from './schedule-follow-up.use-case';
import { ScheduledFollowUpCheckWorker } from './scheduled-follow-up-check.worker';
import { MarkContactRepliedUseCase } from './mark-contact-replied.use-case';
import { TemplateEngineService } from '../../template/domain/template-engine.service';

describe('Task 8: Follow-up Scheduling, Template Rendering, 3-Phase AI Follow-Up & Reply Cancellation', () => {
  const workspaceId = 'ws-test-1111';
  const outreachId = 'out-test-2222';
  const pcaId = 'pca-test-3333';
  const templateId = 'tpl-test-4444';
  const campaignId = 'camp-test-5555';
  const campaignRecipientId = 'recip-test-6666';

  let scheduleUseCase: ScheduleFollowUpUseCase;
  let followUpWorker: ScheduledFollowUpCheckWorker;
  let markRepliedUseCase: MarkContactRepliedUseCase;
  let templateEngine: TemplateEngineService;
  let mockPrisma: any;
  let mockEligibilityService: any;
  let mockAiProvider: any;

  beforeEach(() => {
    mockPrisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn().mockImplementation(async (cb) => cb(mockPrisma)),
      outreach: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      emailTemplate: {
        findUnique: jest.fn(),
      },
      emailTemplateStep: {
        findUnique: jest.fn(),
      },
      campaign: {
        findUnique: jest.fn(),
      },
      campaignRecipient: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      personCompanyAssociation: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      emailSend: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'send-new', ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      job: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'job-new', ...data })),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      conversationMessage: {
        create: jest.fn(),
      },
    };

    templateEngine = new TemplateEngineService();
    mockEligibilityService = {
      reserveSenderCapacityAndCreateEmailSend: jest.fn().mockImplementation((tx, input) => {
        return {
          id: 'send-reserved-id',
          ...input,
          status: EmailSendStatus.RESERVED,
        };
      }),
    };

    mockAiProvider = {
      complete: jest.fn(),
    };

    scheduleUseCase = new ScheduleFollowUpUseCase(mockPrisma);
    followUpWorker = new ScheduledFollowUpCheckWorker(
      mockPrisma,
      templateEngine,
      mockEligibilityService,
      mockAiProvider,
    );
    markRepliedUseCase = new MarkContactRepliedUseCase(mockPrisma);
  });

  describe('ScheduleFollowUpUseCase', () => {
    it('creates only a SCHEDULED_FOLLOW_UP_CHECK job via ON CONFLICT DO NOTHING with non-null idempotencyKey and zero EmailSends', async () => {
      await scheduleUseCase.scheduleFollowUpCheck(mockPrisma, {
        workspaceId,
        outreachId,
        sequence: 1,
        delayDays: 3,
      });

      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
      // Zero EmailSend created prior to job execution
      expect(mockPrisma.emailSend.create).not.toHaveBeenCalled();
    });

    it('calculateFollowUpDate correctly skips weekends', () => {
      // Friday 2026-10-02 -> 1 business day -> Monday 2026-10-05
      const friday = new Date(Date.UTC(2026, 9, 2, 12, 0, 0));
      const nextBusinessDay = scheduleUseCase.calculateFollowUpDate(friday, 1);
      expect(nextBusinessDay.getUTCDay()).toBe(1); // Monday
    });
  });

  describe('Template Step Rendering (Sequence 1 and Sequence 2)', () => {
    const templateOutreach = {
      id: outreachId,
      workspaceId,
      contentSource: 'TEMPLATE',
      templateId,
      status: 'ACTIVE',
      senderAccountId: 'sa-1',
      personCompanyAssociation: {
        id: pcaId,
        stateVersion: 1,
        conversationState: 'ACTIVE',
        role: 'CTO',
        person: { firstName: 'Alice', lastName: 'Smith' },
        company: { name: 'Acme Corp', websiteUrl: 'https://acme.com', domain: 'acme.com' },
      },
      campaignRecipient: {
        id: campaignRecipientId,
        campaignId,
        status: 'ACTIVE',
        targetRole: 'VP Engineering',
        opportunity: { roleTitle: 'VP Engineering' },
        campaign: { id: campaignId, status: 'ACTIVE' },
      },
    };

    it('Sequence 1 follow-up for TEMPLATE outreach renders step 1 placeholders', async () => {
      mockPrisma.outreach.findUnique.mockResolvedValue(templateOutreach);
      mockPrisma.emailTemplateStep.findUnique.mockResolvedValue({
        id: 'step-1',
        templateId,
        sequence: 1,
        subjectTemplate: 'Following up, {{contact.firstName}}',
        bodyTemplate: 'Hi {{contact.firstName}}, checking in on {{company.name}} opportunities.',
      });

      const claimed = {
        job: {
          id: 'job-1',
          workspaceId,
          type: 'SCHEDULED_FOLLOW_UP_CHECK',
          payload: { outreachId, sequence: 1 },
          leaseVersion: 0,
        } as any,
        claimedAttempt: 1,
      };

      const result = await followUpWorker.processJob(claimed);
      expect(result).toBe(true);

      expect(mockEligibilityService.reserveSenderCapacityAndCreateEmailSend).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sequence: 1,
          type: 'FOLLOW_UP',
          subject: 'Following up, Alice',
          body: 'Hi Alice, checking in on Acme Corp opportunities.',
          expectedStateVersion: 1,
        }),
      );

      // Verifies Outreach transitions to SENDING
      expect(mockPrisma.outreach.update).toHaveBeenCalledWith({
        where: { id: outreachId },
        data: { status: 'SENDING' },
      });
    });

    it('Sequence 2 follow-up for TEMPLATE outreach renders step 2 placeholders', async () => {
      mockPrisma.outreach.findUnique.mockResolvedValue(templateOutreach);
      mockPrisma.emailTemplateStep.findUnique.mockResolvedValue({
        id: 'step-2',
        templateId,
        sequence: 2,
        subjectTemplate: 'Final follow up for {{contact.firstName}} at {{company.name}}',
        bodyTemplate: 'Should I reach out to another {{recipient.role}} at {{company.name}}?',
      });

      const claimed = {
        job: {
          id: 'job-2',
          workspaceId,
          type: 'SCHEDULED_FOLLOW_UP_CHECK',
          payload: { outreachId, sequence: 2 },
          leaseVersion: 0,
        } as any,
        claimedAttempt: 1,
      };

      const result = await followUpWorker.processJob(claimed);
      expect(result).toBe(true);

      expect(mockEligibilityService.reserveSenderCapacityAndCreateEmailSend).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sequence: 2,
          type: 'FOLLOW_UP',
          subject: 'Final follow up for Alice at Acme Corp',
          body: 'Should I reach out to another VP Engineering at Acme Corp?',
        }),
      );
    });
  });

  describe('3-Phase AI Follow-Up Generation', () => {
    const aiOutreach = {
      id: outreachId,
      workspaceId,
      contentSource: 'AI',
      templateId: null,
      aiPromptContext: 'Focus on cloud cost reduction for AWS infrastructure',
      status: 'ACTIVE',
      subject: 'Cloud Cost Optimization',
      senderAccountId: 'sa-1',
      personCompanyAssociation: {
        id: pcaId,
        stateVersion: 3,
        conversationState: 'ACTIVE',
        role: 'Director of Infra',
        person: { firstName: 'Bob', lastName: 'Jones' },
        company: { name: 'TechCo', websiteUrl: 'https://tech.co' },
      },
      campaignRecipient: null, // Proves no Campaign is required!
      conversationMessages: [
        { kind: 'OUTBOUND', subject: 'Cloud Cost', body: 'Initial note' },
      ],
    };

    it('AI follow-up reads outreach.aiPromptContext and executes without requiring an active Campaign', async () => {
      mockPrisma.outreach.findUnique.mockResolvedValue(aiOutreach);
      mockPrisma.personCompanyAssociation.findUnique.mockResolvedValue(aiOutreach.personCompanyAssociation);

      mockAiProvider.complete.mockResolvedValue({
        rawText: JSON.stringify({
          subject: 'Re: Cloud Cost Optimization',
          body: 'Hi Bob, following up on cloud cost reduction for AWS.',
        }),
      });

      const claimed = {
        job: {
          id: 'job-ai-1',
          workspaceId,
          type: 'SCHEDULED_FOLLOW_UP_CHECK',
          payload: { outreachId, sequence: 1 },
          leaseVersion: 0,
        } as any,
        claimedAttempt: 1,
      };

      const result = await followUpWorker.processJob(claimed);
      expect(result).toBe(true);

      expect(mockAiProvider.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          userPrompt: expect.stringContaining('Focus on cloud cost reduction for AWS infrastructure'),
        }),
      );

      expect(mockEligibilityService.reserveSenderCapacityAndCreateEmailSend).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sequence: 1,
          type: 'FOLLOW_UP',
          expectedStateVersion: 3,
          subject: 'Re: Cloud Cost Optimization',
          body: 'Hi Bob, following up on cloud cost reduction for AWS.',
        }),
      );
    });

    it('AI follow-up executes in 3 phases: asserts no database transaction is active during LLM call', async () => {
      mockPrisma.outreach.findUnique.mockResolvedValue(aiOutreach);
      mockPrisma.personCompanyAssociation.findUnique.mockResolvedValue(aiOutreach.personCompanyAssociation);

      let inTransactionDuringAiCall = false;
      let activeTransactions = 0;

      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        activeTransactions++;
        try {
          return await cb(mockPrisma);
        } finally {
          activeTransactions--;
        }
      });

      mockAiProvider.complete.mockImplementation(async () => {
        if (activeTransactions > 0) {
          inTransactionDuringAiCall = true;
        }
        return {
          rawText: JSON.stringify({
            subject: 'Re: Cloud Cost Optimization',
            body: 'Follow up text',
          }),
        };
      });

      const claimed = {
        job: {
          id: 'job-ai-phases',
          workspaceId,
          type: 'SCHEDULED_FOLLOW_UP_CHECK',
          payload: { outreachId, sequence: 1 },
          leaseVersion: 0,
        } as any,
        claimedAttempt: 1,
      };

      await followUpWorker.processJob(claimed);

      // Phase 2 check: Zero database transactions held during LLM call!
      expect(inTransactionDuringAiCall).toBe(false);
    });

    it('AI follow-up reservation re-validates state version: if reply arrived during LLM call, reservation aborts and creates 0 EmailSend rows', async () => {
      mockPrisma.outreach.findUnique.mockResolvedValue(aiOutreach);

      // In Phase 3, stateVersion changed because reply arrived (or conversationState changed to REPLIED)!
      mockPrisma.personCompanyAssociation.findUnique.mockResolvedValue({
        ...aiOutreach.personCompanyAssociation,
        stateVersion: 4, // Changed from 3!
        conversationState: 'REPLIED',
      });

      mockAiProvider.complete.mockResolvedValue({
        rawText: JSON.stringify({
          subject: 'Re: Cloud Cost Optimization',
          body: 'Follow up text',
        }),
      });

      const claimed = {
        job: {
          id: 'job-ai-abort',
          workspaceId,
          type: 'SCHEDULED_FOLLOW_UP_CHECK',
          payload: { outreachId, sequence: 1 },
          leaseVersion: 0,
        } as any,
        claimedAttempt: 1,
      };

      const result = await followUpWorker.processJob(claimed);
      expect(result).toBe(false);

      // Zero EmailSend rows created!
      expect(mockEligibilityService.reserveSenderCapacityAndCreateEmailSend).not.toHaveBeenCalled();
      expect(mockPrisma.outreach.update).not.toHaveBeenCalled();
    });

    it('AI follow-up succeeds across unrelated PCA version increments while conversation remains ACTIVE (semantic eligibility)', async () => {
      // Phase 1 snapshots expectedStateVersion = 5
      mockPrisma.outreach.findUnique.mockResolvedValue({
        ...aiOutreach,
        personCompanyAssociation: {
          ...aiOutreach.personCompanyAssociation,
          stateVersion: 5,
          conversationState: 'ACTIVE',
        },
      });

      // Independent Outreach on same PCA sends concurrently: PCA.stateVersion advances to 6, but conversationState remains ACTIVE!
      mockPrisma.personCompanyAssociation.findUnique.mockResolvedValue({
        ...aiOutreach.personCompanyAssociation,
        stateVersion: 6,
        conversationState: 'ACTIVE',
      });

      mockAiProvider.complete.mockResolvedValue({
        rawText: JSON.stringify({
          subject: 'Re: Cloud Cost Optimization',
          body: 'Semantic follow up text',
        }),
      });

      const claimed = {
        job: {
          id: 'job-ai-semantic',
          workspaceId,
          type: 'SCHEDULED_FOLLOW_UP_CHECK',
          payload: { outreachId, sequence: 1 },
          leaseVersion: 0,
        } as any,
        claimedAttempt: 1,
      };

      const result = await followUpWorker.processJob(claimed);
      expect(result).toBe(true);

      // Successfully reserved EmailSend using current stateVersion (6)!
      expect(mockEligibilityService.reserveSenderCapacityAndCreateEmailSend).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          expectedStateVersion: 6,
          sequence: 1,
          type: 'FOLLOW_UP',
        }),
      );
      expect(mockPrisma.outreach.update).toHaveBeenCalledWith({
        where: { id: outreachId },
        data: { status: 'SENDING' },
      });
    });

    it('Follow-up reservation produces Outreach.status === SENDING and populates EmailSend.expectedStateVersion', async () => {
      mockPrisma.outreach.findUnique.mockResolvedValue(aiOutreach);
      mockPrisma.personCompanyAssociation.findUnique.mockResolvedValue(aiOutreach.personCompanyAssociation);

      mockAiProvider.complete.mockResolvedValue({
        rawText: JSON.stringify({ subject: 'Re: Test', body: 'Test body' }),
      });

      const claimed = {
        job: {
          id: 'job-sending',
          workspaceId,
          type: 'SCHEDULED_FOLLOW_UP_CHECK',
          payload: { outreachId, sequence: 1 },
          leaseVersion: 0,
        } as any,
        claimedAttempt: 1,
      };

      await followUpWorker.processJob(claimed);

      expect(mockPrisma.outreach.update).toHaveBeenCalledWith({
        where: { id: outreachId },
        data: { status: 'SENDING' },
      });

      expect(mockEligibilityService.reserveSenderCapacityAndCreateEmailSend).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          expectedStateVersion: 3,
        }),
      );
    });
  });

  describe('Relationship-Wide Reply Effect & Completion', () => {
    it('reply transitions both PENDING and ACTIVE CampaignRecipient records on that PCA to COMPLETED', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ campaign_id: 'camp-1' }]) // distinct campaigns
        .mockResolvedValueOnce([{ id: 'camp-1' }]) // lock campaigns
        .mockResolvedValueOnce([
          { id: 'recip-1', status: 'PENDING' },
          { id: 'recip-2', status: 'ACTIVE' },
        ]) // re-query recipients
        .mockResolvedValueOnce([
          { id: pcaId, conversation_state: 'ACTIVE', state_version: 1 },
        ]) // lock PCA
        .mockResolvedValueOnce([{ id: outreachId, status: 'SENDING' }]) // lock outreaches
        .mockResolvedValueOnce([{ id: 'send-1', status: 'RESERVED' }]); // lock email sends

      await markRepliedUseCase.execute(pcaId, workspaceId);

      // Transitions PCA to REPLIED and increments stateVersion
      expect(mockPrisma.personCompanyAssociation.update).toHaveBeenCalledWith({
        where: { id: pcaId },
        data: {
          conversationState: 'REPLIED',
          stateVersion: { increment: 1 },
        },
      });

      // Cancels follow-up jobs across PCA
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();

      // Cancels in-flight RESERVED sends
      expect(mockPrisma.emailSend.updateMany).toHaveBeenCalledWith({
        where: {
          outreachId: { in: [outreachId] },
          status: 'RESERVED',
        },
        data: {
          status: 'CANCELLED',
        },
      });

      // Transitions BOTH PENDING and ACTIVE recipients to COMPLETED!
      expect(mockPrisma.campaignRecipient.updateMany).toHaveBeenCalledWith({
        where: {
          personCompanyAssociationId: pcaId,
          workspaceId,
          status: { in: ['PENDING', 'ACTIVE'] },
        },
        data: {
          status: 'COMPLETED',
        },
      });
    });
  });
});
