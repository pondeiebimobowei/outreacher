import { AppConflictException, AppNotFoundException } from '../../../common/errors/application.exception';
import { TemplateEngineService } from '../domain/template-engine.service';
import { SetTemplateStepsUseCase } from './set-template-steps.use-case';

describe('SetTemplateStepsUseCase', () => {
  let useCase: SetTemplateStepsUseCase;
  let templateEngine: TemplateEngineService;
  let prisma: any;

  beforeEach(() => {
    templateEngine = new TemplateEngineService();
    prisma = {
      $transaction: jest.fn().mockImplementation(async (cb) => cb(prisma)),
      $executeRaw: jest.fn().mockResolvedValue(1),
      emailTemplate: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      emailTemplateStep: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(),
      },
      campaign: {
        findMany: jest.fn(),
      },
      outreach: {
        findMany: jest.fn(),
      },
    };
    useCase = new SetTemplateStepsUseCase(prisma, templateEngine);
  });

  it('should throw AppNotFoundException if template does not exist in workspace', async () => {
    prisma.emailTemplate.findFirst.mockResolvedValue(null);

    await expect(
      useCase.execute('ws-1', 'tmpl-1', {
        steps: [{ sequence: 0, subjectTemplate: 'Sub', bodyTemplate: 'Body' }],
      }),
    ).rejects.toThrow(AppNotFoundException);
  });

  it('should throw AppConflictException if removing step 2 when active Campaign requires steps 0..2', async () => {
    prisma.emailTemplate.findFirst.mockResolvedValue({
      id: 'tmpl-1',
      workspaceId: 'ws-1',
      name: 'Standard Sequence',
      isArchived: false,
    });

    // Active campaign requires up to follow-up 2 (sequences 0, 1, 2)
    prisma.campaign.findMany.mockResolvedValue([
      { id: 'camp-1', name: 'Q4 Enterprise', status: 'ACTIVE', maxFollowUps: 2 },
    ]);
    prisma.outreach.findMany.mockResolvedValue([]);

    // Incoming payload only has sequence 0 and 1 (sequence 2 removed!)
    await expect(
      useCase.execute('ws-1', 'tmpl-1', {
        steps: [
          { sequence: 0, subjectTemplate: 'S0', bodyTemplate: 'B0' },
          { sequence: 1, subjectTemplate: 'S1', bodyTemplate: 'B1' },
        ],
      }),
    ).rejects.toThrow(AppConflictException);
  });

  it('should throw AppConflictException if removing step 2 when active Outreach requires steps 0..2', async () => {
    prisma.emailTemplate.findFirst.mockResolvedValue({
      id: 'tmpl-1',
      workspaceId: 'ws-1',
      name: 'Standard Sequence',
      isArchived: false,
    });

    prisma.campaign.findMany.mockResolvedValue([]);
    // Active outreach requires up to follow-up 2
    prisma.outreach.findMany.mockResolvedValue([
      { id: 'outreach-1', status: 'ACTIVE', maxFollowUps: 2 },
    ]);

    await expect(
      useCase.execute('ws-1', 'tmpl-1', {
        steps: [
          { sequence: 0, subjectTemplate: 'S0', bodyTemplate: 'B0' },
          { sequence: 1, subjectTemplate: 'S1', bodyTemplate: 'B1' },
        ],
      }),
    ).rejects.toThrow(AppConflictException);
  });

  it('should succeed when modifying text of step 1 while preserving required sequence count', async () => {
    prisma.emailTemplate.findFirst.mockResolvedValue({
      id: 'tmpl-1',
      workspaceId: 'ws-1',
      name: 'Standard Sequence',
      isArchived: false,
    });

    prisma.campaign.findMany.mockResolvedValue([
      { id: 'camp-1', name: 'Q4 Enterprise', status: 'ACTIVE', maxFollowUps: 2 },
    ]);
    prisma.outreach.findMany.mockResolvedValue([]);

    const updatedSteps = [
      { sequence: 0, subjectTemplate: 'S0', bodyTemplate: 'B0' },
      { sequence: 1, subjectTemplate: 'S1 modified', bodyTemplate: 'B1 modified' },
      { sequence: 2, subjectTemplate: 'S2', bodyTemplate: 'B2' },
    ];

    prisma.emailTemplateStep.findMany.mockResolvedValue(updatedSteps);

    const result = await useCase.execute('ws-1', 'tmpl-1', { steps: updatedSteps });
    expect(result.steps).toHaveLength(3);
    expect(prisma.emailTemplateStep.deleteMany).toHaveBeenCalled();
    expect(prisma.emailTemplateStep.createMany).toHaveBeenCalled();
  });

  it('should succeed when adding a new step (step 3) to referenced template', async () => {
    prisma.emailTemplate.findFirst.mockResolvedValue({
      id: 'tmpl-1',
      workspaceId: 'ws-1',
      name: 'Standard Sequence',
      isArchived: false,
    });

    prisma.campaign.findMany.mockResolvedValue([
      { id: 'camp-1', name: 'Q4 Enterprise', status: 'ACTIVE', maxFollowUps: 2 },
    ]);
    prisma.outreach.findMany.mockResolvedValue([]);

    const expandedSteps = [
      { sequence: 0, subjectTemplate: 'S0', bodyTemplate: 'B0' },
      { sequence: 1, subjectTemplate: 'S1', bodyTemplate: 'B1' },
      { sequence: 2, subjectTemplate: 'S2', bodyTemplate: 'B2' },
      { sequence: 3, subjectTemplate: 'S3', bodyTemplate: 'B3' },
    ];

    prisma.emailTemplateStep.findMany.mockResolvedValue(expandedSteps);

    const result = await useCase.execute('ws-1', 'tmpl-1', { steps: expandedSteps });
    expect(result.steps).toHaveLength(4);
  });

  it('should succeed when storing arbitrary non-contiguous sequences (e.g. 0, 2) for an unreferenced template', async () => {
    prisma.emailTemplate.findFirst.mockResolvedValue({
      id: 'tmpl-1',
      workspaceId: 'ws-1',
      name: 'Custom Sequence',
      isArchived: false,
    });

    prisma.campaign.findMany.mockResolvedValue([]);
    prisma.outreach.findMany.mockResolvedValue([]);

    const nonContiguousSteps = [
      { sequence: 0, subjectTemplate: 'Initial S0', bodyTemplate: 'Initial B0' },
      { sequence: 2, subjectTemplate: 'Follow-up S2', bodyTemplate: 'Follow-up B2' },
    ];

    prisma.emailTemplateStep.findMany.mockResolvedValue(nonContiguousSteps);

    const result = await useCase.execute('ws-1', 'tmpl-1', { steps: nonContiguousSteps });
    expect(result.steps).toHaveLength(2);
    expect(prisma.emailTemplateStep.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ sequence: 0 }),
        expect.objectContaining({ sequence: 2 }),
      ]),
    });
  });
});
