/* eslint-disable @typescript-eslint/unbound-method */
import { AppUnauthorizedException } from '../../common/errors/application.exception';
import { GetCompanyResearchUseCase } from './application/get-company-research.use-case';
import { StartCompanyResearchUseCase } from './application/start-company-research.use-case';
import { ResearchController } from './research.controller';

describe('ResearchController', () => {
  let controller: ResearchController;
  let mockStartUseCase: jest.Mocked<StartCompanyResearchUseCase>;
  let mockGetUseCase: jest.Mocked<GetCompanyResearchUseCase>;

  beforeEach(() => {
    mockStartUseCase = {
      execute: jest.fn(),
    } as any;
    mockGetUseCase = {
      execute: jest.fn(),
    } as any;
    controller = new ResearchController(mockStartUseCase, mockGetUseCase);
  });

  describe('startResearch', () => {
    it('throws AppUnauthorizedException if workspace is missing on request', async () => {
      const req = {} as any;
      await expect(controller.startResearch(req, 'comp-1', {})).rejects.toThrow(
        AppUnauthorizedException,
      );
    });

    it('executes startCompanyResearchUseCase with workspace id', async () => {
      const req = { workspace: { id: 'ws-100' } } as any;
      mockStartUseCase.execute.mockResolvedValue({
        researchRun: { id: 'run-1', status: 'QUEUED' } as any,
        reused: false,
      });

      const res = await controller.startResearch(req, 'comp-1', {
        forceRefresh: true,
      });

      expect(mockStartUseCase.execute).toHaveBeenCalledWith(
        'ws-100',
        'comp-1',
        {
          forceRefresh: true,
        },
      );
      expect(res.researchRun.id).toBe('run-1');
    });
  });

  describe('getResearch', () => {
    it('throws AppUnauthorizedException if workspace is missing on request', async () => {
      const req = {} as any;
      await expect(controller.getResearch(req, 'comp-1')).rejects.toThrow(
        AppUnauthorizedException,
      );
    });

    it('executes getCompanyResearchUseCase with workspace id', async () => {
      const req = { workspace: { id: 'ws-100' } } as any;
      const expectedDetails = {
        run: null,
        opportunities: [],
        evidence: [],
        status: 'NOT_STARTED' as const,
        jobStatus: null,
        mock: true,
      };
      mockGetUseCase.execute.mockResolvedValue(expectedDetails);

      const res = await controller.getResearch(req, 'comp-1');

      expect(mockGetUseCase.execute).toHaveBeenCalledWith('ws-100', 'comp-1');
      expect(res).toEqual(expectedDetails);
    });
  });
});
