import {
  AppConflictException,
  AppForbiddenException,
  AppUnprocessableEntityException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { TemplateEngineService } from '../../template/domain/template-engine.service';
import { CreateOutreachUseCase } from './create-outreach.use-case';

describe('CreateOutreachUseCase', () => {
  let useCase: CreateOutreachUseCase;
  let templateEngine: TemplateEngineService;
  let prisma: any;

  beforeEach(() => {
    templateEngine = new TemplateEngineService();
    prisma = {
      $transaction: jest.fn().mockImplementation(async (cb) => cb(prisma)),
      idempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }) => data),
      },
      personCompanyAssociation: {
        findFirst: jest.fn(),
      },
      suppression: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      campaign: {
        findFirst: jest.fn(),
      },
      campaignRecipient: {
        findFirst: jest.fn(),
      },
      emailTemplate: {
        findFirst: jest.fn(),
      },
      emailTemplateStep: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      senderAccount: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      outreach: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      job: {
        create: jest.fn(),
      },
    };

    useCase = new CreateOutreachUseCase(prisma, templateEngine);
  });

  describe('ContentSource Invariants & Validation', () => {
    it('throws 400 Bad Request when missing idempotency key', async () => {
      await expect(
        useCase.execute('ws-1', { personCompanyAssociationId: 'pca-1' }, ''),
      ).rejects.toThrow(AppValidationException);
    });

    it('throws 400 Bad Request if MANUAL content source provides templateId', async () => {
      await expect(
        useCase.execute(
          'ws-1',
          {
            personCompanyAssociationId: 'pca-1',
            contentSource: 'MANUAL',
            templateId: 'tmpl-1',
          },
          'idem-1',
        ),
      ).rejects.toThrow(AppValidationException);
    });

    it('throws 400 Bad Request if TEMPLATE content source provides aiPromptContext', async () => {
      await expect(
        useCase.execute(
          'ws-1',
          {
            personCompanyAssociationId: 'pca-1',
            contentSource: 'TEMPLATE',
            templateId: 'tmpl-1',
            aiPromptContext: 'Some prompt context',
          },
          'idem-1',
        ),
      ).rejects.toThrow(AppValidationException);
    });

    it('throws 400 Bad Request if AI content source provides templateId', async () => {
      await expect(
        useCase.execute(
          'ws-1',
          {
            personCompanyAssociationId: 'pca-1',
            contentSource: 'AI',
            templateId: 'tmpl-1',
          },
          'idem-1',
        ),
      ).rejects.toThrow(AppValidationException);
    });

    it('throws 400 Bad Request if campaign outreach client sends contentSource or templateId override', async () => {
      await expect(
        useCase.execute(
          'ws-1',
          {
            personCompanyAssociationId: 'pca-1',
            campaignRecipientId: 'recip-1',
            contentSource: 'MANUAL',
          },
          'idem-1',
        ),
      ).rejects.toThrow(AppValidationException);
    });
  });

  describe('Suppression & Stopped Check', () => {
    it('throws 422 Unprocessable Entity when contact is STOPPED', async () => {
      prisma.personCompanyAssociation.findFirst.mockResolvedValue({
        id: 'pca-1',
        workspaceId: 'ws-1',
        conversationState: 'STOPPED',
        person: { id: 'p-1', email: 'test@example.com' },
        company: { id: 'c-1', name: 'Acme' },
      });

      await expect(
        useCase.execute(
          'ws-1',
          {
            personCompanyAssociationId: 'pca-1',
            contentSource: 'MANUAL',
          },
          'idem-1',
        ),
      ).rejects.toThrow(AppUnprocessableEntityException);
    });

    it('throws 422 Unprocessable Entity when email is suppressed in workspace', async () => {
      prisma.personCompanyAssociation.findFirst.mockResolvedValue({
        id: 'pca-1',
        workspaceId: 'ws-1',
        conversationState: 'NO_REPLY',
        person: { id: 'p-1', email: 'suppressed@example.com' },
        company: { id: 'c-1', name: 'Acme' },
      });
      prisma.suppression.findFirst.mockResolvedValue({
        id: 'supp-1',
        workspaceId: 'ws-1',
        email: 'suppressed@example.com',
      });

      await expect(
        useCase.execute(
          'ws-1',
          {
            personCompanyAssociationId: 'pca-1',
            contentSource: 'MANUAL',
          },
          'idem-1',
        ),
      ).rejects.toThrow(AppUnprocessableEntityException);
    });
  });

  describe('One-Off Outreach Creation', () => {
    beforeEach(() => {
      prisma.personCompanyAssociation.findFirst.mockResolvedValue({
        id: 'pca-1',
        workspaceId: 'ws-1',
        conversationState: 'NO_REPLY',
        role: 'VP Engineering',
        person: { firstName: 'Alice', lastName: 'Doe', email: 'alice@example.com' },
        company: { name: 'Acme Inc', websiteUrl: 'https://acme.inc' },
      });
    });

    it('persists aiPromptContext on Outreach for one-off AI outreach and enqueues Job', async () => {
      prisma.outreach.create.mockImplementation(({ data }) => ({
        id: 'out-1',
        ...data,
      }));

      const result = await useCase.execute(
        'ws-1',
        {
          personCompanyAssociationId: 'pca-1',
          contentSource: 'AI',
          aiPromptContext: 'Focus on recent funding round',
        },
        'idem-ai-1',
      );

      expect(prisma.outreach.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contentSource: 'AI',
            templateId: null,
            aiPromptContext: 'Focus on recent funding round',
            aiGenerationStatus: 'PENDING',
            draftVersion: 0,
            subject: '',
            message: '',
          }),
        }),
      );
      expect(prisma.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'OUTREACH_GENERATION',
            idempotencyKey: 'outreach-gen:out-1',
            payload: { outreachId: 'out-1', expectedDraftVersion: 0 },
          }),
        }),
      );
      expect(result.aiPromptContext).toBe('Focus on recent funding round');
      expect(result.aiGenerationStatus).toBe('PENDING');
    });

    it('throws 400 Bad Request for one-off TEMPLATE with {{sender.name}} if senderAccountId is missing', async () => {
      prisma.emailTemplate.findFirst.mockResolvedValue({
        id: 'tmpl-1',
        workspaceId: 'ws-1',
        name: 'Template with sender',
        isArchived: false,
        steps: [
          { sequence: 0, subjectTemplate: 'Hello', bodyTemplate: 'Best, {{sender.name}}' },
          { sequence: 1, subjectTemplate: 'Follow-up', bodyTemplate: 'From {{sender.name}}' },
          { sequence: 2, subjectTemplate: 'Final', bodyTemplate: 'From {{sender.name}}' },
        ],
      });

      await expect(
        useCase.execute(
          'ws-1',
          {
            personCompanyAssociationId: 'pca-1',
            contentSource: 'TEMPLATE',
            templateId: 'tmpl-1',
            maxFollowUps: 2,
          },
          'idem-tmpl-1',
        ),
      ).rejects.toThrow(AppValidationException);
    });

    it('throws 403 Forbidden for one-off TEMPLATE with {{sender.name}} if sender belongs to different workspace', async () => {
      prisma.emailTemplate.findFirst.mockResolvedValue({
        id: 'tmpl-1',
        workspaceId: 'ws-1',
        name: 'Template with sender',
        isArchived: false,
        steps: [
          { sequence: 0, subjectTemplate: 'Hello', bodyTemplate: 'Best, {{sender.name}}' },
        ],
      });
      prisma.senderAccount.findFirst.mockResolvedValue({
        id: 'sender-1',
        workspaceId: 'different-ws',
      });

      await expect(
        useCase.execute(
          'ws-1',
          {
            personCompanyAssociationId: 'pca-1',
            contentSource: 'TEMPLATE',
            templateId: 'tmpl-1',
            senderAccountId: 'sender-1',
            maxFollowUps: 0,
          },
          'idem-tmpl-2',
        ),
      ).rejects.toThrow(AppForbiddenException);
    });

    it('throws 400 Bad Request for TEMPLATE missing sequence 1 when maxFollowUps = 2', async () => {
      prisma.emailTemplate.findFirst.mockResolvedValue({
        id: 'tmpl-1',
        workspaceId: 'ws-1',
        name: 'Gap template',
        isArchived: false,
        steps: [
          { sequence: 0, subjectTemplate: 'S0', bodyTemplate: 'B0' },
          { sequence: 2, subjectTemplate: 'S2', bodyTemplate: 'B2' },
        ],
      });

      await expect(
        useCase.execute(
          'ws-1',
          {
            personCompanyAssociationId: 'pca-1',
            contentSource: 'TEMPLATE',
            templateId: 'tmpl-1',
            maxFollowUps: 2,
          },
          'idem-tmpl-3',
        ),
      ).rejects.toThrow(AppValidationException);
    });

    it('renders step 0 placeholders into subject and message and sets aiPromptContext = null for one-off TEMPLATE', async () => {
      prisma.emailTemplate.findFirst.mockResolvedValue({
        id: 'tmpl-1',
        workspaceId: 'ws-1',
        name: 'Standard Template',
        isArchived: false,
        steps: [
          {
            sequence: 0,
            subjectTemplate: 'Hi {{contact.firstName}} at {{company.name}}',
            bodyTemplate: 'We can help {{company.name}} grow.',
          },
        ],
      });
      prisma.outreach.create.mockImplementation(({ data }) => ({
        id: 'out-tmpl-1',
        ...data,
      }));

      const result = await useCase.execute(
        'ws-1',
        {
          personCompanyAssociationId: 'pca-1',
          contentSource: 'TEMPLATE',
          templateId: 'tmpl-1',
          maxFollowUps: 0,
        },
        'idem-tmpl-4',
      );

      expect(result.subject).toBe('Hi Alice at Acme Inc');
      expect(result.message).toBe('We can help Acme Inc grow.');
      expect(result.aiPromptContext).toBeNull();
      expect(result.templateId).toBe('tmpl-1');
    });

    it('allows multiple one-off outreaches with campaignRecipientId = null on the same PCA', async () => {
      prisma.outreach.create
        .mockResolvedValueOnce({
          id: 'out-1',
          campaignRecipientId: null,
          personCompanyAssociationId: 'pca-1',
          status: 'DRAFT',
        })
        .mockResolvedValueOnce({
          id: 'out-2',
          campaignRecipientId: null,
          personCompanyAssociationId: 'pca-1',
          status: 'DRAFT',
        });

      const res1 = await useCase.execute(
        'ws-1',
        { personCompanyAssociationId: 'pca-1', contentSource: 'MANUAL', subject: 'One', message: 'First' },
        'idem-mult-1',
      );
      const res2 = await useCase.execute(
        'ws-1',
        { personCompanyAssociationId: 'pca-1', contentSource: 'MANUAL', subject: 'Two', message: 'Second' },
        'idem-mult-2',
      );

      expect(res1.id).toBe('out-1');
      expect(res2.id).toBe('out-2');
    });
  });

  describe('Campaign-Linked Outreach Creation', () => {
    beforeEach(() => {
      prisma.personCompanyAssociation.findFirst.mockResolvedValue({
        id: 'pca-1',
        workspaceId: 'ws-1',
        conversationState: 'NO_REPLY',
        role: 'CTO',
        person: { firstName: 'Bob', lastName: 'Builder', email: 'bob@example.com' },
        company: { name: 'BuildCo', websiteUrl: 'https://build.co' },
      });
      prisma.campaignRecipient.findFirst.mockResolvedValue({
        id: 'recip-1',
        workspaceId: 'ws-1',
        campaignId: 'camp-1',
        personCompanyAssociationId: 'pca-1',
        targetRole: 'CTO',
        status: 'PENDING',
      });
    });

    it('snapshots Campaign.aiPromptContext onto Outreach.aiPromptContext for campaign AI outreach', async () => {
      prisma.campaign.findFirst.mockResolvedValue({
        id: 'camp-1',
        workspaceId: 'ws-1',
        name: 'Enterprise Outreach',
        contentSource: 'AI',
        templateId: null,
        aiPromptContext: 'Target engineering leadership on tech stack modernization',
        maxFollowUps: 3,
      });
      prisma.outreach.create.mockImplementation(({ data }) => ({
        id: 'out-camp-ai-1',
        ...data,
      }));

      const res = await useCase.execute(
        'ws-1',
        {
          personCompanyAssociationId: 'pca-1',
          campaignRecipientId: 'recip-1',
        },
        'idem-camp-ai',
      );

      expect(res.aiPromptContext).toBe(
        'Target engineering leadership on tech stack modernization',
      );
      expect(res.contentSource).toBe('AI');
      expect(res.maxFollowUps).toBe(3);
      expect(prisma.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'OUTREACH_GENERATION',
            idempotencyKey: 'outreach-gen:out-camp-ai-1',
          }),
        }),
      );
    });

    it('throws 409 Conflict if another Outreach already exists for the campaignRecipientId', async () => {
      prisma.campaign.findFirst.mockResolvedValue({
        id: 'camp-1',
        workspaceId: 'ws-1',
        name: 'Enterprise Outreach',
        contentSource: 'AI',
        maxFollowUps: 2,
      });
      prisma.outreach.findFirst.mockResolvedValue({
        id: 'existing-outreach',
        campaignRecipientId: 'recip-1',
      });

      await expect(
        useCase.execute(
          'ws-1',
          {
            personCompanyAssociationId: 'pca-1',
            campaignRecipientId: 'recip-1',
          },
          'idem-camp-dup',
        ),
      ).rejects.toThrow(AppConflictException);
    });
  });

  describe('Idempotency Fingerprinting', () => {
    it('throws 409 Conflict if idempotency key reused with different payload fingerprint', async () => {
      prisma.idempotencyRecord.findFirst.mockResolvedValue({
        id: 'rec-1',
        workspaceId: 'ws-1',
        operation: 'POST:/outreaches',
        key: 'reused-key',
        targetId: 'pca-1',
        requestHash: 'different-hash',
      });

      await expect(
        useCase.execute(
          'ws-1',
          {
            personCompanyAssociationId: 'pca-1',
            contentSource: 'MANUAL',
            subject: 'New Payload',
          },
          'reused-key',
        ),
      ).rejects.toThrow(AppConflictException);
    });
  });
});
