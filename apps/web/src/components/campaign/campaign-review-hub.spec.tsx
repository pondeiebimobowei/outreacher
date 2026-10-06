import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CampaignReviewHub, type ReviewFilter } from './campaign-review-hub';
import { getNextAction as getHubActionLabel } from '../../features/campaign/components/MemberCard';
import type { CampaignDto, CampaignRecipientStatus } from '../../api/campaigns';
import type { CampaignRecipientSummaryDto } from '../../api/outreach';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeCampaign(overrides: Partial<CampaignDto> = {}): CampaignDto {
  return {
    id: 'camp-1',
    workspaceId: 'ws-1',
    name: 'Outreach — Acme Technologies',
    status: 'ACTIVE',
    contentSource: 'TEMPLATE',
    templateId: 'tpl-1',
    aiPromptContext: null,
    senderAccountIds: ['acc-1'],
    maxFollowUps: 2,
    followUpDelayBusinessDays: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRecipient(
  id: string,
  status: CampaignRecipientStatus,
  overrides: Partial<CampaignRecipientSummaryDto> = {},
): CampaignRecipientSummaryDto {
  return {
    id,
    workspaceId: 'ws-1',
    campaignId: 'camp-1',
    personCompanyAssociationId: `pca-${id}`,
    status,
    targetRole: 'Lead Distributed Systems Architect',
    selectedOpportunityId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    outreachId: `outreach-${id}`,
    person: {
      id: `per-${id}`,
      firstName: 'Contact ' + id,
      lastName: '',
      title: 'VP of Engineering',
      email: `contact${id}@acme.com`,
      personKind: 'PERSON',
      confidence: 'HIGH',
    },
    outreach: {
      id: `outreach-${id}`,
      status: 'DRAFT',
      subject: 'Acme distributed systems & lead role',
      message: 'Hi Sarah,\n\nI saw Acme\'s verified opening...',
      aiGenerationStatus: null,
    },
    ...overrides,
  };
}

const MIXED_RECIPIENTS: CampaignRecipientSummaryDto[] = [
  makeRecipient('1', 'PENDING'),
  makeRecipient('2', 'ACTIVE'),
  makeRecipient('3', 'PAUSED'),
  makeRecipient('4', 'COMPLETED'),
  makeRecipient('5', 'FAILED'),
  makeRecipient('6', 'SUPPRESSED'),
];

function renderHub(
  recipientOverrides: CampaignRecipientSummaryDto[] = MIXED_RECIPIENTS,
  campaignOverrides: Partial<CampaignDto> = {},
  activeFilter: ReviewFilter = 'ALL',
  extraProps: Partial<React.ComponentProps<typeof CampaignReviewHub>> = {},
) {
  const onFilterChange = jest.fn();
  const onOpenRecipient = jest.fn();
  const onPause = jest.fn();
  const onResume = jest.fn();

  const utils = render(
    <CampaignReviewHub
      campaign={makeCampaign(campaignOverrides)}
      recipients={recipientOverrides}
      activeFilter={activeFilter}
      onFilterChange={onFilterChange}
      onOpenRecipient={onOpenRecipient}
      onPause={onPause}
      onResume={onResume}
      isPauseResumeLoading={false}
      {...extraProps}
    />,
  );

  return { ...utils, onFilterChange, onOpenRecipient, onPause, onResume };
}

// ─── getHubActionLabel unit tests ────────────────────────────────────────────

describe('getHubActionLabel', () => {
  it('returns "Prepare message" for PENDING', () => {
    expect(getHubActionLabel('PENDING')).toBe('Prepare message');
  });

  it('returns "Awaiting reply" for ACTIVE', () => {
    expect(getHubActionLabel('ACTIVE')).toBe('Awaiting reply');
  });

  it('returns "Review paused" for PAUSED', () => {
    expect(getHubActionLabel('PAUSED')).toBe('Review paused');
  });

  it('returns "View outcome" for COMPLETED', () => {
    expect(getHubActionLabel('COMPLETED')).toBe('View outcome');
  });

  it('returns "View history" for FAILED — never Retry', () => {
    expect(getHubActionLabel('FAILED')).toBe('View history');
    expect(getHubActionLabel('FAILED')).not.toBe('Retry');
  });

  it('returns "View history" for SUPPRESSED', () => {
    expect(getHubActionLabel('SUPPRESSED')).toBe('View history');
  });
});

// ─── Campaign header ─────────────────────────────────────────────────────────

describe('CampaignReviewHub — campaign header', () => {
  it('renders campaign name', () => {
    renderHub();
    expect(screen.getByText('Outreach — Acme Technologies')).toBeInTheDocument();
  });

  it('shows Pause Campaign button when campaign is ACTIVE', () => {
    renderHub(MIXED_RECIPIENTS, { status: 'ACTIVE' });
    expect(screen.getByRole('button', { name: /pause campaign/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resume campaign/i })).not.toBeInTheDocument();
  });

  it('shows Resume Campaign button when campaign is PAUSED', () => {
    renderHub(MIXED_RECIPIENTS, { status: 'PAUSED' });
    expect(screen.getByRole('button', { name: /resume campaign/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pause campaign/i })).not.toBeInTheDocument();
  });

  it('shows neither Pause nor Resume for DRAFT campaign', () => {
    renderHub(MIXED_RECIPIENTS, { status: 'DRAFT' });
    expect(screen.queryByRole('button', { name: /pause campaign/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resume campaign/i })).not.toBeInTheDocument();
  });

  it('calls onPause when Pause Campaign is clicked', () => {
    const { onPause } = renderHub(MIXED_RECIPIENTS, { status: 'ACTIVE' });
    fireEvent.click(screen.getByRole('button', { name: /pause campaign/i }));
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('calls onResume when Resume Campaign is clicked', () => {
    const { onResume } = renderHub(MIXED_RECIPIENTS, { status: 'PAUSED' });
    fireEvent.click(screen.getByRole('button', { name: /resume campaign/i }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('disables Pause/Resume button while loading', () => {
    renderHub(MIXED_RECIPIENTS, { status: 'ACTIVE' }, 'ALL', { isPauseResumeLoading: true });
    expect(screen.getByRole('button', { name: /pause campaign/i })).toBeDisabled();
  });
});

// ─── Filter bar ──────────────────────────────────────────────────────────────

describe('CampaignReviewHub — filter bar', () => {
  it('renders all filter pills', () => {
    const { getByRole } = renderHub();
    const tablist = getByRole('tablist', { name: /filter recipients/i });
    expect(within(tablist).getByRole('tab', { name: /^all \(6\)/i })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: /needs review \(1\)/i })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: /active \(1\)/i })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: /paused \(1\)/i })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: /completed \(1\)/i })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: /failed \(1\)/i })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: /blocked \(1\)/i })).toBeInTheDocument();
  });

  it('counts are from the complete collection, not the filtered view', () => {
    const { getByRole } = renderHub(MIXED_RECIPIENTS, {}, 'PENDING');
    const tablist = getByRole('tablist', { name: /filter recipients/i });
    expect(within(tablist).getByRole('tab', { name: /^all \(6\)/i })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: /needs review \(1\)/i })).toBeInTheDocument();
  });

  it('marks the active filter pill as aria-selected', () => {
    const { getByRole } = renderHub(MIXED_RECIPIENTS, {}, 'ACTIVE');
    const tablist = getByRole('tablist', { name: /filter recipients/i });
    const activePill = within(tablist).getByRole('tab', { name: /active \(1\)/i });
    expect(activePill).toHaveAttribute('aria-selected', 'true');
  });

  it('marks inactive filter pills as aria-selected=false', () => {
    const { getByRole } = renderHub(MIXED_RECIPIENTS, {}, 'ACTIVE');
    const tablist = getByRole('tablist', { name: /filter recipients/i });
    const allPill = within(tablist).getByRole('tab', { name: /^all \(6\)/i });
    expect(allPill).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onFilterChange with the selected filter when a pill is clicked', () => {
    const { getByRole, onFilterChange } = renderHub();
    const tablist = getByRole('tablist', { name: /filter recipients/i });
    fireEvent.click(within(tablist).getByRole('tab', { name: /needs review \(1\)/i }));
    expect(onFilterChange).toHaveBeenCalledWith('PENDING');
  });
});

