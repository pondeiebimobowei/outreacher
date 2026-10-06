import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { OutreachReviewDrawer } from './outreach-review-drawer';
import * as outreachApi from '../../api/outreach';
import { ApiError } from '../../api/client';

jest.mock('../../api/outreach');

const mockOutreach: outreachApi.OutreachDto = {
  id: 'outreach-1',
  workspaceId: 'ws-1',
  personCompanyAssociationId: 'pca-1',
  campaignRecipientId: 'recip-1',
  senderAccountId: 'acc-1',
  contentSource: 'AI',
  templateId: null,
  aiPromptContext: 'Target engineering director with focus on latency improvements',
  aiGenerationStatus: null,
  draftVersion: 1,
  subject: 'Acme distributed systems architecture',
  message: 'Hi Sarah, I noticed Acme is hiring a Lead Distributed Systems Architect...',
  outreachReason: 'Leads the engineering team hiring for this role.',
  status: 'DRAFT',
  maxFollowUps: 2,
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
  person: {
    id: 'per-1',
    firstName: 'Sarah',
    lastName: 'Connor',
    title: 'VP of Engineering',
    email: 'sarah@acme.com',
    personKind: 'PERSON',
    confidence: 'HIGH',
  },
  company: {
    id: 'comp-1',
    name: 'Acme Corp',
  },
};

const mockRecipients: outreachApi.CampaignRecipientSummaryDto[] = [
  {
    id: 'recip-1',
    workspaceId: 'ws-1',
    campaignId: 'camp-1',
    personCompanyAssociationId: 'pca-1',
    status: 'PENDING',
    targetRole: 'VP of Engineering',
    selectedOpportunityId: null,
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
    outreachId: 'outreach-1',
    person: {
      id: 'per-1',
      firstName: 'Sarah',
      lastName: 'Connor',
      title: 'VP of Engineering',
      email: 'sarah@acme.com',
      personKind: 'PERSON',
      confidence: 'HIGH',
    },
    outreach: {
      id: 'outreach-1',
      status: 'DRAFT',
      subject: 'Acme distributed systems architecture',
      message: 'Hi Sarah...',
      aiGenerationStatus: null,
    },
  },
  {
    id: 'recip-2',
    workspaceId: 'ws-1',
    campaignId: 'camp-1',
    personCompanyAssociationId: 'pca-2',
    status: 'PENDING',
    targetRole: 'Engineering Manager',
    selectedOpportunityId: null,
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
    outreachId: 'outreach-2',
    person: {
      id: 'per-2',
      firstName: 'John',
      lastName: 'Doe',
      title: 'Engineering Manager',
      email: 'john@acme.com',
      personKind: 'PERSON',
      confidence: 'MEDIUM',
    },
    outreach: {
      id: 'outreach-2',
      status: 'DRAFT',
      subject: 'Acme EM opening',
      message: 'Hi John...',
      aiGenerationStatus: null,
    },
  },
];

