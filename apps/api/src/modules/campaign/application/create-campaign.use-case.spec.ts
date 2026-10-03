import { AppValidationException } from '../../../common/errors/application.exception';
import { TemplateEngineService } from '../../template/domain/template-engine.service';
import { CreateCampaignUseCase } from './create-campaign.use-case';

describe('CreateCampaignUseCase', () => {
  let useCase: CreateCampaignUseCase;
  let templateEngine: TemplateEngineService;
  let prisma: any;

  beforeEach(() => {
    templateEngine = new TemplateEngineService();
    prisma = {
      $transaction: jest.fn().mockImplementation(async (cb) => cb(prisma)),
      campaign: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      campaignSenderAccount: {
        createMany: jest.fn(),
      },
      emailTemplate: {
        findFirst: jest.fn(),
      },
      senderAccount: {
        findMany: jest.fn().mockResolvedValue([{ id: 'sa-1', workspaceId: 'ws-1' }]),
      },
    };

    useCase = new CreateCampaignUseCase(prisma, templateEngine);
  });

  it('throws 400 Bad Request if TEMPLATE campaign is missing required sequence (e.g. non-contiguous 0, 2 for maxFollowUps = 2)', async () => {
    prisma.emailTemplate.findFirst.mockResolvedValue({
      id: 'tmpl-1',
      workspaceId: 'ws-1',
      name: 'Broken steps',
      isArchived: false,
      steps: [
        { sequence: 0, subjectTemplate: 'S0', bodyTemplate: 'B0' },
        { sequence: 2, subjectTemplate: 'S2', bodyTemplate: 'B2' },
      ],
    });

    await expect(
      useCase.execute('ws-1', {
        name: 'Enterprise Outreach',
        contentSource: 'TEMPLATE',
        templateId: 'tmpl-1',
        maxFollowUps: 2,
        senderAccountIds: ['sa-1'],
      }),
    ).rejects.toThrow(AppValidationException);
  });

  it('throws 400 Bad Request if TEMPLATE campaign provides aiPromptContext', async () => {
    await expect(
      useCase.execute('ws-1', {
        name: 'Enterprise Outreach',
        contentSource: 'TEMPLATE',
        templateId: 'tmpl-1',
        aiPromptContext: 'Some prompt context',
        senderAccountIds: ['sa-1'],
      }),
    ).rejects.toThrow(AppValidationException);
  });

  it('throws 400 Bad Request if AI campaign provides templateId', async () => {
    await expect(
      useCase.execute('ws-1', {
        name: 'Enterprise Outreach',
        contentSource: 'AI',
        templateId: 'tmpl-1',
        senderAccountIds: ['sa-1'],
      }),
    ).rejects.toThrow(AppValidationException);
  });

  it('throws 400 Bad Request if TEMPLATE campaign references template with {{sender.name}}', async () => {
    prisma.emailTemplate.findFirst.mockResolvedValue({
      id: 'tmpl-1',
      workspaceId: 'ws-1',
      name: 'Sender template',
      isArchived: false,
      steps: [
        { sequence: 0, subjectTemplate: 'Hello', bodyTemplate: 'Best, {{sender.name}}' },
      ],
    });

    await expect(
      useCase.execute('ws-1', {
        name: 'Enterprise Outreach',
        contentSource: 'TEMPLATE',
        templateId: 'tmpl-1',
        maxFollowUps: 0,
        senderAccountIds: ['sa-1'],
      }),
    ).rejects.toThrow(AppValidationException);
  });

  it('throws 400 Bad Request if TEMPLATE campaign references archived template', async () => {
    prisma.emailTemplate.findFirst.mockResolvedValue({
      id: 'tmpl-1',
      workspaceId: 'ws-1',
      name: 'Archived template',
      isArchived: true,
      steps: [{ sequence: 0, subjectTemplate: 'Hello', bodyTemplate: 'World' }],
    });

    await expect(
      useCase.execute('ws-1', {
        name: 'Enterprise Outreach',
        contentSource: 'TEMPLATE',
        templateId: 'tmpl-1',
        maxFollowUps: 0,
        senderAccountIds: ['sa-1'],
      }),
    ).rejects.toThrow(AppValidationException);
  });

  it('creates an AI campaign with aiPromptContext successfully', async () => {
    prisma.campaign.create.mockResolvedValue({
      id: 'camp-1',
      workspaceId: 'ws-1',
      name: 'AI Campaign',
      status: 'DRAFT',
      contentSource: 'AI',
      templateId: null,
      aiPromptContext: 'Target CFOs with ROI focus',
      followUpDelayBusinessDays: 3,
      maxFollowUps: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await useCase.execute('ws-1', {
      name: 'AI Campaign',
      contentSource: 'AI',
      aiPromptContext: 'Target CFOs with ROI focus',
      maxFollowUps: 2,
      senderAccountIds: ['sa-1'],
    });

    expect(res.id).toBe('camp-1');
    expect(res.contentSource).toBe('AI');
    expect(res.aiPromptContext).toBe('Target CFOs with ROI focus');
    expect(prisma.campaignSenderAccount.createMany).toHaveBeenCalledWith({
      data: [{ campaignId: 'camp-1', senderAccountId: 'sa-1' }],
    });
  });
});
