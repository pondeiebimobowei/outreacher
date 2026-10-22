import { GetWorkspaceSummaryUseCase } from './get-workspace-summary.use-case';
import { PrismaWorkspaceSummaryRepository } from '../infrastructure/prisma-workspace-summary.repository';

describe('GetWorkspaceSummaryUseCase', () => {
  let useCase: GetWorkspaceSummaryUseCase;
  let repository: jest.Mocked<PrismaWorkspaceSummaryRepository>;

  const mockWorkspaceId = 'test-workspace-id';

  beforeEach(() => {
    repository = {
      getOutreachReviews: jest.fn(),
      getSendFailures: jest.fn(),
      getIncompleteResearch: jest.fn(),
      getPausedCampaigns: jest.fn(),
      getCompletedResearchActivity: jest.fn(),
      getContactSelectedActivity: jest.fn(),
      getEmailSentActivity: jest.fn(),
      getOutcomeRecordedActivity: jest.fn(),
    } as any;

    useCase = new GetWorkspaceSummaryUseCase(repository);
  });

  it('maps repository data to the correct DTO and states (excluding unsupported work items)', async () => {
    const baseDate = new Date('2026-09-19T00:00:00Z');

    repository.getOutreachReviews.mockResolvedValue([
      {
        id: 'contact-1',
        status: 'PENDING',
        person: { company: { id: 'comp-1', name: 'Company 1' } },
        updatedAt: baseDate,
      } as any,
    ]);
    repository.getSendFailures.mockResolvedValue([
      {
        id: 'contact-2',
        status: 'FAILED',
        person: { company: { id: 'comp-2', name: 'Company 2' } },
        updatedAt: baseDate,
      } as any,
    ]);
    repository.getIncompleteResearch.mockResolvedValue([
      {
        id: 'res-1',
        status: 'RUNNING',
        company: { id: 'comp-3', name: 'Company 3' },
        updatedAt: baseDate,
      } as any,
    ]);
    repository.getPausedCampaigns.mockResolvedValue([
      {
        id: 'camp-1',
        status: 'PAUSED',
        name: 'Camp 1',
        company: { id: 'comp-4', name: 'Company 4' },
        updatedAt: baseDate,
      } as any,
    ]);

    // Activities
    const oldDate = new Date('2026-09-18T00:00:00Z');
    repository.getCompletedResearchActivity.mockResolvedValue([
      {
        id: 'res-2',
        company: { id: 'comp-5', name: 'Company 5' },
        completedAt: oldDate,
      } as any,
    ]);
    repository.getContactSelectedActivity.mockResolvedValue([
      {
        id: 'sel-1',
        company: { id: 'comp-6', name: 'Company 6' },
        selectedAt: baseDate,
      } as any,
    ]);

    // Empty implementations for the rest to simulate no data
    repository.getEmailSentActivity.mockResolvedValue([]);
    repository.getOutcomeRecordedActivity.mockResolvedValue([]);

    const result = await useCase.execute(mockWorkspaceId);

    // Verify work items count and kinds (CONTACT_SELECTED should not be a work item, so exactly 4 items)
    expect(result.workItems).toHaveLength(4);
    expect(result.workItems.map((w) => w.kind)).toEqual([
      'OUTREACH_REVIEW',
      'SEND_FAILURE',
      'RESEARCH_INCOMPLETE',
      'CAMPAIGN_PAUSED',
    ]);

    // Verify recent activity deterministic sort (baseDate > oldDate)
    expect(result.recentActivity).toHaveLength(2);
    expect(result.recentActivity[0].type).toBe('CONTACT_SELECTED'); // baseDate
    expect(result.recentActivity[1].type).toBe('RESEARCH_COMPLETED'); // oldDate

    // Verify NO actor in activities
    expect(result.recentActivity[0]).not.toHaveProperty('actor');
    expect(result.recentActivity[1]).not.toHaveProperty('actor');

    // Verify no degraded sources
    expect(result.degradedSources).toBeUndefined();
  });

  it('populates degradedSources gracefully when a repository query fails', async () => {
    repository.getOutreachReviews.mockResolvedValue([]);
    repository.getSendFailures.mockRejectedValue(new Error('DB Timeout')); // Force Failure
    repository.getIncompleteResearch.mockResolvedValue([]);
    repository.getPausedCampaigns.mockResolvedValue([]);
    repository.getCompletedResearchActivity.mockResolvedValue([]);
    repository.getContactSelectedActivity.mockResolvedValue([]);
    repository.getEmailSentActivity.mockRejectedValue(
      new Error('Connection lost'),
    ); // Force Failure
    repository.getOutcomeRecordedActivity.mockResolvedValue([]);

    const result = await useCase.execute(mockWorkspaceId);

    expect(result.degradedSources).toBeDefined();
    expect(result.degradedSources).toHaveLength(2);
    expect(result.degradedSources).toEqual(
      expect.arrayContaining([
        { source: 'WORK_SEND_FAILURE', code: 'PARTIAL_DATA_UNAVAILABLE' },
        { source: 'ACTIVITY_EMAIL_SENT', code: 'PARTIAL_DATA_UNAVAILABLE' },
      ]),
    );
  });
});
