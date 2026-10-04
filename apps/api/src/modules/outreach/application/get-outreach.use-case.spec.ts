import { AppNotFoundException } from '../../../common/errors/application.exception';
import { GetOutreachUseCase } from './get-outreach.use-case';

describe('GetOutreachUseCase', () => {
  let useCase: GetOutreachUseCase;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      outreach: {
        findFirst: jest.fn(),
      },
    };
    useCase = new GetOutreachUseCase(prisma);
  });

  it('throws 404 if outreach not found in workspace', async () => {
    prisma.outreach.findFirst.mockResolvedValue(null);

    await expect(useCase.execute('ws-1', 'out-1')).rejects.toThrow(AppNotFoundException);
  });

  it('returns thread details including contentSource, templateId, aiPromptContext, and draftVersion', async () => {
    prisma.outreach.findFirst.mockResolvedValue({
      id: 'out-1',
      workspaceId: 'ws-1',
      personCompanyAssociationId: 'pca-1',
      campaignRecipientId: 'recip-1',
      senderAccountId: 'sa-1',
      contentSource: 'AI',
      templateId: null,
      aiPromptContext: 'Focus on CFO value',
      aiGenerationStatus: 'SUCCEEDED',
      draftVersion: 2,
      subject: 'Generated Subject',
      message: 'Generated Body',
      outreachReason: 'Executive transition',
      status: 'DRAFT',
      maxFollowUps: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
      emailSends: [],
    });

    const res = await useCase.execute('ws-1', 'out-1');
    expect(res.id).toBe('out-1');
    expect(res.contentSource).toBe('AI');
    expect(res.templateId).toBeNull();
    expect(res.aiPromptContext).toBe('Focus on CFO value');
    expect(res.aiGenerationStatus).toBe('SUCCEEDED');
    expect(res.draftVersion).toBe(2);
  });
});
