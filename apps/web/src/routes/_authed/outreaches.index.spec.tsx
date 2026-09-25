import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../../api/client';
import { Route as OutreachesRoute } from './outreaches.index';
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
    name: 'Q3 Enterprise Expansion',
    status: 'ACTIVE',
    
    senders: [{ assignmentStatus: 'ACTIVE', senderAccountId: 'acc-1', fromName: 'Sarah', fromEmail: 'sarah@outreach.acme.com', senderStatus: 'ACTIVE', integrationStatus: 'ACTIVE' }],
    followUpDelayBusinessDays: 3,
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
    name: 'Mid-Market Inbound',
    status: 'DRAFT',
    senders: [],
    followUpDelayBusinessDays: 0,
    createdAt: '2026-09-03T10:00:00Z',
    updatedAt: '2026-09-04T10:00:00Z',
  },
  {
    id: 'camp-3',
    workspaceId: 'ws-1',
    companyId: 'comp-3',
    senderAccountId: 'acc-1',
    templateId: 'tpl-1',
    normalizedName: 'norm-name',
    name: 'Archived Initiative',
    status: 'COMPLETED',
    senders: [],
    followUpDelayBusinessDays: 5,
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-15T10:00:00Z',
  },
];

describe('OutreachesIndexComponent', () => {
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
    const Component = (OutreachesRoute as unknown as { component: React.ComponentType }).component;
    return render(
      <QueryClientProvider client={queryClient}>
        <Component />
      </QueryClientProvider>
    );
  }

  it('renders the header and campaign-driven explanation banner', async () => {
    mockGet.mockResolvedValueOnce(mockCampaigns);
    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Outreaches' })).toBeInTheDocument();
    });

    expect(screen.getByText('Campaign-Driven Outreach')).toBeInTheDocument();
    expect(
      screen.getByText(/Outreaches are prepared, reviewed, and dispatched through campaigns/i)
    ).toBeInTheDocument();
  });

  it('renders campaign cards with status badges and links to campaign review', async () => {
    mockGet.mockResolvedValueOnce(mockCampaigns);
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Q3 Enterprise Expansion')).toBeInTheDocument();
    });

    expect(screen.getByText('Mid-Market Inbound')).toBeInTheDocument();
    expect(screen.getByText('Archived Initiative')).toBeInTheDocument();
    expect(screen.getByText('sarah@outreach.acme.com')).toBeInTheDocument();
    expect(screen.getByText('Follow-up delay: 3 business days')).toBeInTheDocument();

    const reviewLinks = screen.getAllByRole('link', { name: /Review Outreaches/i });
    expect(reviewLinks).toHaveLength(3);
    expect(reviewLinks[0]).toHaveAttribute('href', '/campaigns/camp-1/review');
  });

  it('renders empty state when no campaigns exist', async () => {
    mockGet.mockResolvedValueOnce([]);
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('No outreach campaigns yet')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Create a campaign and add contacts to start drafting and sending/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Go to Campaigns/i })).toHaveAttribute(
      'href',
      '/campaigns'
    );
  });

  it('filters campaigns by search input', async () => {
    mockGet.mockResolvedValueOnce(mockCampaigns);
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Q3 Enterprise Expansion')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search campaigns by name or sender...');
    fireEvent.change(searchInput, { target: { value: 'Enterprise' } });

    expect(screen.getByText('Q3 Enterprise Expansion')).toBeInTheDocument();
    expect(screen.queryByText('Mid-Market Inbound')).not.toBeInTheDocument();
    expect(screen.queryByText('Archived Initiative')).not.toBeInTheDocument();
  });

  it('filters campaigns by status pill', async () => {
    mockGet.mockResolvedValueOnce(mockCampaigns);
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Q3 Enterprise Expansion')).toBeInTheDocument();
    });

    const draftPill = screen.getByRole('button', { name: /Draft/i });
    fireEvent.click(draftPill);

    expect(screen.queryByText('Q3 Enterprise Expansion')).not.toBeInTheDocument();
    expect(screen.getByText('Mid-Market Inbound')).toBeInTheDocument();
    expect(screen.queryByText('Archived Initiative')).not.toBeInTheDocument();
  });
});
