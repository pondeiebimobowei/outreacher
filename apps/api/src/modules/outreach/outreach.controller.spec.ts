import { Test, TestingModule } from '@nestjs/testing';
import { OutreachController } from './outreach.controller';
import { GenerateOutreachUseCase } from './application/generate-outreach.use-case';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('OutreachController', () => {
  let controller: OutreachController;
  let useCase: any;

  beforeEach(async () => {
    useCase = {
      execute: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OutreachController],
      providers: [{ provide: GenerateOutreachUseCase, useValue: useCase }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(WorkspaceGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OutreachController>(OutreachController);
  });

  it('delegates POST /api/v1/campaign-contacts/:id/generate-outreach to GenerateOutreachUseCase with userId', async () => {
    useCase.execute.mockResolvedValue({ jobId: 'job-123', status: 'QUEUED' });

    const response = await controller.generateOutreach(
      { id: 'usr-123' },
      { id: 'ws-123' },
      'cc-456',
    );

    expect(response).toEqual({ jobId: 'job-123', status: 'QUEUED' });
    expect(useCase.execute).toHaveBeenCalledWith({
      userId: 'usr-123',
      workspaceId: 'ws-123',
      campaignContactId: 'cc-456',
    });
  });
});
