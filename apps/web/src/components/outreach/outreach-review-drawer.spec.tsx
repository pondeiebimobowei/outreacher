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
  latestEmailSend: null,
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
    localStorage.clear();
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

  it('explicitly approves draft and s to READY', async () => {
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
    expect(screen.getByRole('button', { name: /Send Now/i })).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
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

  describe('Packet 5: Pre-Dispatch Hold, BL-014 Send Dispatch & Idempotent Delivery', () => {
    const mockReadyDetails: outreachApi.CampaignContactDetailsDto = {
      ...mockContactDetails,
      status: 'READY',
      currentSubject: 'Acme distributed systems architecture',
      currentBody:
        'Hi Sarah, I noticed Acme is hiring a Lead Distributed Systems Architect...',
    };

    beforeEach(() => {
      localStorage.clear();
      (outreachApi.fetchCampaignContact as jest.Mock).mockResolvedValue(
        mockReadyDetails,
      );
    });

    it('opens confirmation modal when clicking Send Now and preference is not skipped', async () => {
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
      const sendBtn = screen.getByRole('button', { name: /Send Now/i });
      fireEvent.click(sendBtn);

      const dialog = screen.getByRole('dialog', {
        name: /Confirm Outreach Dispatch/i,
      });
      expect(dialog).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Confirm & Send/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Cancel/i }),
      ).toBeInTheDocument();
    });

    it('cancels confirmation modal without network calls and preserves READY state', async () => {
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
      fireEvent.click(screen.getByRole('button', { name: /Send Now/i }));

      const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelBtn);

      expect(
        screen.queryByRole('dialog', { name: /Confirm Outreach Dispatch/i }),
      ).not.toBeInTheDocument();
      expect(outreachApi.sendCampaignContact).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', { name: /Send Now/i }),
      ).toBeInTheDocument();
    });

    it('enters 5-second pre-dispatch hold when confirmed, allowing cancellation with zero HTTP side-effects', async () => {
      jest.useFakeTimers();

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
      fireEvent.click(screen.getByRole('button', { name: /Send Now/i }));

      fireEvent.click(screen.getByRole('button', { name: /Confirm & Send/i }));

      // Pre-dispatch hold active
      expect(screen.getByTestId('pre-dispatch-hold')).toBeInTheDocument();
      expect(
        screen.getByText(/Sending to Sarah Connor in 5s\.\.\./i),
      ).toBeInTheDocument();
      expect(outreachApi.sendCampaignContact).not.toHaveBeenCalled();

      // Click Cancel Send during hold
      const cancelSendBtn = screen.getByRole('button', { name: /Cancel Send/i });
      fireEvent.click(cancelSendBtn);

      expect(screen.queryByTestId('pre-dispatch-hold')).not.toBeInTheDocument();

      // Advance timers past 5s
      act(() => {
        jest.advanceTimersByTime(6000);
      });

      expect(outreachApi.sendCampaignContact).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', { name: /Send Now/i }),
      ).toBeInTheDocument();

      jest.useRealTimers();
    });

    it('executes sendCampaignContact with RFC4122 v4 UUID Idempotency-Key upon hold expiry and removes undo/cancel', async () => {
      jest.useFakeTimers();
      (outreachApi.sendCampaignContact as jest.Mock).mockResolvedValue({
        id: 'cc-1',
        status: 'SENDING',
        sendReservation: {
          id: 'es-1',
          status: 'PENDING',
          idempotencyKey: 'test-uuid',
        },
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
      fireEvent.click(screen.getByRole('button', { name: /Send Now/i }));
      fireEvent.click(screen.getByRole('button', { name: /Confirm & Send/i }));

      expect(screen.getByTestId('pre-dispatch-hold')).toBeInTheDocument();

      // Advance timer by 5000ms
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      expect(outreachApi.sendCampaignContact).toHaveBeenCalledTimes(1);
      const [calledId, calledKey] = (
        outreachApi.sendCampaignContact as jest.Mock
      ).mock.calls[0];
      expect(calledId).toBe('cc-1');
      // UUID v4 format verification
      expect(calledKey).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      // Verify that Cancel / Undo are absent once dispatch has begun
      expect(
        screen.queryByRole('button', { name: /Cancel Send/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Undo/i }),
      ).not.toBeInTheDocument();

      jest.useRealTimers();
    });

    it('persists scoped preference when "Don\'t ask again" is checked and skips confirmation on subsequent sends', async () => {
      jest.useFakeTimers();
      (outreachApi.sendCampaignContact as jest.Mock).mockResolvedValue({
        id: 'cc-1',
        status: 'SENDING',
      });

      render(
        <OutreachReviewDrawer
          isOpen={true}
          onClose={jest.fn()}
          campaignContactId="cc-1"
          boundContacts={mockBoundContacts}
          companyName="Acme Corp"
          userId="user-123"
        />,
      );

      await screen.findByText('Sarah Connor');
      fireEvent.click(screen.getByRole('button', { name: /Send Now/i }));

      // Modal open, check the checkbox
      const checkbox = screen.getByRole('checkbox', {
        name: /Don't ask again for single sends/i,
      });
      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();

      fireEvent.click(screen.getByRole('button', { name: /Confirm & Send/i }));

      // Preference scoped to workspace ws-1 and user user-123
      expect(
        localStorage.getItem(
          'outreacher:skip_single_send_confirmation:ws-1:user-123',
        ),
      ).toBe('true');

      // Cancel the hold to reset
      fireEvent.click(screen.getByRole('button', { name: /Cancel Send/i }));

      // Click Send Now again - modal should NOT open, should directly enter hold
      fireEvent.click(screen.getByRole('button', { name: /Send Now/i }));
      expect(
        screen.queryByRole('dialog', { name: /Confirm Outreach Dispatch/i }),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('pre-dispatch-hold')).toBeInTheDocument();

      jest.useRealTimers();
    });

    it('polls every 2s until contact status becomes SENT, displays Sent banner with sentAt', async () => {
      jest.useFakeTimers();
      (outreachApi.sendCampaignContact as jest.Mock).mockResolvedValue({
        id: 'cc-1',
        status: 'SENDING',
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
      fireEvent.click(screen.getByRole('button', { name: /Send Now/i }));
      fireEvent.click(screen.getByRole('button', { name: /Confirm & Send/i }));

      // Advance hold
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      expect(outreachApi.sendCampaignContact).toHaveBeenCalledTimes(1);

      // Now contact is in SENDING and polling starts
      // Mock fetchCampaignContact returning SENT
      (outreachApi.fetchCampaignContact as jest.Mock).mockResolvedValue({
        ...mockReadyDetails,
        status: 'SENT',
        latestEmailSend: {
          id: 'es-1',
          status: 'SENT',
          sentAt: '2026-09-19T01:00:00.000Z',
        },
      });

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      expect(outreachApi.fetchCampaignContact).toHaveBeenCalled();
      expect(
        screen.getByText('Outreach Email Sent'),
      ).toBeInTheDocument();
      expect(screen.getByText('Sent')).toBeInTheDocument();

      // Advancing further should not trigger additional polling calls
      const callCount = (outreachApi.fetchCampaignContact as jest.Mock).mock
        .calls.length;
      await act(async () => {
        jest.advanceTimersByTime(4000);
      });
      expect(
        (outreachApi.fetchCampaignContact as jest.Mock).mock.calls.length,
      ).toBe(callCount);

      jest.useRealTimers();
    });

    it('polls every 2s until contact status becomes FAILED, displays error message without retry button', async () => {
      jest.useFakeTimers();
      (outreachApi.sendCampaignContact as jest.Mock).mockResolvedValue({
        id: 'cc-1',
        status: 'SENDING',
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
      fireEvent.click(screen.getByRole('button', { name: /Send Now/i }));
      fireEvent.click(screen.getByRole('button', { name: /Confirm & Send/i }));

      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      (outreachApi.fetchCampaignContact as jest.Mock).mockResolvedValue({
        ...mockReadyDetails,
        status: 'FAILED',
        latestEmailSend: {
          id: 'es-1',
          status: 'FAILED',
          errorMessage: 'SMTP transport gateway timeout',
        },
      });

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      expect(
        screen.getByText('Outreach Dispatch Failed'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('SMTP transport gateway timeout'),
      ).toBeInTheDocument();
      expect(screen.getAllByText('Send Failed').length).toBeGreaterThan(0);
      expect(
        screen.queryByRole('button', { name: /Retry/i }),
      ).not.toBeInTheDocument();

      jest.useRealTimers();
    });

    it('handles 409 RECIPIENT_SUPPRESSED gracefully on send dispatch', async () => {
      jest.useFakeTimers();
      (outreachApi.sendCampaignContact as jest.Mock).mockRejectedValue(
        new ApiError(409, {
          code: 'RECIPIENT_SUPPRESSED',
          message: 'Recipient email is suppressed',
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
      fireEvent.click(screen.getByRole('button', { name: /Send Now/i }));
      fireEvent.click(screen.getByRole('button', { name: /Confirm & Send/i }));

      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      expect(
        screen.getByText('Recipient email is suppressed. Cannot send.'),
      ).toBeInTheDocument();

      jest.useRealTimers();
    });

    it('handles 409 CAMPAIGN_STATE_CONFLICT with neutral copy', async () => {
      jest.useFakeTimers();
      (outreachApi.sendCampaignContact as jest.Mock).mockRejectedValue(
        new ApiError(409, {
          code: 'CAMPAIGN_STATE_CONFLICT',
          message: 'Campaign is not active',
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
      fireEvent.click(screen.getByRole('button', { name: /Send Now/i }));
      fireEvent.click(screen.getByRole('button', { name: /Confirm & Send/i }));

      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      expect(
        screen.getByText('This campaign cannot send from its current state.'),
      ).toBeInTheDocument();

      jest.useRealTimers();
    });

    it('disables contact cycling during hold and sending', async () => {
      jest.useFakeTimers();

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
      fireEvent.click(screen.getByRole('button', { name: /Send Now/i }));
      fireEvent.click(screen.getByRole('button', { name: /Confirm & Send/i }));

      // In hold
      const nextBtn = screen.getByRole('button', { name: /Next/i });
      expect(nextBtn).toBeDisabled();

      // Keyboard navigation ignored
      fireEvent.keyDown(window, { key: ']' });
      expect(outreachApi.fetchCampaignContact).toHaveBeenCalledTimes(1); // initial load only

      jest.useRealTimers();
    });
  });
});

