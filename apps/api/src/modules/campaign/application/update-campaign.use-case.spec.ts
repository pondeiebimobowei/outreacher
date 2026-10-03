import { AppNotFoundException, AppValidationException } from '../../../common/errors/application.exception';
import { TemplateEngineService } from '../../template/domain/template-engine.service';
import { UpdateCampaignUseCase } from './update-campaign.use-case';

describe('UpdateCampaignUseCase', () => {
  let useCase: UpdateCampaignUseCase;
  let templateEngine: TemplateEngineService;
  let prisma: any;

  beforeEach(() => {
    templateEngine = new TemplateEngineService();
    prisma = {
      $transaction: jest.fn().mockImplementation(async (cb) => cb(prisma)),
      campaign: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      campaignSenderAccount: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      emailTemplate: {
        findFirst: jest.fn(),
      },
      senderAccount: {
        findMany: jest.fn().mockResolvedValue([{ id: 'sa-1', workspaceId: 'ws-1' }]),
      },
      outreach: {
        findMany: jest.fn().mockResolvedValue([{ id: 'out-1', maxFollowUps: 2 }]),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    useCase = new UpdateCampaignUseCase(prisma, templateEngine);
  });

  it('throws 400 Bad Request when increasing maxFollowUps beyond available template sequences', async () => {
    prisma.campaign.findFirst.mockResolvedValue({
      id: 'camp-1',
      workspaceId: 'ws-1',
      name: 'Existing Campaign',
      status: 'DRAFT',
      contentSource: 'TEMPLATE',
      templateId: 'tmpl-1',
      maxFollowUps: 1,
    });
    prisma.emailTemplate.findFirst.mockResolvedValue({
      id: 'tmpl-1',
      workspaceId: 'ws-1',
      name: 'Two step template',
      isArchived: false,
      steps: [
        { sequence: 0, subjectTemplate: 'S0', bodyTemplate: 'B0' },
        { sequence: 1, subjectTemplate: 'S1', bodyTemplate: 'B1' },
      ],
    });

    await expect(
      useCase.execute('ws-1', 'camp-1', {
        maxFollowUps: 2, // requires sequence 2 which doesn't exist
      }),
    ).rejects.toThrow(AppValidationException);
  });

  it('throws 400 Bad Request when updating template to one containing {{sender.name}}', async () => {
    prisma.campaign.findFirst.mockResolvedValue({
      id: 'camp-1',
      workspaceId: 'ws-1',
      name: 'Existing Campaign',
      status: 'DRAFT',
      contentSource: 'TEMPLATE',
      templateId: 'tmpl-1',
      maxFollowUps: 0,
    });
    prisma.emailTemplate.findFirst.mockResolvedValue({
      id: 'tmpl-2',
      workspaceId: 'ws-1',
      name: 'Template with sender',
      isArchived: false,
      steps: [
        { sequence: 0, subjectTemplate: 'S0', bodyTemplate: 'Best, {{sender.name}}' },
      ],
    });

    await expect(
      useCase.execute('ws-1', 'camp-1', {
        templateId: 'tmpl-2',
      }),
    ).rejects.toThrow(AppValidationException);
  });

  it('throws 400 Bad Request when updating template to an archived template', async () => {
    prisma.campaign.findFirst.mockResolvedValue({
      id: 'camp-1',
      workspaceId: 'ws-1',
      name: 'Existing Campaign',
      status: 'DRAFT',
      contentSource: 'TEMPLATE',
      templateId: 'tmpl-1',
      maxFollowUps: 0,
    });
    prisma.emailTemplate.findFirst.mockResolvedValue({
      id: 'tmpl-archived',
      workspaceId: 'ws-1',
      name: 'Archived',
      isArchived: true,
      steps: [{ sequence: 0, subjectTemplate: 'S0', bodyTemplate: 'B0' }],
    });

    await expect(
      useCase.execute('ws-1', 'camp-1', {
        templateId: 'tmpl-archived',
      }),
    ).rejects.toThrow(AppValidationException);
  });

  it('Activation Gate: rejects transition to ACTIVE if template is missing required sequence', async () => {
    prisma.campaign.findFirst.mockResolvedValue({
      id: 'camp-1',
      workspaceId: 'ws-1',
      name: 'Draft Campaign',
      status: 'DRAFT',
      contentSource: 'TEMPLATE',
      templateId: 'tmpl-1',
      maxFollowUps: 2,
    });
    // Template steps 0 and 1 exist, but step 2 was deleted
    prisma.emailTemplate.findFirst.mockResolvedValue({
      id: 'tmpl-1',
      workspaceId: 'ws-1',
      name: 'Truncated Template',
      isArchived: false,
      steps: [
        { sequence: 0, subjectTemplate: 'S0', bodyTemplate: 'B0' },
        { sequence: 1, subjectTemplate: 'S1', bodyTemplate: 'B1' },
      ],
    });

    await expect(
      useCase.execute('ws-1', 'camp-1', {
        status: 'ACTIVE',
      }),
    ).rejects.toThrow(AppValidationException);
  });

  it('modifying Campaign.maxFollowUps leaves existing Outreach.maxFollowUps intact', async () => {
    prisma.campaign.findFirst.mockResolvedValue({
      id: 'camp-1',
      workspaceId: 'ws-1',
      name: 'Existing Campaign',
      status: 'DRAFT',
      contentSource: 'AI',
      templateId: null,
      maxFollowUps: 2,
    });
    prisma.campaign.update.mockResolvedValue({
      id: 'camp-1',
      workspaceId: 'ws-1',
      name: 'Existing Campaign',
      status: 'DRAFT',
      contentSource: 'AI',
      templateId: null,
      maxFollowUps: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await useCase.execute('ws-1', 'camp-1', {
      maxFollowUps: 4,
    });

    // Outreach records must NOT be updated
    expect(prisma.outreach.update).not.toHaveBeenCalled();
    expect(prisma.outreach.updateMany).not.toHaveBeenCalled();
  });
});
