/* eslint-disable @typescript-eslint/unbound-method */
import { GetCompanyResearchUseCase } from './get-company-research.use-case';
import { IResearchRepository } from '../domain/research.repository.interface';

describe('GetCompanyResearchUseCase', () => {
  let useCase: GetCompanyResearchUseCase;
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
    useCase = new GetCompanyResearchUseCase(mockRepo);
  });

  it('delegates findResearchDetails to repository', async () => {
    const expectedDetails = {
      run: { id: 'run-1', status: 'COMPLETED' } as any,
      opportunities: [{ id: 'opp-1' }] as any[],
      evidence: [{ id: 'ev-1' }] as any[],
      status: 'COMPLETED' as const,
      jobStatus: null,
      mock: true,
    };
    mockRepo.findResearchDetails.mockResolvedValue(expectedDetails);

    const result = await useCase.execute('ws-1', 'comp-1');

    expect(mockRepo.findResearchDetails).toHaveBeenCalledWith('ws-1', 'comp-1');
    expect(result).toEqual(expectedDetails);
  });
});
