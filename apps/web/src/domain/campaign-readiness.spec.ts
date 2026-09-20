// Jest globals are used
import { computeCampaignReadiness } from './campaign-readiness';
import type { CampaignSenderSummary } from '../api/campaign-senders';


describe('computeCampaignReadiness', () => {
  const createSender = (
    overrides?: Partial<CampaignSenderSummary & { isIntegrationUnknown?: boolean }>,
  ): CampaignSenderSummary & { isIntegrationUnknown?: boolean } => ({
    assignmentStatus: 'ACTIVE',
    senderAccountId: '1',
    fromName: 'Test',
    fromEmail: 'test@example.com',
    senderStatus: 'ACTIVE',
    integrationStatus: 'ACTIVE',
    ...overrides,
  });

  it('prioritizes non-dispatchable campaign statuses (ARCHIVED)', () => {
    const result = computeCampaignReadiness('ARCHIVED', [createSender()]);
    expect(result).toEqual({ state: 'CAMPAIGN_NOT_DISPATCHABLE' });
  });

  it('prioritizes non-dispatchable campaign statuses (PAUSED)', () => {
    const result = computeCampaignReadiness('PAUSED', [createSender()]);
    expect(result).toEqual({ state: 'CAMPAIGN_NOT_DISPATCHABLE' });
  });

  it('returns NEEDS_SENDER for DRAFT with 0 active assignments', () => {
    const result = computeCampaignReadiness('DRAFT', []);
    expect(result).toEqual({ state: 'NEEDS_SENDER' });
  });

  it('ignores REMOVED assignments and returns NEEDS_SENDER', () => {
    const result = computeCampaignReadiness('ACTIVE', [
      createSender({ assignmentStatus: 'REMOVED' }),
    ]);
    expect(result).toEqual({ state: 'NEEDS_SENDER' });
  });

  it('returns READY when at least one active assignment is eligible', () => {
    const result = computeCampaignReadiness('ACTIVE', [
      createSender({ senderStatus: 'PAUSED' }), // ineligible
      createSender(), // eligible
    ]);
    expect(result).toEqual({ state: 'READY', eligibleSenderCount: 1 });
  });

  it('returns ALL_SENDERS_INELIGIBLE when no active assignments are eligible', () => {
    const result = computeCampaignReadiness('ACTIVE', [
      createSender({ senderStatus: 'PAUSED' }),
      createSender({ integrationStatus: 'INVALID_CREDENTIALS' }),
    ]);
    expect(result).toEqual({ state: 'ALL_SENDERS_INELIGIBLE', detail: 'Assigned accounts need attention' });
  });

  it('returns READINESS_UNKNOWN when integration state is unknown and no other sender is ready', () => {
    const result = computeCampaignReadiness('ACTIVE', [
      createSender({ isIntegrationUnknown: true }),
    ]);
    expect(result).toEqual({ state: 'READINESS_UNKNOWN', detail: 'Could not verify integration status' });
  });

  it('returns READY even if one sender is unknown, as long as another is definitively ready', () => {
    const result = computeCampaignReadiness('ACTIVE', [
      createSender({ isIntegrationUnknown: true }),
      createSender(), // eligible
    ]);
    expect(result).toEqual({ state: 'READY', eligibleSenderCount: 1 });
  });

  // Architectural independent capacity test:
  // Capacity exhaustion is a backend dispatch concern, not a configuration readiness concern.
  // The frontend purely evaluates if a sender is structurally eligible.
  it('returns READY for structurally eligible sender (capacity exhaustion is handled by SendEligibilityService)', () => {
    const eligibleSender = createSender();
    // In reality, this sender might have 0 capacity left, but frontend structural configuration doesn't care.
    const result = computeCampaignReadiness('ACTIVE', [eligibleSender]);
    expect(result).toEqual({ state: 'READY', eligibleSenderCount: 1 });
  });
});
