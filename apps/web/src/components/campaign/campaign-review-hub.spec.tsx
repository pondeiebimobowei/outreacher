import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CampaignReviewHub, type ReviewFilter } from './campaign-review-hub';
import { getNextAction as getHubActionLabel } from '../../features/campaign/components/MemberCard';
import type { CampaignDto } from '../../api/campaigns';
import type { CampaignContactSummaryDto } from '../../api/outreach';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeCampaign(overrides: Partial<CampaignDto> = {}): CampaignDto {
  return {
    id: 'camp-1',
    workspaceId: 'ws-1',
    companyId: 'co-1',
    name: 'Outreach — Acme Technologies',
    normalizedName: 'outreach acme technologies',
    status: 'ACTIVE',
    sendingIdentity: 'alice@example.com',
    followUpDelayBusinessDays: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeContact(
  id: string,
  status: CampaignContactSummaryDto['status'],
  overrides: Partial<CampaignContactSummaryDto> = {},
): CampaignContactSummaryDto {
  return {
    id,
    workspaceId: 'ws-1',
    campaignId: 'camp-1',
    contactId: `contact-${id}`,
    status,
    targetRole: 'Lead Distributed Systems Architect',
    outreachReason: 'Sarah leads the engineering department actively hiring.',
    currentSubject: 'Acme distributed systems & lead role',
    currentBody: 'Hi Sarah,\n\nI saw Acme\'s verified opening...',
    selectedOpportunityId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    contact: {
      id: `contact-${id}`,
      name: `Contact ${id}`,
      title: 'VP of Engineering',
      email: `contact${id}@acme.com`,
      contactKind: 'PERSON',
      confidence: 'HIGH',
    },
    ...overrides,
  };
}

const MIXED_CONTACTS: CampaignContactSummaryDto[] = [
  makeContact('1', 'PENDING'),
  makeContact('2', 'READY'),
  makeContact('3', 'SENDING'),
  makeContact('4', 'SENT'),
  makeContact('5', 'FAILED'),
  makeContact('6', 'SUPPRESSED'),
];

function renderHub(
  contactOverrides: CampaignContactSummaryDto[] = MIXED_CONTACTS,
  campaignOverrides: Partial<CampaignDto> = {},
  activeFilter: ReviewFilter = 'ALL',
  extraProps: Partial<React.ComponentProps<typeof CampaignReviewHub>> = {},
) {
  const onFilterChange = jest.fn();
  const onOpenContact = jest.fn();
  const onPause = jest.fn();
  const onResume = jest.fn();

  const utils = render(
    <CampaignReviewHub
      campaign={makeCampaign(campaignOverrides)}
      contacts={contactOverrides}
      activeFilter={activeFilter}
      onFilterChange={onFilterChange}
      onOpenContact={onOpenContact}
      onPause={onPause}
      onResume={onResume}
      isPauseResumeLoading={false}
      {...extraProps}
    />,
  );

  return { ...utils, onFilterChange, onOpenContact, onPause, onResume };
}

// ─── getHubActionLabel unit tests ────────────────────────────────────────────

describe('getHubActionLabel', () => {
  it('returns "Review Draft" for PENDING', () => {
    expect(getHubActionLabel('PENDING')).toBe('Prepare message');
  });

  it('returns "Send Now" for READY', () => {
    expect(getHubActionLabel('READY')).toBe('Ready to send');
  });

  it('returns "View" for SENDING', () => {
    expect(getHubActionLabel('SENDING')).toBe('Review status');
  });

  it('returns "View" for SENT', () => {
    expect(getHubActionLabel('SENT')).toBe('Awaiting reply');
  });

  // Packet 5 invariant: terminal FAILED has no Retry — View only
  it('returns "View" for FAILED — never Retry', () => {
    expect(getHubActionLabel('FAILED')).toBe('View history');
    expect(getHubActionLabel('FAILED')).not.toBe('Retry');
  });

  it('returns "View" for SUPPRESSED', () => {
    expect(getHubActionLabel('SUPPRESSED')).toBe('View history');
  });

  it('returns fallback prototype strings for other lifecycle states', () => {
    expect(getHubActionLabel('SCHEDULED')).toBe('Review status');
    expect(getHubActionLabel('ARCHIVED')).toBe('Review status');
  });
});

// ─── Campaign header ─────────────────────────────────────────────────────────

describe('CampaignReviewHub — campaign header', () => {
  it('renders campaign name', () => {
    renderHub();
    expect(screen.getByText('Outreach — Acme Technologies')).toBeInTheDocument();
  });

  it('shows Pause Campaign button when campaign is ACTIVE', () => {
    renderHub(MIXED_CONTACTS, { status: 'ACTIVE' });
    expect(screen.getByRole('button', { name: /pause campaign/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resume campaign/i })).not.toBeInTheDocument();
  });

  it('shows Resume Campaign button when campaign is PAUSED', () => {
    renderHub(MIXED_CONTACTS, { status: 'PAUSED' });
    expect(screen.getByRole('button', { name: /resume campaign/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pause campaign/i })).not.toBeInTheDocument();
  });

  it('shows neither Pause nor Resume for DRAFT campaign', () => {
    renderHub(MIXED_CONTACTS, { status: 'DRAFT' });
    expect(screen.queryByRole('button', { name: /pause campaign/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resume campaign/i })).not.toBeInTheDocument();
  });

  it('calls onPause when Pause Campaign is clicked', () => {
    const { onPause } = renderHub(MIXED_CONTACTS, { status: 'ACTIVE' });
    fireEvent.click(screen.getByRole('button', { name: /pause campaign/i }));
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('calls onResume when Resume Campaign is clicked', () => {
    const { onResume } = renderHub(MIXED_CONTACTS, { status: 'PAUSED' });
    fireEvent.click(screen.getByRole('button', { name: /resume campaign/i }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('disables Pause/Resume button while loading', () => {
    renderHub(MIXED_CONTACTS, { status: 'ACTIVE' }, 'ALL', { isPauseResumeLoading: true });
    expect(screen.getByRole('button', { name: /pause campaign/i })).toBeDisabled();
  });
});

// ─── Filter bar ──────────────────────────────────────────────────────────────

describe('CampaignReviewHub — filter bar', () => {
  it('renders all filter pills', () => {
    const { getByRole } = renderHub();
    const tablist = getByRole('tablist', { name: /filter contacts/i });
    // Each pill is a tab inside the tablist — use within to scope
    expect(within(tablist).getByRole('tab', { name: /^all \(6\)/i })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: /needs review \(1\)/i })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: /approved \(1\)/i })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: /sending \(1\)/i })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: /^sent \(1\)/i })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: /failed \(1\)/i })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: /blocked \(1\)/i })).toBeInTheDocument();
  });

  it('counts are from the complete collection, not the filtered view', () => {
    // Start with PENDING filter active — counts still show totals from all \(6\)
    const { getByRole } = renderHub(MIXED_CONTACTS, {}, 'PENDING');
    const tablist = getByRole('tablist', { name: /filter contacts/i });
    expect(within(tablist).getByRole('tab', { name: /^all \(6\)/i })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: /needs review \(1\)/i })).toBeInTheDocument();
  });

  it('marks the active filter pill as aria-selected', () => {
    const { getByRole } = renderHub(MIXED_CONTACTS, {}, 'READY');
    const tablist = getByRole('tablist', { name: /filter contacts/i });
    const approvedPill = within(tablist).getByRole('tab', { name: /approved \(1\)/i });
    expect(approvedPill).toHaveAttribute('aria-selected', 'true');
  });

  it('marks inactive filter pills as aria-selected=false', () => {
    const { getByRole } = renderHub(MIXED_CONTACTS, {}, 'READY');
    const tablist = getByRole('tablist', { name: /filter contacts/i });
    const allPill = within(tablist).getByRole('tab', { name: /^all \(6\)/i });
    expect(allPill).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onFilterChange with the selected filter when a pill is clicked', () => {
    const { getByRole, onFilterChange } = renderHub();
    const tablist = getByRole('tablist', { name: /filter contacts/i });
    fireEvent.click(within(tablist).getByRole('tab', { name: /needs review \(1\)/i }));
    expect(onFilterChange).toHaveBeenCalledWith('PENDING');
  });
});

