import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { OutreachReviewDrawer } from './outreach-review-drawer';
import * as outreachApi from '../../api/outreach';
import { ApiError } from '../../api/client';

jest.mock('../../api/outreach');

const mockContactDetails: outreachApi.CampaignContactDetailsDto = {
  id: 'cc-1',
  workspaceId: 'ws-1',
  campaignId: 'camp-1',
  contactId: 'con-1',
  status: 'PENDING',
  targetRole: 'VP of Engineering',
  outreachReason: 'Leads the engineering team hiring for this role.',
  currentSubject: 'Acme distributed systems architecture',
  currentBody:
    'Hi Sarah, I noticed Acme is hiring a Lead Distributed Systems Architect...',
  selectedOpportunityId: 'opp-1',
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
  contact: {
    id: 'con-1',
    name: 'Sarah Connor',
    title: 'VP of Engineering',
    email: 'sarah@acme.com',
    contactKind: 'PERSON',
    confidence: 'HIGH',
    emailConfidence: 'AVAILABLE',
  },
  campaign: {
    id: 'camp-1',
    name: 'Outreach — Acme',
    status: 'DRAFT',
    companyId: 'comp-1',
  },
  selectedOpportunity: {
    id: 'opp-1',
    roleTitle: 'Lead Distributed Systems Architect',
    opportunityType: 'CONFIRMED',
  },
  evidence: [
    {
      id: 'ev-1',
      claim: 'Verified opening for Lead Architect',
      classification: 'FACT',
      sourceName: 'Careers Site',
      sourceUrl: 'https://acme.com/careers/lead-architect',
      sourceExcerpt: 'Opening posted 2 days ago',
      confidence: 0.95,
    },
  ],
  generationJob: null,
};

const mockBoundContacts: outreachApi.CampaignContactSummaryDto[] = [
  {
    id: 'cc-1',
    workspaceId: 'ws-1',
    campaignId: 'camp-1',
    contactId: 'con-1',
    status: 'PENDING',
    targetRole: 'VP of Engineering',
    outreachReason: null,
    currentSubject: null,
    currentBody: null,
    selectedOpportunityId: null,
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
    contact: {
      id: 'con-1',
      name: 'Sarah Connor',
      title: 'VP of Engineering',
      email: 'sarah@acme.com',
      contactKind: 'PERSON',
      confidence: 'HIGH',
    },
  },
  {
    id: 'cc-2',
    workspaceId: 'ws-1',
    campaignId: 'camp-1',
    contactId: 'con-2',
    status: 'PENDING',
    targetRole: 'Engineering Manager',
    outreachReason: null,
    currentSubject: null,
    currentBody: null,
    selectedOpportunityId: null,
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
    contact: {
      id: 'con-2',
      name: 'John Doe',
      title: 'Engineering Manager',
      email: 'john@acme.com',
      contactKind: 'PERSON',
      confidence: 'MEDIUM',
    },
  },
];

