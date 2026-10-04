import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateCampaignModal } from './CreateCampaignModal';
import * as campaignsApi from '../../../api/campaigns';
import * as templatesApi from '../../../api/templates';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../api/campaigns');
jest.mock('../../../api/templates');
jest.mock('@tanstack/react-router', () => ({
  useNavigate: () => jest.fn(),
}));

const mockTemplates: templatesApi.EmailTemplateDto[] = [
  {
    id: 'tmpl-valid',
    workspaceId: 'ws-1',
    name: 'Executive Intro',
    isArchived: false,
    steps: [
      {
        id: 's-0',
        templateId: 'tmpl-valid',
        sequence: 0,
        subjectTemplate: 'Intro for {{contact.firstName}}',
        bodyTemplate: 'Hi {{contact.firstName}}, at {{company.name}}',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 's-1',
        templateId: 'tmpl-valid',
        sequence: 1,
        subjectTemplate: 'Re: Intro',
        bodyTemplate: 'Following up regarding {{opportunity.title}}',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
    ],
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  },
  {
    id: 'tmpl-has-sender',
    workspaceId: 'ws-1',
    name: 'Invalid Template with Sender Name',
    isArchived: false,
    steps: [
      {
        id: 's-sender',
        templateId: 'tmpl-has-sender',
        sequence: 0,
        subjectTemplate: 'Message from {{sender.name}}',
        bodyTemplate: 'Hello {{contact.firstName}}',
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
    ],
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  },
];

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('CreateCampaignModal - Multi-Company & Content Source Redesign', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (templatesApi.fetchTemplates as jest.Mock).mockResolvedValue([
      {
        id: 'tmpl-valid',
        workspaceId: 'ws-1',
        name: 'Executive Intro',
        isArchived: false,
        stepCount: 2,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 'tmpl-has-sender',
        workspaceId: 'ws-1',
        name: 'Invalid Template with Sender Name',
        isArchived: false,
        stepCount: 1,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
    ]);
    (templatesApi.fetchTemplateById as jest.Mock).mockImplementation((id: string) => {
      const found = mockTemplates.find((t) => t.id === id);
      return Promise.resolve(found || mockTemplates[0]);
    });
  });

  it('renders modal without company selector dropdown', async () => {
    renderWithClient(<CreateCampaignModal isOpen={true} onClose={jest.fn()} />);

    expect(screen.getByRole('dialog', { name: /Create Campaign/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Target Company/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Select a company/i)).not.toBeInTheDocument();
  });

  it('allows toggling between TEMPLATE and AI content sources', async () => {
    renderWithClient(<CreateCampaignModal isOpen={true} onClose={jest.fn()} />);

    expect(screen.getByRole('radio', { name: /Template/i })).toBeChecked();
    expect(screen.getByLabelText(/Select Template/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/AI Prompt Context/i)).not.toBeInTheDocument();

    // Toggle to AI
    const aiRadio = screen.getByRole('radio', { name: /AI Generation/i });
    fireEvent.click(aiRadio);

    expect(aiRadio).toBeChecked();
    expect(screen.getByLabelText(/AI Prompt Context/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Select Template/i)).not.toBeInTheDocument();
  });

  it('shows template step count and validates that template has sufficient steps for maxFollowUps', async () => {
    renderWithClient(<CreateCampaignModal isOpen={true} onClose={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Executive Intro \(2 steps\)/i })).toBeInTheDocument();
    });

    const templateSelect = screen.getByLabelText(/Select Template/i);
    fireEvent.change(templateSelect, { target: { value: 'tmpl-valid' } });

    // Set maxFollowUps to 3 (requires 4 steps: initial 0 + followups 1..3)
    const followUpsInput = screen.getByLabelText(/Max Follow-ups/i);
    fireEvent.change(followUpsInput, { target: { value: '3' } });

    expect(
      screen.getByText(/Selected template only has 2 steps, but max follow-ups of 3 requires 4 steps/i),
    ).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Create Campaign/i });
    expect(submitBtn).toBeDisabled();
  });

  it('disables or warns when selecting template containing {{sender.name}}', async () => {
    renderWithClient(<CreateCampaignModal isOpen={true} onClose={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Invalid Template with Sender Name/i })).toBeInTheDocument();
    });

    const templateSelect = screen.getByLabelText(/Select Template/i);
    fireEvent.change(templateSelect, { target: { value: 'tmpl-has-sender' } });

    await waitFor(() => {
      expect(
        screen.getByText(/Cannot use templates with \{\{sender\.name\}\} in campaigns \(senders are selected at send time\)/i),
      ).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /Create Campaign/i });
    expect(submitBtn).toBeDisabled();
  });

  it('submits campaign creation with AI source and aiPromptContext', async () => {
    (campaignsApi.createCampaign as jest.Mock).mockResolvedValue({
      id: 'camp-ai-1',
      name: 'Q4 Enterprise Inbound',
      status: 'DRAFT',
      contentSource: 'AI',
      templateId: null,
      aiPromptContext: 'Target engineering executives with high-signal career hooks',
      followUpDelayBusinessDays: 3,
      maxFollowUps: 1,
      senderAccountIds: [],
    });

    renderWithClient(<CreateCampaignModal isOpen={true} onClose={jest.fn()} />);

    fireEvent.change(screen.getByLabelText(/Campaign Name/i), {
      target: { value: 'Q4 Enterprise Inbound' },
    });

    // Select AI
    fireEvent.click(screen.getByRole('radio', { name: /AI Generation/i }));

    const aiPromptInput = screen.getByLabelText(/AI Prompt Context/i);
    fireEvent.change(aiPromptInput, {
      target: { value: 'Target engineering executives with high-signal career hooks' },
    });

    const submitBtn = screen.getByRole('button', { name: /Create Campaign/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(campaignsApi.createCampaign).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Q4 Enterprise Inbound',
          contentSource: 'AI',
          aiPromptContext: 'Target engineering executives with high-signal career hooks',
          templateId: null,
        }),
      );
    });
  });
});
