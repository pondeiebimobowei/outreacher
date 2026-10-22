import { Test, TestingModule } from '@nestjs/testing';
import { OutreachController } from './outreach.controller';
import { GenerateOutreachUseCase } from './application/generate-outreach.use-case';
import { UpdateDraftUseCase } from './application/update-draft.use-case';
import { ApproveDraftUseCase } from './application/approve-draft.use-case';
import { GetCampaignContactUseCase } from './application/get-campaign-contact.use-case';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('OutreachController', () => {
  let controller: OutreachController;
  let useCase: any;
  let updateUseCase: any;
  let approveUseCase: any;
  let getUseCase: any;

  beforeEach(async () => {
    useCase = { execute: jest.fn() };
    updateUseCase = { execute: jest.fn() };
    approveUseCase = { execute: jest.fn() };
    getUseCase = { execute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OutreachController],
      providers: [
        { provide: GenerateOutreachUseCase, useValue: useCase },
        { provide: UpdateDraftUseCase, useValue: updateUseCase },
        { provide: ApproveDraftUseCase, useValue: approveUseCase },
        { provide: GetCampaignContactUseCase, useValue: getUseCase },
      ],
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
      campaignMemberId: 'cc-456',
    });
  });

  it('delegates PATCH /api/v1/campaign-contacts/:id/draft to UpdateDraftUseCase', async () => {
    updateUseCase.execute.mockResolvedValue({ status: 'PENDING' });

    const response = await controller.updateDraft({ id: 'ws-123' }, 'cc-456', {
      subject: 'New Subject',
      bodyText: 'New Body',
    });

    expect(response).toEqual({ status: 'PENDING' });
    expect(updateUseCase.execute).toHaveBeenCalledWith({
      workspaceId: 'ws-123',
      campaignMemberId: 'cc-456',
      subject: 'New Subject',
      bodyText: 'New Body',
    });
  });

  it('delegates GET /api/v1/campaign-contacts/:id to GetCampaignContactUseCase', async () => {
    getUseCase.execute.mockResolvedValue({ id: 'cc-456', status: 'PENDING' });

    const response = await controller.getCampaignContact(
      { id: 'ws-123' },
      'cc-456',
    );

    expect(response).toEqual({ id: 'cc-456', status: 'PENDING' });
    expect(getUseCase.execute).toHaveBeenCalledWith({
      workspaceId: 'ws-123',
      campaignMemberId: 'cc-456',
    });
  });

  it('delegates POST /api/v1/campaign-contacts/:id/approve to ApproveDraftUseCase', async () => {
    approveUseCase.execute.mockResolvedValue({ status: 'READY' });

    const response = await controller.approveDraft({ id: 'ws-123' }, 'cc-456');

    expect(response).toEqual({ status: 'READY' });
    expect(approveUseCase.execute).toHaveBeenCalledWith({
      workspaceId: 'ws-123',
      campaignMemberId: 'cc-456',
      expectedUpdatedAt: undefined,
    });
  });
});