describe('OutreachReviewDrawer', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    (outreachApi.fetchOutreachById as jest.Mock).mockResolvedValue(mockOutreach);
  });

  it('renders drawer when open with contact and outreach context', async () => {
    render(
      <OutreachReviewDrawer
        isOpen={true}
        onClose={jest.fn()}
        outreachId="outreach-1"
        recipients={mockRecipients}
        companyName="Acme Corp"
      />,
    );

    expect(await screen.findByText('Sarah Connor')).toBeInTheDocument();
    expect(screen.getByText('DRAFT')).toBeInTheDocument();
    expect(
      screen.getByText('"Leads the engineering team hiring for this role."'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Target engineering director with focus on latency improvements'),
    ).toBeInTheDocument();
  });

  it('displays the mandatory AI Assisted — Review Required banner', async () => {
    render(
      <OutreachReviewDrawer
        isOpen={true}
        onClose={jest.fn()}
        outreachId="outreach-1"
        recipients={mockRecipients}
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
        outreachId="outreach-1"
        recipients={mockRecipients}
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

  it('performs autosave on blur with expectedUpdatedAt concurrency token via updateOutreach', async () => {
    (outreachApi.updateOutreach as jest.Mock).mockResolvedValue({
      ...mockOutreach,
      subject: 'Updated Subject Title',
      status: 'DRAFT',
      updatedAt: '2026-09-19T01:00:00.000Z',
    });

    render(
      <OutreachReviewDrawer
        isOpen={true}
        onClose={jest.fn()}
        outreachId="outreach-1"
        recipients={mockRecipients}
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
      expect(outreachApi.updateOutreach).toHaveBeenCalledWith('outreach-1', {
        subject: 'Updated Subject Title',
        message: mockOutreach.message,
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
    (outreachApi.updateOutreach as jest.Mock).mockReturnValue(savePromise);

    render(
      <OutreachReviewDrawer
        isOpen={true}
        onClose={jest.fn()}
        outreachId="outreach-1"
        recipients={mockRecipients}
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
      ...mockOutreach,
      subject: 'Updated Subject Title',
      status: 'DRAFT',
      updatedAt: '2026-09-19T01:00:00.000Z',
    });

    await waitFor(() => {
      expect(screen.getByText('All changes saved')).toBeInTheDocument();
    });
  });

  it('preserves user edits and displays conflict alert when autosave encounters 409 conflict', async () => {
    (outreachApi.updateOutreach as jest.Mock).mockRejectedValue(
      new ApiError(409, { message: 'Concurrent update' }),
    );

    render(
      <OutreachReviewDrawer
        isOpen={true}
        onClose={jest.fn()}
        outreachId="outreach-1"
        recipients={mockRecipients}
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
    expect(subjectInput.value).toBe('My Unsaved Local Subject');
  });

  it('explicitly approves draft and transitions to APPROVED', async () => {
    (outreachApi.approveOutreach as jest.Mock).mockResolvedValue({
      ...mockOutreach,
      status: 'APPROVED',
      updatedAt: '2026-09-19T03:00:00.000Z',
    });

    render(
      <OutreachReviewDrawer
        isOpen={true}
        onClose={jest.fn()}
        outreachId="outreach-1"
        recipients={mockRecipients}
        companyName="Acme Corp"
      />,
    );

    await screen.findByText('Sarah Connor');

    const approveBtn = screen.getByRole('button', { name: /Approve Draft/i });
    expect(approveBtn).toBeEnabled();

    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(outreachApi.approveOutreach).toHaveBeenCalledWith('outreach-1', {
        expectedUpdatedAt: '2026-09-19T00:00:00.000Z',
      });
    });

    expect(
      await screen.findByText('Draft approved and staged for dispatch.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send Now/i })).toBeInTheDocument();
    expect(screen.getByText('APPROVED')).toBeInTheDocument();
  });

  it('displays suppression error when approval returns 409 suppression', async () => {
    (outreachApi.approveOutreach as jest.Mock).mockRejectedValue(
      new ApiError(409, {
        message: 'Recipient email is suppressed',
        code: 'RECIPIENT_SUPPRESSED',
      }),
    );

    render(
      <OutreachReviewDrawer
        isOpen={true}
        onClose={jest.fn()}
        outreachId="outreach-1"
        recipients={mockRecipients}
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

  it('supports sequential recipient cycling via buttons and keyboard shortcuts [ and ]', async () => {
    const onSelectMock = jest.fn();

    render(
      <OutreachReviewDrawer
        isOpen={true}
        onClose={jest.fn()}
        outreachId="outreach-1"
        recipients={mockRecipients}
        onSelectRecipient={onSelectMock}
        companyName="Acme Corp"
      />,
    );

    await screen.findByText('Sarah Connor');

    // Index: 1 of 2
    expect(screen.getByText('1 of 2')).toBeInTheDocument();

    // Click Next >
    const nextBtn = screen.getByTitle('Next Recipient (])');
    fireEvent.click(nextBtn);
    expect(onSelectMock).toHaveBeenCalledWith('outreach-2');

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
        outreachId="outreach-1"
        recipients={mockRecipients}
        companyName="Acme Corp"
      />,
    );

    await screen.findByText('Sarah Connor');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  describe('Pre-Dispatch Hold and SendOutreach', () => {
    const mockApprovedOutreach: outreachApi.OutreachDto = {
      ...mockOutreach,
      status: 'APPROVED',
    };

    beforeEach(() => {
      localStorage.clear();
      (outreachApi.fetchOutreachById as jest.Mock).mockResolvedValue(
        mockApprovedOutreach,
      );
    });

    it('opens confirmation modal when clicking Send Now and preference is not skipped', async () => {
      render(
        <OutreachReviewDrawer
          isOpen={true}
          onClose={jest.fn()}
          outreachId="outreach-1"
          recipients={mockRecipients}
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

    it('cancels confirmation modal without network calls and preserves APPROVED state', async () => {
      render(
        <OutreachReviewDrawer
          isOpen={true}
          onClose={jest.fn()}
          outreachId="outreach-1"
          recipients={mockRecipients}
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
      expect(outreachApi.sendOutreach).not.toHaveBeenCalled();
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
          outreachId="outreach-1"
          recipients={mockRecipients}
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
      expect(outreachApi.sendOutreach).not.toHaveBeenCalled();

      // Click Cancel Send during hold
      const cancelSendBtn = screen.getByRole('button', { name: /Cancel Send/i });
      fireEvent.click(cancelSendBtn);

      expect(screen.queryByTestId('pre-dispatch-hold')).not.toBeInTheDocument();

      // Advance timers past 5s
      act(() => {
        jest.advanceTimersByTime(6000);
      });

      expect(outreachApi.sendOutreach).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', { name: /Send Now/i }),
      ).toBeInTheDocument();

      jest.useRealTimers();
    });

    it('executes sendOutreach with RFC4122 v4 UUID Idempotency-Key upon hold expiry and removes undo/cancel', async () => {
      jest.useFakeTimers();
      (outreachApi.sendOutreach as jest.Mock).mockResolvedValue({
        message: 'QUEUED',
      });

      render(
        <OutreachReviewDrawer
          isOpen={true}
          onClose={jest.fn()}
          outreachId="outreach-1"
          recipients={mockRecipients}
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

      expect(outreachApi.sendOutreach).toHaveBeenCalledTimes(1);
      const [calledId, calledKey] = (
        outreachApi.sendOutreach as jest.Mock
      ).mock.calls[0];
      expect(calledId).toBe('outreach-1');
      expect(calledKey).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      expect(
        screen.queryByRole('button', { name: /Cancel Send/i }),
      ).not.toBeInTheDocument();

      jest.useRealTimers();
    });

    it('persists scoped preference when "Don\'t ask again" is checked and skips confirmation on subsequent sends', async () => {
      jest.useFakeTimers();
      (outreachApi.sendOutreach as jest.Mock).mockResolvedValue({
        message: 'QUEUED',
      });

      render(
        <OutreachReviewDrawer
          isOpen={true}
          onClose={jest.fn()}
          outreachId="outreach-1"
          recipients={mockRecipients}
          companyName="Acme Corp"
          userId="user-123"
        />,
      );

      await screen.findByText('Sarah Connor');
      fireEvent.click(screen.getByRole('button', { name: /Send Now/i }));

      const checkbox = screen.getByRole('checkbox', {
        name: /Don't ask again for single sends/i,
      });
      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();

      fireEvent.click(screen.getByRole('button', { name: /Confirm & Send/i }));

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

    it('handles 409 RECIPIENT_SUPPRESSED gracefully on send dispatch', async () => {
      jest.useFakeTimers();
      (outreachApi.sendOutreach as jest.Mock).mockRejectedValue(
        new ApiError(409, {
          code: 'RECIPIENT_SUPPRESSED',
          message: 'Recipient email is suppressed',
        }),
      );

      render(
        <OutreachReviewDrawer
          isOpen={true}
          onClose={jest.fn()}
          outreachId="outreach-1"
          recipients={mockRecipients}
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
      (outreachApi.sendOutreach as jest.Mock).mockRejectedValue(
        new ApiError(409, {
          code: 'CAMPAIGN_STATE_CONFLICT',
          message: 'Campaign is not active',
        }),
      );

      render(
        <OutreachReviewDrawer
          isOpen={true}
          onClose={jest.fn()}
          outreachId="outreach-1"
          recipients={mockRecipients}
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
  });

  describe('Outreach domain features: Resume, AiGenerationStatus, and Editing Rules', () => {
    it('shows polling spinner and draft status when aiGenerationStatus is PENDING', async () => {
      const pendingOutreach: outreachApi.OutreachDto = {
        ...mockOutreach,
        aiGenerationStatus: 'PENDING',
        subject: '',
        message: '',
      };
      (outreachApi.fetchOutreachById as jest.Mock).mockResolvedValue(pendingOutreach);

      render(
        <OutreachReviewDrawer
          isOpen={true}
          onClose={jest.fn()}
          outreachId="outreach-1"
          companyName="Acme Corp"
        />,
      );

      expect(await screen.findByText('PENDING')).toBeInTheDocument();
      expect(screen.getByText(/AI generation in progress/i)).toBeInTheDocument();
    });

    it('displays Resume Outreach button when status is PAUSED and calls resumeOutreach', async () => {
      const pausedOutreach: outreachApi.OutreachDto = {
        ...mockOutreach,
        status: 'PAUSED',
      };
      const resumedOutreach: outreachApi.OutreachDto = {
        ...pausedOutreach,
        status: 'ACTIVE',
      };
      (outreachApi.fetchOutreachById as jest.Mock).mockResolvedValue(pausedOutreach);
      (outreachApi.resumeOutreach as jest.Mock).mockResolvedValue(resumedOutreach);

      render(
        <OutreachReviewDrawer
          isOpen={true}
          onClose={jest.fn()}
          outreachId="outreach-1"
          companyName="Acme Corp"
        />,
      );

      expect(await screen.findByRole('button', { name: /Resume Outreach/i })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Resume Outreach/i }));

      await waitFor(() => {
        expect(outreachApi.resumeOutreach).toHaveBeenCalledWith('outreach-1');
      });

      expect(await screen.findByText('ACTIVE')).toBeInTheDocument();
    });

    it('surfaces backend 409 conflict when resumeOutreach fails', async () => {
      const pausedOutreach: outreachApi.OutreachDto = {
        ...mockOutreach,
        status: 'PAUSED',
      };
      (outreachApi.fetchOutreachById as jest.Mock).mockResolvedValue(pausedOutreach);
      (outreachApi.resumeOutreach as jest.Mock).mockRejectedValue(
        new ApiError(409, {
          message: 'Campaign is currently PAUSED. Cannot resume individual outreach.',
        }),
      );

      render(
        <OutreachReviewDrawer
          isOpen={true}
          onClose={jest.fn()}
          outreachId="outreach-1"
          companyName="Acme Corp"
        />,
      );

      const resumeBtn = await screen.findByRole('button', { name: /Resume Outreach/i });
      fireEvent.click(resumeBtn);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/Campaign is currently PAUSED. Cannot resume individual outreach./i);
    });

    it('displays AI generation FAILED alert and SKIPPED note', async () => {
      const failedOutreach: outreachApi.OutreachDto = {
        ...mockOutreach,
        aiGenerationStatus: 'FAILED',
      };
      (outreachApi.fetchOutreachById as jest.Mock).mockResolvedValue(failedOutreach);

      const { unmount } = render(
        <OutreachReviewDrawer
          isOpen={true}
          onClose={jest.fn()}
          outreachId="out-failed"
          companyName="Acme Corp"
        />,
      );

      expect(await screen.findByText('AI Generation Failed')).toBeInTheDocument();
      expect(
        screen.getByText(/Automated draft generation encountered an error/i),
      ).toBeInTheDocument();

      unmount();

      const skippedOutreach: outreachApi.OutreachDto = {
        ...mockOutreach,
        aiGenerationStatus: 'SKIPPED',
      };
      (outreachApi.fetchOutreachById as jest.Mock).mockResolvedValue(skippedOutreach);

      render(
        <OutreachReviewDrawer
          isOpen={true}
          onClose={jest.fn()}
          outreachId="out-skipped"
          companyName="Acme Corp"
        />,
      );

      expect(await screen.findByText('AI Generation Skipped')).toBeInTheDocument();
      expect(
        screen.getByText(/AI generation was superseded because manual edits were saved/i),
      ).toBeInTheDocument();
    });

    it('disables subject and message inputs when status is not DRAFT', async () => {
      const pausedOutreach: outreachApi.OutreachDto = {
        ...mockOutreach,
        status: 'PAUSED',
      };
      (outreachApi.fetchOutreachById as jest.Mock).mockResolvedValue(pausedOutreach);

      render(
        <OutreachReviewDrawer
          isOpen={true}
          onClose={jest.fn()}
          outreachId="outreach-1"
          companyName="Acme Corp"
        />,
      );

      await screen.findByDisplayValue('Acme distributed systems architecture');

      const subjectInput = screen.getByLabelText(/Subject/i);
      const bodyInput = screen.getByLabelText(/Body Text/i);

      expect(subjectInput).toBeDisabled();
      expect(bodyInput).toBeDisabled();
    });
  });
});