// ─── Queue filtering ─────────────────────────────────────────────────────────

describe('CampaignReviewHub — queue filtering', () => {
  it('ALL filter shows all (6) recipients', () => {
    renderHub(MIXED_RECIPIENTS, {}, 'ALL');
    const allNames = screen.getAllByText(/^Contact [1-6]$/);
    expect(allNames.length).toBeGreaterThanOrEqual(6);
  });

  it('PENDING filter: only Contact 1 visible, Contact 2 hidden', () => {
    renderHub(MIXED_RECIPIENTS, {}, 'PENDING');
    expect(screen.getAllByText('Contact 1').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Contact 2')).not.toBeInTheDocument();
  });

  it('ACTIVE filter: only Contact 2 visible, Contact 1 hidden', () => {
    renderHub(MIXED_RECIPIENTS, {}, 'ACTIVE');
    expect(screen.getAllByText('Contact 2').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Contact 1')).not.toBeInTheDocument();
  });

  it('FAILED filter: only Contact 5 visible, Contact 1 hidden', () => {
    renderHub(MIXED_RECIPIENTS, {}, 'FAILED');
    expect(screen.getAllByText('Contact 5').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Contact 1')).not.toBeInTheDocument();
  });

  it('renders empty state when no recipients match filter', () => {
    renderHub([makeRecipient('1', 'PENDING')], {}, 'COMPLETED');
    expect(screen.getByText(/no recipients found/i)).toBeInTheDocument();
  });

  it('renders empty state for ALL with no recipients', () => {
    renderHub([], {}, 'ALL');
    expect(screen.getByText(/no recipients found/i)).toBeInTheDocument();
  });
});

// ─── Row action buttons ───────────────────────────────────────────────────────

describe('CampaignReviewHub — row action buttons', () => {
  it('shows "Prepare message" for PENDING recipient', () => {
    renderHub([makeRecipient('1', 'PENDING')]);
    const btns = screen.getAllByRole('button', { name: /prepare message/i });
    expect(btns.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Awaiting reply" for ACTIVE recipient', () => {
    renderHub([makeRecipient('2', 'ACTIVE')]);
    const btns = screen.getAllByRole('button', { name: /awaiting reply/i });
    expect(btns.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "View history" for FAILED recipient and never shows Retry (Packet 5 invariant)', () => {
    renderHub([makeRecipient('5', 'FAILED')]);
    const viewBtns = screen.getAllByRole('button', { name: /view history/i });
    expect(viewBtns.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('shows "View history" for SUPPRESSED recipient', () => {
    renderHub([makeRecipient('6', 'SUPPRESSED')]);
    expect(screen.getAllByRole('button', { name: /view history/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('calls onOpenRecipient with outreachId when Prepare message is clicked', () => {
    const { onOpenRecipient } = renderHub([makeRecipient('abc', 'PENDING')]);
    const btns = screen.getAllByRole('button', { name: /prepare message/i });
    fireEvent.click(btns[0]);
    expect(onOpenRecipient).toHaveBeenCalledWith('outreach-abc');
  });

  it('calls onOpenRecipient with outreachId when View history is clicked for FAILED', () => {
    const { onOpenRecipient } = renderHub([makeRecipient('fail-id', 'FAILED')]);
    const btns = screen.getAllByRole('button', { name: /view history/i });
    fireEvent.click(btns[0]);
    expect(onOpenRecipient).toHaveBeenCalledWith('outreach-fail-id');
  });
});

// ─── Status badge labels ──────────────────────────────────────────────────────

describe('CampaignReviewHub — status badge labels', () => {
  it.each<[CampaignRecipientStatus, string]>([
    ['PENDING', 'Needs Review'],
    ['ACTIVE', 'Active'],
    ['PAUSED', 'Paused'],
    ['COMPLETED', 'Completed'],
    ['FAILED', 'Failed'],
    ['SUPPRESSED', 'Blocked'],
  ])('renders badge "%s" for status %s', (status, label) => {
    renderHub([makeRecipient('1', status)]);
    const badges = screen.getAllByText(label);
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Recipient card content ───────────────────────────────────────────────────

describe('CampaignReviewHub — Recipient card content', () => {
  it('renders subject excerpt when present', () => {
    renderHub([
      makeRecipient('m1', 'PENDING', {
        outreach: {
          id: 'outreach-m1',
          status: 'DRAFT',
          subject: 'Hello from Acme',
          message: 'body',
          aiGenerationStatus: null,
        },
      }),
    ]);
    expect(screen.getByText('Hello from Acme')).toBeInTheDocument();
  });

  it('omits subject when outreach is null', () => {
    renderHub([makeRecipient('m2', 'PENDING', { outreach: null })]);
    expect(screen.queryByText('Hello from Acme')).not.toBeInTheDocument();
  });
});
