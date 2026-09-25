import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Route as HomeRoute } from '../../routes/_authed/dashboard';
import { apiClient } from '../../api/client';
import { WorkspaceSummaryDto } from './home.types';

jest.mock('../../api/client', () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

jest.mock('../../lib/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'u-1', email: 'test@example.com', name: 'Jordan Lee' },
    workspace: { id: 'ws-1', name: 'Acme Workspace' },
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

describe('Home / Workspace Structural Accessibility Home / Workspace Accessibility & Responsive Contracts Design Token Contract', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
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

  const sampleSummary: WorkspaceSummaryDto = {
    workspace: { id: 'ws-1' },
    workItems: [
      {
        id: 'w-1',
        kind: 'OUTREACH_REVIEW',
        company: { id: 'c-1', name: 'Stripe' },
        campaign: { id: 'camp-1', name: 'Leadership Sprint', status: 'ACTIVE' },
        source: { domain: 'OUTREACH', state: 'PENDING' },
        destination: { type: 'CONTACT_REVIEW' },
      },
      {
        id: 'w-2',
        kind: 'RESEARCH_INCOMPLETE',
        company: { id: 'c-2', name: 'Figma' },
        source: { domain: 'RESEARCH', state: 'RUNNING' },
        destination: { type: 'COMPANY' },
      },
    ],
    recentActivity: [
      {
        id: 'act-1',
        sourceType: 'RESEARCH_RUN',
        sourceId: 'rr-1',
        type: 'RESEARCH_COMPLETED',
        company: { id: 'c-1', name: 'Stripe' },
        occurredAt: new Date().toISOString(),
      },
    ],
    degradedSources: [{ source: 'WORK_SEND_FAILURE', code: 'PARTIAL_DATA_UNAVAILABLE' }],
    generatedAt: new Date().toISOString(),
  };

  it('preserves strict semantic heading hierarchy (h1 -> h2 -> h3)', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce(sampleSummary);
    renderHome();

    // Wait for loaded content
    await screen.findByRole('heading', { level: 2, name: 'Needs Attention' });

    // h1: Page / User Greeting
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent(/Jordan Lee/);

    // h2s: Section Headings
    const h2s = screen.getAllByRole('heading', { level: 2 });
    const h2Texts = h2s.map((h) => h.textContent?.trim());
    expect(h2Texts).toContain('Needs Attention');
    expect(h2Texts).toContain('Research a company');
    expect(h2Texts).toContain('Continue Working');
    expect(h2Texts).toContain('Recent Activity');

    // h3s: Item Titles
    const h3s = screen.getAllByRole('heading', { level: 3 });
    const h3Texts = h3s.map((h) => h.textContent?.trim());
    expect(h3Texts).toContain('Outreach Review');
    expect(h3Texts).toContain('Figma');
    expect(h3Texts).toContain('Research Completed');
  });

  it('ensures all interactive touch targets meet the minimum 44px requirement', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce(sampleSummary);
    renderHome();

    await screen.findByRole('heading', { level: 2, name: 'Needs Attention' });

    const interactiveLinks = screen.getAllByRole('link');
    expect(interactiveLinks.length).toBeGreaterThanOrEqual(3);

    for (const link of interactiveLinks) {
      expect(link.className).toContain('min-h-11');
    }
  });

  it('ensures all interactive elements have visible focus ring classes', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce(sampleSummary);
    renderHome();

    await screen.findByRole('heading', { level: 2, name: 'Needs Attention' });

    const interactiveLinks = screen.getAllByRole('link');
    for (const link of interactiveLinks) {
      expect(link.className).toContain('focus-visible:outline-2');
      expect(link.className).toContain('focus-visible:outline-offset-2');
      expect(link.className).toContain('focus-visible:outline-slate-900');
    }
  });

  it('provides accessible status attributes for degraded states', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce(sampleSummary);
    renderHome();

    await screen.findByRole('heading', { level: 2, name: 'Needs Attention' });

    const statusNotices = screen.getAllByRole('status');
    expect(statusNotices.length).toBeGreaterThanOrEqual(1);
    expect(statusNotices[0]).toHaveTextContent(/temporarily unavailable/i);
  });
});