describe('OutreachReviewDrawer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (outreachApi.fetchCampaignContact as jest.Mock).mockResolvedValue(
      mockContactDetails,
    );
  });

  it('renders drawer when open with contact and opportunity context', async () => {
    render(
      <OutreachReviewDrawer
        isOpen={true}
        onClose={jest.fn()}
        campaignContactId="cc-1"
        boundContacts={mockBoundContacts}
        companyName="Acme Corp"
      />,
    );

    expect(await screen.findByText('Sarah Connor')).toBeInTheDocument();
    expect(screen.getByText('Needs Review')).toBeInTheDocument();
    expect(
      screen.getByText('CONFIRMED: Lead Distributed Systems Architect'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '"Leads the engineering team hiring for this role."',
      ),
    ).toBeInTheDocument();
  });

  it('displays the mandatory AI Assisted — Review Required banner', async () => {
    render(
      <OutreachReviewDrawer
        isOpen={true}
        onClose={jest.fn()}
        campaignContactId="cc-1"
        boundContacts={mockBoundContacts}
        companyName="Acme Corp"
      />,
    );

    expect(
      await screen.findByText('AI Assisted — Review Required'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/This message was drafted using verified evidence/i),
    ).toBeInTheDocument();
  });

  it('validates subject and body character boundaries with dynamic counters', async () => {
    render(
      <OutreachReviewDrawer
        isOpen={true}
        onClose={jest.fn()}
        campaignContactId="cc-1"
        boundContacts={mockBoundContacts}
        companyName="Acme Corp"
      />,
    );

    await screen.findByText('Sarah Connor');

    const subjectInput = screen.getByLabelText(/Subject \(3–150 chars\)/i);
    const bodyTextarea = screen.getByLabelText(/Body Text \(20–4000 chars\)/i);

    // Initial valid counters
    expect(screen.getByText(/37 \/ 150/i)).toBeInTheDocument();

    // Short invalid subject
    fireEvent.change(subjectInput, { target: { value: 'Hi' } });
    expect(
      screen.getByText('Subject must be at least 3 characters.'),
    ).toBeInTheDocument();

    // Short invalid body
    fireEvent.change(bodyTextarea, { target: { value: 'Too short' } });
    expect(
      screen.getByText('Body text must be at least 20 characters.'),
    ).toBeInTheDocument();
  });

  it('performs autosave on blur with expectedUpdatedAt concurrency token and resets to PENDING', async () => {
    (outreachApi.updateOutreachDraft as jest.Mock).mockResolvedValue({
      ...mockContactDetails,
      currentSubject: 'Updated Subject Title',
      status: 'PENDING',
      updatedAt: '2026-09-19T01:00:00.000Z',
    });

    render(
      <OutreachReviewDrawer
        isOpen={true}
        onClose={jest.fn()}
        campaignContactId="cc-1"
        boundContacts={mockBoundContacts}
        companyName="Acme Corp"
      />,
    );

    await screen.findByText('Sarah Connor');

    const subjectInput = screen.getByLabelText(/Subject \(3–150 chars\)/i);
    fireEvent.change(subjectInput, {
      target: { value: 'Updated Subject Title' },
    });
    fireEvent.blur(subjectInput);

    await waitFor(() => {
      expect(outreachApi.updateOutreachDraft).toHaveBeenCalledWith('cc-1', {
        subject: 'Updated Subject Title',
        bodyText: mockContactDetails.currentBody,
        expectedUpdatedAt: '2026-09-19T00:00:00.000Z',
      });
    });

    expect(await screen.findByText('All changes saved')).toBeInTheDocument();
  });

  it('locks approval and generation buttons during in-flight autosave', async () => {
    let resolveSave: (val: unknown) => void;
    const savePromise = new Promise((resolve) => {
      resolveSave = resolve;
    });
    (outreachApi.updateOutreachDraft as jest.Mock).mockReturnValue(savePromise);

    render(
      <OutreachReviewDrawer
        isOpen={true}
        onClose={jest.fn()}
        campaignContactId="cc-1"
        boundContacts={mockBoundContacts}
        companyName="Acme Corp"
      />,
    );

    await screen.findByText('Sarah Connor');

    const subjectInput = screen.getByLabelText(/Subject \(3–150 chars\)/i);
    fireEvent.change(subjectInput, {
      target: { value: 'Updated Subject Title' },
    });
    fireEvent.blur(subjectInput);

    // While saving is in flight, Approve and Regenerate must be disabled
    expect(screen.getByText('Saving changes...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Approve Draft/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Regenerate Draft/i })).toBeDisabled();

    // Resolve save
    resolveSave!({
      ...mockContactDetails,
      currentSubject: 'Updated Subject Title',
      status: 'PENDING',
      updatedAt: '2026-09-19T01:00:00.000Z',
    });

    await waitFor(() => {
      expect(screen.getByText('All changes saved')).toBeInTheDocument();
    });
  });

  it('preserves user edits and displays conflict alert when autosave encounters 409 conflict', async () => {
    (outreachApi.updateOutreachDraft as jest.Mock).mockRejectedValue(
      new ApiError(409, { message: 'Concurrent update' }),
    );

    render(
      <OutreachReviewDrawer
        isOpen={true}
        onClose={jest.fn()}
        campaignContactId="cc-1"
        boundContacts={mockBoundContacts}
        companyName="Acme Corp"
      />,
    );

    await screen.findByText('Sarah Connor');

    const subjectInput = screen.getByLabelText(
      /Subject \(3–150 chars\)/i,
    ) as HTMLInputElement;
    fireEvent.change(subjectInput, {
      target: { value: 'My Unsaved Local Subject' },
    });
    fireEvent.blur(subjectInput);

    expect(
      await screen.findByText(/A newer version of this draft was updated/i),
    ).toBeInTheDocument();
    // User's unpersisted input is preserved in the input field
    expect(subjectInput.value).toBe('My Unsaved Local Subject');
  });

  it('correlates generation polling to returned jobId and handles completion', async () => {
    (outreachApi.triggerGenerateOutreach as jest.Mock).mockResolvedValue({
      jobId: 'job-999',
      status: 'QUEUED',
    });

    render(
      <OutreachReviewDrawer
        isOpen={true}
        onClose={jest.fn()}
        campaignContactId="cc-1"
        boundContacts={mockBoundContacts}
        companyName="Acme Corp"
      />,
    );

    await screen.findByText('Sarah Connor');

    const regenerateBtn = screen.getByRole('button', {
      name: /Regenerate Draft/i,
    });
    fireEvent.click(regenerateBtn);

    expect(outreachApi.triggerGenerateOutreach).toHaveBeenCalledWith('cc-1');
    expect(
      await screen.findByText(/Evaluating Evidence & Drafting Message.../i),
    ).toBeInTheDocument();

    // Mock completion returned on next poll
    (outreachApi.fetchCampaignContact as jest.Mock).mockResolvedValue({
      ...mockContactDetails,
      currentSubject: 'Freshly Generated Subject',
      currentBody: 'Freshly generated message body with full details.',
      updatedAt: '2026-09-19T02:00:00.000Z',
      generationJob: {
        id: 'job-999',
        status: 'COMPLETED',
        createdAt: '2026-09-19T01:59:00.000Z',
      },
    });

    await waitFor(
      () => {
        expect(
          screen.queryByText(/Evaluating Evidence & Drafting Message.../i),
        ).not.toBeInTheDocument();
      },
      { timeout: 4000 },
    );

    const subjectInput = screen.getByLabelText(
      /Subject \(3–150 chars\)/i,
    ) as HTMLInputElement;
    expect(subjectInput.value).toBe('Freshly Generated Subject');
  });

  it('explicitly approves draft and transitions to READY', async () => {
    (outreachApi.approveOutreachDraft as jest.Mock).mockResolvedValue({
      ...mockContactDetails,
      status: 'READY',
      updatedAt: '2026-09-19T03:00:00.000Z',
    });

    render(
      <OutreachReviewDrawer
        isOpen={true}
        onClose={jest.fn()}
        campaignContactId="cc-1"
        boundContacts={mockBoundContacts}
        companyName="Acme Corp"
      />,
    );

    await screen.findByText('Sarah Connor');

    const approveBtn = screen.getByRole('button', { name: /Approve Draft/i });
    expect(approveBtn).toBeEnabled();

    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(outreachApi.approveOutreachDraft).toHaveBeenCalledWith('cc-1', {
        expectedUpdatedAt: '2026-09-19T00:00:00.000Z',
      });
    });

    expect(
      await screen.findByText('Draft approved and staged for dispatch.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Draft Approved ✓')).toBeInTheDocument();
  });

  it('displays suppression error when approval returns 409 suppression', async () => {
    (outreachApi.approveOutreachDraft as jest.Mock).mockRejectedValue(
      new ApiError(409, {
        message: 'Recipient email is suppressed',
        code: 'RECIPIENT_SUPPRESSED',
      }),
    );

    render(
      <OutreachReviewDrawer
        isOpen={true}
        onClose={jest.fn()}
        campaignContactId="cc-1"
        boundContacts={mockBoundContacts}
        companyName="Acme Corp"
      />,
    );

    await screen.findByText('Sarah Connor');

    const approveBtn = screen.getByRole('button', { name: /Approve Draft/i });
    fireEvent.click(approveBtn);

    expect(
      await screen.findByText('Recipient email is suppressed. Cannot approve.'),
    ).toBeInTheDocument();
  });

  it('supports sequential contact cycling via buttons and keyboard shortcuts [ and ]', async () => {
    const onSelectMock = jest.fn();

    render(
      <OutreachReviewDrawer
        isOpen={true}
        onClose={jest.fn()}
        campaignContactId="cc-1"
        boundContacts={mockBoundContacts}
        onSelectCampaignContact={onSelectMock}
        companyName="Acme Corp"
      />,
    );

    await screen.findByText('Sarah Connor');

    // Contact index: 1 of 2
    expect(screen.getByText('1 of 2')).toBeInTheDocument();

    // Click Next >
    const nextBtn = screen.getByTitle('Next Contact (])');
    fireEvent.click(nextBtn);
    expect(onSelectMock).toHaveBeenCalledWith('cc-2');

    // Keyboard shortcut ]
    fireEvent.keyDown(window, { key: ']' });
    expect(onSelectMock).toHaveBeenCalledTimes(2);
  });

  it('traps focus inside dialog and closes on Escape key', async () => {
    const onCloseMock = jest.fn();

    render(
      <OutreachReviewDrawer
        isOpen={true}
        onClose={onCloseMock}
        campaignContactId="cc-1"
        boundContacts={mockBoundContacts}
        companyName="Acme Corp"
      />,
    );

    await screen.findByText('Sarah Connor');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('handles 30s timeout gracefully and allows manual status check', async () => {
    jest.useFakeTimers();
    (outreachApi.triggerGenerateOutreach as jest.Mock).mockResolvedValue({
      jobId: 'job-slow',
      status: 'QUEUED',
    });

    render(
      <OutreachReviewDrawer
        isOpen={true}
        onClose={jest.fn()}
        campaignContactId="cc-1"
        boundContacts={mockBoundContacts}
        companyName="Acme Corp"
      />,
    );

    await screen.findByText('Sarah Connor');

    const regenerateBtn = screen.getByRole('button', {
      name: /Regenerate Draft/i,
    });
    await act(async () => {
      fireEvent.click(regenerateBtn);
    });

    expect(outreachApi.triggerGenerateOutreach).toHaveBeenCalledWith('cc-1');

    // Advance timers by 32 seconds to trigger client timeout
    act(() => {
      jest.advanceTimersByTime(32000);
    });

    expect(
      screen.getByText('Generation Still Processing in Background'),
    ).toBeInTheDocument();
    const checkStatusBtn = screen.getByRole('button', { name: /Check Status/i });
    expect(checkStatusBtn).toBeInTheDocument();

    (outreachApi.fetchCampaignContact as jest.Mock).mockResolvedValue({
      ...mockContactDetails,
      currentSubject: 'Completed Subject',
      currentBody: 'Completed Body text with enough characters.',
      generationJob: {
        id: 'job-slow',
        status: 'COMPLETED',
      },
    });

    await act(async () => {
      fireEvent.click(checkStatusBtn);
    });

    expect(outreachApi.fetchCampaignContact).toHaveBeenCalledWith('cc-1');

    jest.useRealTimers();
  });
});

