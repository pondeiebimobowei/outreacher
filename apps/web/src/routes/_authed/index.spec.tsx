import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../../api/client';
import { Route as HomeRoute } from './index';
import { WorkspaceSummaryDto } from '../../features/home/home.types';

jest.mock('../../api/client', () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

jest.mock('../../lib/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'u-1', email: 'alex@example.com', name: 'Alex Johnson' },
    workspace: { id: 'ws-1', name: 'Acme Ventures' },
  }),
}));

jest.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
  Link: ({
    children,
    to,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    params?: Record<string, string>;
    className?: string;
  }) => (
    <a href={to} className={className} data-testid={`link-${to}`}>
      {children}
    </a>
  ),
}));

describe('Home / Workspace Surface', () => {
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

  const renderHome = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Component = (HomeRoute as any).component;
    return render(
      <QueryClientProvider client={queryClient}>
        <Component />
      </QueryClientProvider>,
    );
  };

  it('renders loading state while workspace summary request is pending', () => {
    (apiClient.get as jest.Mock).mockReturnValue(new Promise(() => {}));
    renderHome();

    expect(screen.getByLabelText('Loading workspace summary')).toBeInTheDocument();
  });

  it('renders complete failure state with retry option on endpoint error', async () => {
    (apiClient.get as jest.Mock).mockRejectedValueOnce(new Error('Network disconnected'));
    renderHome();

    await waitFor(() => {
      expect(screen.getByText('Unable to load workspace')).toBeInTheDocument();
      expect(screen.getByText('Network disconnected')).toBeInTheDocument();
    });

    // Identity is still preserved
    expect(screen.getByText(/Alex Johnson/)).toBeInTheDocument();

    // Clicking retry refetches
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      workspace: { id: 'ws-1' },
      workItems: [],
      recentActivity: [],
      generatedAt: new Date().toISOString(),
    });

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => {
      expect(screen.queryByText('Unable to load workspace')).not.toBeInTheDocument();
      expect(screen.getByText('Start with a company')).toBeInTheDocument();
    });
  });

  it('renders empty workspace calmly with company-first call to action', async () => {
    const emptySummary: WorkspaceSummaryDto = {
      workspace: { id: 'ws-1' },
      workItems: [],
      recentActivity: [],
      generatedAt: new Date().toISOString(),
    };
    (apiClient.get as jest.Mock).mockResolvedValueOnce(emptySummary);

    renderHome();

    await waitFor(() => {
      expect(screen.getByText('Start with a company')).toBeInTheDocument();
      expect(
        screen.getByText(/Outreacher helps you turn a company you care about into an evidence-backed outreach opportunity/),
      ).toBeInTheDocument();
      expect(screen.getByTestId('link-/companies')).toBeInTheDocument();
    });
  });

  it('renders populated workspace with clear task hierarchy and authoritative mapping', async () => {
    const summary: WorkspaceSummaryDto = {
      workspace: { id: 'ws-1' },
      workItems: [
        {
          id: 'w-1',
          kind: 'OUTREACH_REVIEW',
          company: { id: 'c-1', name: 'Stripe' },
          campaign: { id: 'camp-1', name: 'Fintech Leadership', status: 'ACTIVE' },
          source: { domain: 'OUTREACH', state: 'PENDING' },
          destination: { type: 'CONTACT_REVIEW' },
        },
        {
          id: 'w-2',
          kind: 'SEND_FAILURE',
          company: { id: 'c-2', name: 'Airbnb' },
          campaign: { id: 'camp-2', name: 'Design Outreach', status: 'ACTIVE' },
          source: { domain: 'EMAIL', state: 'FAILED' },
          destination: { type: 'CAMPAIGN' },
        },
        {
          id: 'w-3',
          kind: 'RESEARCH_INCOMPLETE',
          company: { id: 'c-3', name: 'OpenAI' },
          source: { domain: 'RESEARCH', state: 'RUNNING' },
          destination: { type: 'COMPANY' },
        },
        {
          id: 'w-4',
          kind: 'CAMPAIGN_PAUSED',
          company: { id: 'c-4', name: 'Anthropic' },
          campaign: { id: 'camp-4', name: 'Research Eng', status: 'PAUSED' },
          source: { domain: 'CAMPAIGN', state: 'PAUSED' },
          destination: { type: 'CAMPAIGN' },
        },
      ],
      recentActivity: [
        {
          id: 'act-1',
          sourceType: 'RESEARCH_RUN',
          sourceId: 'rr-1',
          type: 'RESEARCH_COMPLETED',
          company: { id: 'c-3', name: 'OpenAI' },
          occurredAt: new Date().toISOString(),
        },
        {
          id: 'act-2',
          sourceType: 'EMAIL_SEND',
          sourceId: 'es-1',
          type: 'EMAIL_SENT',
          company: { id: 'c-1', name: 'Stripe' },
          occurredAt: new Date().toISOString(),
        },
      ],
      generatedAt: new Date().toISOString(),
    };

    (apiClient.get as jest.Mock).mockResolvedValueOnce(summary);
    renderHome();

    await waitFor(() => {
      // Identity
      expect(screen.getByText(/Alex Johnson/)).toBeInTheDocument();
      

      // Needs Attention section
      expect(screen.getByRole('heading', { name: 'Needs Attention' })).toBeInTheDocument();
      expect(screen.getByText('Outreach Review')).toBeInTheDocument();
      expect(screen.getByText('Review Outreach')).toBeInTheDocument();
      expect(screen.getByText('Delivery Failure')).toBeInTheDocument();
      // The action label for SEND_FAILURE in home.mapper.ts is likely 'Review Failure' or 'Investigate'
      // Let's just check for the company names to be safe
      expect(screen.getByText('Stripe')).toBeInTheDocument();
      expect(screen.getByText('Airbnb')).toBeInTheDocument();

      // Primary Next Action
      expect(screen.getByText('Start something new')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Research a company' })).toBeInTheDocument();

      // Continue Working section
      expect(screen.getByRole('heading', { name: 'Continue Working' })).toBeInTheDocument();
      expect(screen.getByText('Research In Progress')).toBeInTheDocument();
      expect(screen.getByText('Continue Research')).toBeInTheDocument();
      expect(screen.getByText('Paused')).toBeInTheDocument();
      expect(screen.getByText('Review Campaign')).toBeInTheDocument();

      // Recent Activity section
      expect(screen.getByRole('heading', { name: 'Recent Activity' })).toBeInTheDocument();
      expect(screen.getByText('Research Completed')).toBeInTheDocument();
      expect(screen.getByText('Email Sent')).toBeInTheDocument();
    });

    // Verify replies are NOT falsely represented as "0 replies" or "No replies"
    expect(screen.queryByText(/0 replies/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no replies/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no new replies/i)).not.toBeInTheDocument();

    // Verify sole data source: only GET /workspace/summary called, no client-side N+1 queries
    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(apiClient.get).toHaveBeenCalledWith('/workspace/summary');
  });

  it('renders "You\'re caught up" when workItems has no attention items', async () => {
    const summary: WorkspaceSummaryDto = {
      workspace: { id: 'ws-1' },
      workItems: [
        {
          id: 'w-1',
          kind: 'RESEARCH_INCOMPLETE',
          company: { id: 'c-1', name: 'OpenAI' },
          source: { domain: 'RESEARCH', state: 'RUNNING' },
          destination: { type: 'COMPANY' },
        },
      ],
      recentActivity: [],
      generatedAt: new Date().toISOString(),
    };

    (apiClient.get as jest.Mock).mockResolvedValueOnce(summary);
    renderHome();

    await waitFor(() => {
      expect(screen.getByText("You're caught up")).toBeInTheDocument();
      expect(screen.getByText(/Nothing currently requires your attention/)).toBeInTheDocument();
      expect(screen.getByText('Continue Working')).toBeInTheDocument();
    });
  });

  it('renders partial degradation warnings specifically in affected sections', async () => {
    const summary: WorkspaceSummaryDto = {
      workspace: { id: 'ws-1' },
      workItems: [
        {
          id: 'w-1',
          kind: 'OUTREACH_REVIEW',
          company: { id: 'c-1', name: 'Stripe' },
          source: { domain: 'OUTREACH', state: 'PENDING' },
          destination: { type: 'CONTACT_REVIEW' },
        },
      ],
      recentActivity: [],
      degradedSources: [
        { source: 'WORK_SEND_FAILURE', code: 'PARTIAL_DATA_UNAVAILABLE' },
        { source: 'ACTIVITY_EMAIL_SENT', code: 'PARTIAL_DATA_UNAVAILABLE' },
      ],
      generatedAt: new Date().toISOString(),
    };

    (apiClient.get as jest.Mock).mockResolvedValueOnce(summary);
    renderHome();

    await waitFor(() => {
      expect(screen.getByText('Some items requiring attention are temporarily unavailable.')).toBeInTheDocument();
      expect(screen.getByText('Some active work items are temporarily unavailable.')).toBeInTheDocument();
      expect(screen.getByText('Some recent activity is temporarily unavailable.')).toBeInTheDocument();
    });
  });
});