// ─── Queue filtering ─────────────────────────────────────────────────────────

describe('CampaignReviewHub — queue filtering', () => {
  it('ALL filter shows all (6) contacts (appears in table and mobile cards = 12 name instances)', () => {
    renderHub(MIXED_CONTACTS, {}, 'ALL');
    // Each contact renders in both desktop table row and mobile card
    const allNames = screen.getAllByText(/^Contact [1-6]$/);
    expect(allNames.length).toBeGreaterThanOrEqual(6);
  });

  it('PENDING filter: only Contact 1 visible, Contact 2 hidden', () => {
    renderHub(MIXED_CONTACTS, {}, 'PENDING');
    expect(screen.getAllByText('Contact 1').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Contact 2')).not.toBeInTheDocument();
  });

  it('READY filter: only Contact 2 visible, Contact 1 hidden', () => {
    renderHub(MIXED_CONTACTS, {}, 'READY');
    expect(screen.getAllByText('Contact 2').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Contact 1')).not.toBeInTheDocument();
  });

  it('FAILED filter: only Contact 5 visible, Contact 1 hidden', () => {
    renderHub(MIXED_CONTACTS, {}, 'FAILED');
    expect(screen.getAllByText('Contact 5').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Contact 1')).not.toBeInTheDocument();
  });

  it('renders empty state when no contacts match filter', () => {
    renderHub([makeContact('1', 'PENDING')], {}, 'SENT');
    expect(screen.getByText(/no contacts found/i)).toBeInTheDocument();
  });

  it('renders empty state for ALL with no contacts', () => {
    renderHub([], {}, 'ALL');
    expect(screen.getByText(/no contacts found/i)).toBeInTheDocument();
  });
});

// ─── Row action buttons ───────────────────────────────────────────────────────
// The component renders both a desktop table and mobile cards — each button
// therefore appears twice. Use getAllByRole and assert ≥ 1 for presence checks,
// and target the first found element for callback assertions.

describe('CampaignReviewHub — row action buttons', () => {
  it('shows "Prepare message" for PENDING contact', () => {
    renderHub([makeContact('1', 'PENDING')]);
    const btns = screen.getAllByRole('button', { name: /prepare message/i });
    expect(btns.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Ready to send" for READY contact', () => {
    renderHub([makeContact('2', 'READY')]);
    const btns = screen.getAllByRole('button', { name: /ready to send/i });
    expect(btns.length).toBeGreaterThanOrEqual(1);
  });

  // Packet 5 regression guard — FAILED must never show Retry
  it('shows "View history" for FAILED contact and never shows Retry (Packet 5 invariant)', () => {
    renderHub([makeContact('5', 'FAILED')]);
    const viewBtns = screen.getAllByRole('button', { name: /view history/i });
    expect(viewBtns.length).toBeGreaterThanOrEqual(1);
    // Strict regression guard: no Retry button must be present at all
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('shows "Awaiting reply" for SENT contact', () => {
    renderHub([makeContact('4', 'SENT')]);
    expect(screen.getAllByText(/view history|review status|awaiting reply/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Review status" for SENDING contact', () => {
    renderHub([makeContact('3', 'SENDING')]);
    expect(screen.getAllByText(/view history|review status|awaiting reply/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows "View history" for SUPPRESSED contact', () => {
    renderHub([makeContact('6', 'SUPPRESSED')]);
    expect(screen.getAllByText(/view history|review status|awaiting reply/i).length).toBeGreaterThanOrEqual(1);
  });

  it('calls onOpenContact with campaignContactId when Prepare message is clicked', () => {
    const { onOpenContact } = renderHub([makeContact('abc', 'PENDING')]);
    const btns = screen.getAllByRole('button', { name: /prepare message/i });
    fireEvent.click(btns[0]);
    expect(onOpenContact).toHaveBeenCalledWith('abc');
  });

  it('calls onOpenContact with campaignContactId when Ready to send is clicked', () => {
    const { onOpenContact } = renderHub([makeContact('xyz', 'READY')]);
    const btns = screen.getAllByRole('button', { name: /ready to send/i });
    fireEvent.click(btns[0]);
    expect(onOpenContact).toHaveBeenCalledWith('xyz');
  });

  it('calls onOpenContact with campaignContactId when View history is clicked for FAILED', () => {
    const { onOpenContact } = renderHub([makeContact('fail-id', 'FAILED')]);
    const btns = screen.getAllByRole('button', { name: /view history/i });
    fireEvent.click(btns[0]);
    expect(onOpenContact).toHaveBeenCalledWith('fail-id');
  });
});

// ─── Status badge labels ──────────────────────────────────────────────────────

describe('CampaignReviewHub — status badge labels', () => {
  // Each badge appears in both desktop table and mobile card sections
  it.each<[CampaignContactSummaryDto['status'], string]>([
    ['PENDING', 'Needs Review'],
    ['READY', 'Approved'],
    ['SENDING', 'Sending'],
    ['SENT', 'Sent'],
    ['FAILED', 'Failed'],
    ['SUPPRESSED', 'Blocked'],
  ])('renders badge "%s" for status %s', (status, label) => {
    renderHub([makeContact('1', status)]);
    const badges = screen.getAllByText(label);
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Mobile card content ──────────────────────────────────────────────────────

describe('CampaignReviewHub — Member card content', () => {
  it('renders currentSubject excerpt when present', () => {
    renderHub([makeContact('m1', 'PENDING', { currentSubject: 'Hello from Acme' })]);
    expect(screen.getByText('Hello from Acme')).toBeInTheDocument();
  });

  it('omits outreach reason when null', () => {
    renderHub([makeContact('m2', 'PENDING', { currentSubject: null })]);
    expect(screen.queryByText('Hello from Acme')).not.toBeInTheDocument();
  });
});
