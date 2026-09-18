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
      const res = { status: jest.fn() } as any;
      await expect(
        controller.startResearch(req, res, 'comp-1', {}),
      ).rejects.toThrow(AppUnauthorizedException);
    });

    it('executes startCompanyResearchUseCase and sets status 202 for new research', async () => {
      const req = { workspace: { id: 'ws-100' } } as any;
      const resResponse = { status: jest.fn() } as any;
      mockStartUseCase.execute.mockResolvedValue({
        researchRun: { id: 'run-1', status: 'QUEUED' } as any,
        reused: false,
      });

      const res = await controller.startResearch(req, resResponse, 'comp-1', {
        forceRefresh: true,
      });

      expect(mockStartUseCase.execute).toHaveBeenCalledWith(
        'ws-100',
        'comp-1',
        { forceRefresh: true },
      );
      expect(resResponse.status).toHaveBeenCalledWith(202);
      expect(res.researchRun.id).toBe('run-1');
    });

    it('sets status 200 for reused research', async () => {
      const req = { workspace: { id: 'ws-100' } } as any;
      const resResponse = { status: jest.fn() } as any;
      mockStartUseCase.execute.mockResolvedValue({
        researchRun: { id: 'run-reused', status: 'COMPLETED' } as any,
        reused: true,
      });

      const res = await controller.startResearch(req, resResponse, 'comp-1', {
        forceRefresh: false,
      });

      expect(resResponse.status).toHaveBeenCalledWith(200);
      expect(res.researchRun.id).toBe('run-reused');
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
