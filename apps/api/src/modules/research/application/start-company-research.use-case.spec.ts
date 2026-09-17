/* eslint-disable @typescript-eslint/unbound-method */
import { StartCompanyResearchUseCase } from './start-company-research.use-case';
import { IResearchRepository } from '../domain/research.repository.interface';

describe('StartCompanyResearchUseCase', () => {
  let useCase: StartCompanyResearchUseCase;
  let mockRepo: jest.Mocked<IResearchRepository>;

  beforeEach(() => {
    mockRepo = {
      startResearch: jest.fn(),
      findLatestRun: jest.fn(),
      findRunById: jest.fn(),
      updateRunStatus: jest.fn(),
      completeResearchRun: jest.fn(),
      findResearchDetails: jest.fn(),
    };
    useCase = new StartCompanyResearchUseCase(mockRepo);
  });

  it('delegates startResearch to repository with default forceRefresh false', async () => {
    mockRepo.startResearch.mockResolvedValue({
      researchRun: { id: 'run-1', status: 'QUEUED' } as any,
      reused: false,
    });

    const result = await useCase.execute('ws-1', 'comp-1');

    expect(mockRepo.startResearch).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      companyId: 'comp-1',
      forceRefresh: false,
    });
    expect(result.researchRun.id).toBe('run-1');
  });

  it('passes forceRefresh true when provided', async () => {
    mockRepo.startResearch.mockResolvedValue({
      researchRun: { id: 'run-2', status: 'QUEUED' } as any,
      reused: false,
    });

    await useCase.execute('ws-1', 'comp-1', { forceRefresh: true });

    expect(mockRepo.startResearch).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      companyId: 'comp-1',
      forceRefresh: true,
    });
  });
});
