import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../database/prisma.service';
import { ResearchFreshnessLimitException } from '../domain/research-freshness.exception';
import { CompanyResearchResult } from '../domain/research.provider.interface';
import { MockCompanyResearchProvider } from './mock-company-research.provider';
import { PrismaResearchRepository } from './prisma-research.repository';

describe('PrismaResearchRepository & MockCompanyResearchProvider', () => {
  let repository: PrismaResearchRepository;
  let mockPrisma: any;

  const workspaceId = 'ws-123';
  const companyId = 'comp-456';

  beforeEach(async () => {
    mockPrisma = {
      $transaction: jest.fn((cb) => cb(mockPrisma)),
      company: {
        findFirst: jest.fn(),
      },
      researchRun: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      job: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      opportunity: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      evidence: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaResearchRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    repository = module.get<PrismaResearchRepository>(PrismaResearchRepository);
  });

  describe('MockCompanyResearchProvider', () => {
    let provider: MockCompanyResearchProvider;

    beforeEach(() => {
      provider = new MockCompanyResearchProvider();
    });

    it('returns deterministic research result in test environment', async () => {
      process.env.NODE_ENV = 'test';
      const result = await provider.researchCompany({
        companyId,
        workspaceId,
        companyName: 'Acme Corp',
        websiteUrl: 'https://acme.com',
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.findings).toHaveLength(1);
      expect(result.opportunities).toHaveLength(1);
      expect(result.evidence).toHaveLength(1);
      expect(result.opportunities[0].roleTitle).toBe('Senior Backend Engineer');
    });

    it('throws error in production environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      await expect(
        provider.researchCompany({
          companyId,
          workspaceId,
          companyName: 'Acme Corp',
        }),
      ).rejects.toThrow(
        'MockCompanyResearchProvider cannot be executed in production environment.',
      );
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('PrismaResearchRepository.startResearch', () => {
    it('returns existing active QUEUED/RUNNING research run when present', async () => {
      mockPrisma.company.findFirst.mockResolvedValue({
        id: companyId,
        workspaceId,
        status: 'ACTIVE',
      });
      mockPrisma.researchRun.findFirst.mockResolvedValue({
        id: 'run-active',
        workspaceId,
        companyId,
        status: 'RUNNING',
      });

      const result = await repository.startResearch({ companyId, workspaceId });
      expect(result.reused).toBe(true);
      expect(result.researchRun.id).toBe('run-active');
      expect(mockPrisma.job.create).not.toHaveBeenCalled();
    });

    it('reuses fresh COMPLETED research run (<24h) when forceRefresh is false', async () => {
      mockPrisma.company.findFirst.mockResolvedValue({
        id: companyId,
        workspaceId,
        status: 'ACTIVE',
      });
      mockPrisma.researchRun.findFirst
        .mockResolvedValueOnce(null) // No QUEUED/RUNNING
        .mockResolvedValueOnce({
          id: 'run-fresh',
          workspaceId,
          companyId,
          status: 'COMPLETED',
          completedAt: new Date(),
        });

      const result = await repository.startResearch({
        companyId,
        workspaceId,
        forceRefresh: false,
      });
      expect(result.reused).toBe(true);
      expect(result.researchRun.id).toBe('run-fresh');
      expect(mockPrisma.job.create).not.toHaveBeenCalled();
    });

    it('creates new research run and job when forceRefresh is true under rate limit', async () => {
      mockPrisma.company.findFirst.mockResolvedValue({
        id: companyId,
        workspaceId,
        status: 'ACTIVE',
      });
      mockPrisma.researchRun.findFirst.mockResolvedValue(null);
      mockPrisma.job.findMany.mockResolvedValue([
        { payload: { companyId, forceRefresh: true } },
        { payload: { companyId, forceRefresh: true } },
      ]);
      mockPrisma.researchRun.create.mockResolvedValue({
        id: 'run-new',
        workspaceId,
        companyId,
        status: 'QUEUED',
      });

      const result = await repository.startResearch({
        companyId,
        workspaceId,
        forceRefresh: true,
      });
      expect(result.reused).toBe(false);
      expect(result.researchRun.id).toBe('run-new');
      expect(mockPrisma.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'COMPANY_RESEARCH',
            idempotencyKey: 'research:run-new',
            payload: {
              researchRunId: 'run-new',
              companyId,
              forceRefresh: true,
            },
          }),
        }),
      );
    });

    it('throws ResearchFreshnessLimitException on 4th forced refresh in 24h', async () => {
      mockPrisma.company.findFirst.mockResolvedValue({
        id: companyId,
        workspaceId,
        status: 'ACTIVE',
      });
      mockPrisma.researchRun.findFirst.mockResolvedValue(null);
      mockPrisma.job.findMany.mockResolvedValue([
        { payload: { companyId, forceRefresh: true } },
        { payload: { companyId, forceRefresh: true } },
        { payload: { companyId, forceRefresh: true } },
      ]);

      await expect(
        repository.startResearch({
          companyId,
          workspaceId,
          forceRefresh: true,
        }),
      ).rejects.toThrow(ResearchFreshnessLimitException);
    });
  });

  describe('PrismaResearchRepository.completeResearchRun', () => {
    it('reconciles opportunities and evidence and updates ResearchRun status', async () => {
      mockPrisma.researchRun.findFirst.mockResolvedValue({
        id: 'run-1',
        workspaceId,
        companyId,
        status: 'RUNNING',
      });

      mockPrisma.opportunity.findMany.mockResolvedValue([
        {
          id: 'opp-1',
          roleTitle: 'Senior Backend Engineer',
          openingSourceUrl: 'https://acme.com/jobs/backend',
          opportunityType: 'CONFIRMED',
          status: 'ACTIVE',
        },
        {
          id: 'opp-old',
          roleTitle: 'Old Role',
          openingSourceUrl: 'https://acme.com/jobs/old',
          opportunityType: 'CONFIRMED',
          status: 'ACTIVE',
        },
      ]);

      mockPrisma.evidence.findMany.mockResolvedValue([
        {
          id: 'ev-1',
          claim: 'Company uses TypeScript',
          classification: 'FACT',
          sourceUrl: 'https://acme.com/tech',
        },
      ]);

      mockPrisma.researchRun.update.mockResolvedValue({
        id: 'run-1',
        status: 'COMPLETED',
      });

      const incomingResult: CompanyResearchResult = {
        summary: 'Updated summary',
        findings: [],
        sources: [],
        opportunities: [
          {
            roleTitle: 'Senior Backend Engineer',
            openingSourceUrl: 'https://acme.com/jobs/backend',
            opportunityType: 'CONFIRMED',
          },
          {
            roleTitle: 'Frontend Engineer',
            openingSourceUrl: 'https://acme.com/jobs/frontend',
            opportunityType: 'CONFIRMED',
          },
        ],
        evidence: [
          {
            claim: 'Company uses TypeScript',
            classification: 'FACT',
            sourceUrl: 'https://acme.com/tech',
            confidence: 'HIGH',
          },
        ],
        unknowns: [],
        status: 'COMPLETED',
      };

      const result = await repository.completeResearchRun(
        workspaceId,
        'run-1',
        incomingResult,
      );

      expect(result.status).toBe('COMPLETED');
      // Matched opp updated in place
      expect(mockPrisma.opportunity.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'opp-1' } }),
      );
      // New opp created
      expect(mockPrisma.opportunity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ roleTitle: 'Frontend Engineer' }),
        }),
      );
      // Omitted old opp superseded
      expect(mockPrisma.opportunity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'opp-old' },
          data: { status: 'SUPERSEDED' },
        }),
      );
      // Matched evidence updated
      expect(mockPrisma.evidence.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ev-1' } }),
      );
    });

    it('ignores completion if ResearchRun is already terminal', async () => {
      mockPrisma.researchRun.findFirst.mockResolvedValue({
        id: 'run-done',
        workspaceId,
        companyId,
        status: 'COMPLETED',
      });

      const result = await repository.completeResearchRun(
        workspaceId,
        'run-done',
        {
          summary: '',
          findings: [],
          sources: [],
          opportunities: [],
          evidence: [],
          unknowns: [],
          status: 'COMPLETED',
        },
      );

      expect(result.status).toBe('COMPLETED');
      expect(mockPrisma.opportunity.create).not.toHaveBeenCalled();
      expect(mockPrisma.evidence.create).not.toHaveBeenCalled();
    });
  });
});
