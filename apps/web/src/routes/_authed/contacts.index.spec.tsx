import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { apiClient } from '../../api/client';
import { Route as ContactsRoute } from './contacts.index';
import { CompanyDto } from '../../api/companies';

jest.mock('../../api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
  Link: ({ children, to, params, className }: { children: React.ReactNode; to: string; params?: Record<string, string>; className?: string }) => (
    <a href={`${to}/${params?.id || ''}`} className={className} data-testid={`link-${params?.id || 'target'}`}>
      {children}
    </a>
  ),
}));

const mockCompanies: CompanyDto[] = [
  {
    id: 'comp-1',
    workspaceId: 'ws-1',
    phoneNumber: '08033366674',
    name: 'Stripe Inc',
    normalizedName: 'stripe inc',
    websiteUrl: 'https://stripe.com',
    domain: 'stripe.com',
    description: 'Financial infrastructure',
    industry: 'Fintech',
    location: 'San Francisco, CA',
    linkedinUrl: null,
    status: 'ACTIVE',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-02T10:00:00Z',
  },
  {
    id: 'comp-2',
    workspaceId: 'ws-1',
    phoneNumber: '08044466674',
    name: 'Vercel Inc',
    normalizedName: 'vercel inc',
    websiteUrl: 'https://vercel.com',
    domain: 'vercel.com',
    description: 'Frontend cloud platform',
    industry: 'Cloud',
    location: 'Remote',
    linkedinUrl: null,
    status: 'ACTIVE',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-02T10:00:00Z',
  },
];

describe('ContactsIndex Route Component - Company Contacts Portal', () => {
  const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
  });

  const renderComponent = () => {
    const Component = (ContactsRoute as unknown as { component: React.ComponentType }).component;
    return render(
      <QueryClientProvider client={queryClient}>
        <Component />
      </QueryClientProvider>,
    );
  };

  it('renders heading, info notice, and company cards without faking global contact queries', async () => {
    mockGet.mockResolvedValue(mockCompanies);
    renderComponent();

    expect(await screen.findByRole('heading', { level: 1, name: 'Contacts' })).toBeInTheDocument();
    expect(
      screen.getByText(/Contacts are evaluated and discovered within company workspaces/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Outreacher models contacts per target company to ensure role relevance/i),
    ).toBeInTheDocument();

    expect(await screen.findByText('Stripe Inc')).toBeInTheDocument();
    expect(screen.getByText('Vercel Inc')).toBeInTheDocument();
    expect(screen.getByText('Fintech')).toBeInTheDocument();
    expect(screen.getByText('Cloud')).toBeInTheDocument();

    // Verify only /companies was fetched (no N+1 /contacts fetches)
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith('/companies');
  });

  it('filters companies by search query', async () => {
    mockGet.mockResolvedValue(mockCompanies);
    renderComponent();

    expect(await screen.findByText('Stripe Inc')).toBeInTheDocument();
    expect(screen.getByText('Vercel Inc')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/Search companies by name/i);
    fireEvent.change(searchInput, { target: { value: 'Fintech' } });

    expect(screen.getByText('Stripe Inc')).toBeInTheDocument();
    expect(screen.queryByText('Vercel Inc')).not.toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: 'NonexistentCo' } });
    expect(screen.queryByText('Stripe Inc')).not.toBeInTheDocument();
    expect(screen.getByText('No companies match your search.')).toBeInTheDocument();

    const clearButton = screen.getByRole('button', { name: /Clear search/i });
    fireEvent.click(clearButton);

    expect(screen.getByText('Stripe Inc')).toBeInTheDocument();
    expect(screen.getByText('Vercel Inc')).toBeInTheDocument();
  });

  it('displays empty state when no companies exist', async () => {
    mockGet.mockResolvedValue([]);
    renderComponent();

    expect(await screen.findByText('No contacts found')).toBeInTheDocument();
    expect(
      screen.getByText('Start by adding a target company to evaluate contacts.'),
    ).toBeInTheDocument();
  });
});
