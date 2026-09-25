import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../../api/client';
import { Route as ConversationsRoute } from './conversations.index';
import { CampaignDto } from '../../api/campaigns';

jest.mock('../../api/client', () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

jest.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
  Link: ({
    children,
    to,
    params,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    params?: Record<string, string>;
    className?: string;
  }) => {
    let href = to;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        href = href.replace(`$${k}`, v);
      });
    }
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  },
}));

const mockCampaigns: CampaignDto[] = [
  {
    id: 'camp-1',
    workspaceId: 'ws-1',
    companyId: 'comp-1',
    senderAccountId: 'acc-1',
    templateId: 'tpl-1',
    normalizedName: 'norm-name',
    name: 'Active Outreach Discussion',
    status: 'ACTIVE',
    senders: [{ assignmentStatus: 'ACTIVE', senderAccountId: 'acc-1', fromName: 'Rep', fromEmail: 'rep@outreach.acme.com', senderStatus: 'ACTIVE', integrationStatus: 'ACTIVE' }],
    followUpDelayBusinessDays: 2,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-02T10:00:00Z',
  },
  {
    id: 'camp-2',
    workspaceId: 'ws-1',
    companyId: 'comp-2',
    senderAccountId: 'acc-1',
    templateId: 'tpl-1',
    normalizedName: 'norm-name',
    name: 'Draft Campaign Setup',
    status: 'DRAFT',
    senders: [],
    followUpDelayBusinessDays: 0,
    createdAt: '2026-09-03T10:00:00Z',
    updatedAt: '2026-09-04T10:00:00Z',
  },
];

describe('ConversationsIndexComponent', () => {
  const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  function renderComponent() {
    const Component = (ConversationsRoute as unknown as { component: React.ComponentType }).component;
    return render(
      <QueryClientProvider client={queryClient}>
        <Component />
      </QueryClientProvider>
    );
  }

  it('renders the header and campaign-managed explanation banner', async () => {
    mockGet.mockResolvedValueOnce(mockCampaigns);
    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Conversations' })).toBeInTheDocument();
    });

    expect(screen.getByText('Campaign-Managed Conversations')).toBeInTheDocument();
    expect(
      screen.getByText(/Conversations are initiated when contacts respond to outreach emails/i)
    ).toBeInTheDocument();
  });

  it('renders campaign cards with links to campaign review and company workspace', async () => {
    mockGet.mockResolvedValueOnce(mockCampaigns);
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Active Outreach Discussion')).toBeInTheDocument();
    });

    expect(screen.getByText('Draft Campaign Setup')).toBeInTheDocument();
    expect(screen.getByText('rep@outreach.acme.com')).toBeInTheDocument();

    const reviewLinks = screen.getAllByRole('link', { name: /Review Campaign/i });
    expect(reviewLinks).toHaveLength(2);
    expect(reviewLinks[0]).toHaveAttribute('href', '/campaigns/camp-1/review');

    const companyLinks = screen.getAllByRole('link', { name: /Company ↗/i });
    expect(companyLinks).toHaveLength(2);
    expect(companyLinks[0]).toHaveAttribute('href', '/companies/comp-1');
  });

  it('renders empty state when no campaigns exist', async () => {
    mockGet.mockResolvedValueOnce([]);
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Start an outreach campaign to engage with contacts/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View Campaigns/i })).toHaveAttribute(
      'href',
      '/campaigns'
    );
  });

  it('filters conversations by search input', async () => {
    mockGet.mockResolvedValueOnce(mockCampaigns);
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Active Outreach Discussion')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search campaigns by name or sender...');
    fireEvent.change(searchInput, { target: { value: 'Active' } });

    expect(screen.getByText('Active Outreach Discussion')).toBeInTheDocument();
    expect(screen.queryByText('Draft Campaign Setup')).not.toBeInTheDocument();
  });

  it('filters conversations by status pill', async () => {
    mockGet.mockResolvedValueOnce(mockCampaigns);
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Active Outreach Discussion')).toBeInTheDocument();
    });

    const draftPill = screen.getByRole('button', { name: /Draft/i });
    fireEvent.click(draftPill);

    expect(screen.queryByText('Active Outreach Discussion')).not.toBeInTheDocument();
    expect(screen.getByText('Draft Campaign Setup')).toBeInTheDocument();
  });
});
