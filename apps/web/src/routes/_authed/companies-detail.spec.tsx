import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiClient, ApiError } from '../../api/client';
import { Route as CompanyDetailRoute } from './companies.$id';

const mockNavigate = jest.fn();

jest.mock('../../api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
  ApiError: jest.requireActual('../../api/client').ApiError,
}));

jest.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => {
    const res = typeof config === 'object' && config !== null ? { ...config } : (config as object);
    (res as Record<string, unknown>).useParams = () => ({ id: 'comp-100' });
    return res;
  },
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: 'comp-100' }),
}));

describe('CompanyDetailRoute Component - UX-006 Research Workspace Redesign', () => {
  const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;
  const mockPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>;

  let queryClient: QueryClient;

  const mockCompany = {
    id: 'comp-100',
    workspaceId: 'ws-1',
    name: 'Acme Research Corp',
    normalizedName: 'acme research',
    websiteUrl: 'https://acme.com',
    domain: 'acme.com',
    description: 'Tech company',
    industry: 'Technology',
    location: 'SF',
    linkedinUrl: null,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockProfile = {
    id: 'prof-1',
    workspaceId: 'ws-1',
    targetRoles: ['Backend Engineer', 'Engineering Manager'],
    targetIndustries: ['Technology'],
    targetLocations: ['Remote'],
    skills: ['TypeScript', 'NestJS'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  const Component = (CompanyDetailRoute as unknown as { component: React.ComponentType }).component;

  function renderWithProviders(ui: React.ReactNode) {
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  }

  it('renders NOT_STARTED research status and Start Research CTA', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/companies/comp-100') return mockCompany;
      if (url === '/profile') return mockProfile;
      if (url === '/companies/comp-100/research') {
        return {
          run: null,
          opportunities: [],
          evidence: [],
          status: 'NOT_STARTED',
          jobStatus: null,
          mock: true,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    renderWithProviders(<Component />);

    await waitFor(() => {
      expect(screen.getByText('Acme Research Corp')).toBeInTheDocument();
    });

    expect(screen.getByText('NOT_STARTED')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^start research$/i })).toBeInTheDocument();
  });

  it('triggers startCompanyResearch on CTA click', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/companies/comp-100') return mockCompany;
      if (url === '/profile') return mockProfile;
      if (url === '/companies/comp-100/research') {
        return {
          run: null,
          opportunities: [],
          evidence: [],
          status: 'NOT_STARTED',
          jobStatus: null,
          mock: true,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    mockPost.mockResolvedValueOnce({
      researchRun: { id: 'run-1', status: 'QUEUED' },
      reused: false,
    });

    renderWithProviders(<Component />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^start research$/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^start research$/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/companies/comp-100/research', {});
    });
  });

  it('renders COMPLETED research state with decision hierarchy, evidence toggle, profile fit, and next-step preview CTA', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/companies/comp-100') return mockCompany;
      if (url === '/profile') return mockProfile;
      if (url === '/companies/comp-100/research') {
        return {
          run: {
            id: 'run-1',
            status: 'COMPLETED',
            summary: 'Active growth company in cloud infrastructure.',
            keyFindings: ['Expanding engineering team in SF'],
            completedAt: new Date().toISOString(),
          },
          opportunities: [
            {
              id: 'opp-1',
              roleTitle: 'Staff Backend Engineer',
              opportunityType: 'CONFIRMED',
              openingSourceUrl: 'https://acme.com/jobs/1',
            },
          ],
          evidence: [
            {
              id: 'ev-1',
              claim: 'Uses NestJS & PostgreSQL',
              classification: 'FACT',
              sourceName: 'Careers Page',
              sourceUrl: 'https://acme.com/tech',
              sourceExcerpt: 'Rebuilding core backend with NestJS and Postgres.',
              confidence: 0.95,
            },
          ],
          status: 'COMPLETED',
          jobStatus: null,
          mock: true,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    renderWithProviders(<Component />);

    await waitFor(() => {
      expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    });

    expect(screen.getByText('Mock Data Provider')).toBeInTheDocument();
    expect(screen.getByText('Staff Backend Engineer')).toBeInTheDocument();
    expect(screen.getByText('CONFIRMED')).toBeInTheDocument();
    expect(screen.getByText('Uses NestJS & PostgreSQL')).toBeInTheDocument();
    expect(screen.getByText('FACT')).toBeInTheDocument();

    // Target Role Fit section checks
    expect(screen.getByText(/Target Roles Matched/i)).toBeInTheDocument();

    // Next step preview CTA check
    expect(screen.getByRole('button', { name: /discover contacts/i })).toBeDisabled();

    // Toggle evidence detail expansion
    const toggleBtn = screen.getByRole('button', { name: /view evidence/i });
    expect(toggleBtn).toBeInTheDocument();
    expect(screen.queryByText(/"Rebuilding core backend with NestJS and Postgres."/i)).not.toBeInTheDocument();

    fireEvent.click(toggleBtn);

    expect(screen.getByText(/"Rebuilding core backend with NestJS and Postgres."/i)).toBeInTheDocument();
  });

  it('renders REFRESHING IN BACKGROUND status while preserving existing research on screen', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/companies/comp-100') return mockCompany;
      if (url === '/profile') return mockProfile;
      if (url === '/companies/comp-100/research') {
        return {
          run: {
            id: 'run-1',
            status: 'RUNNING',
            summary: 'Existing research summary preserved during refresh.',
          },
          opportunities: [
            {
              id: 'opp-1',
              roleTitle: 'Existing Opportunity Title',
              opportunityType: 'CONFIRMED',
            },
          ],
          evidence: [],
          status: 'RUNNING',
          jobStatus: null,
          mock: true,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    renderWithProviders(<Component />);

    await waitFor(() => {
      expect(screen.getByText('REFRESHING IN BACKGROUND')).toBeInTheDocument();
    });

    // Existing findings preserved on screen
    expect(screen.getByText('Existing research summary preserved during refresh.')).toBeInTheDocument();
    expect(screen.getByText('Existing Opportunity Title')).toBeInTheDocument();
  });

  it('displays rate limit error alert when forced refresh returns 429', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/companies/comp-100') return mockCompany;
      if (url === '/profile') return mockProfile;
      if (url === '/companies/comp-100/research') {
        return {
          run: { id: 'run-1', status: 'COMPLETED' },
          opportunities: [],
          evidence: [],
          status: 'COMPLETED',
          jobStatus: null,
          mock: true,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    mockPost.mockRejectedValueOnce(
      new ApiError(429, {
        statusCode: 429,
        code: 'RATE_LIMITED',
        message: 'Maximum 3 forced refreshes per company per 24 hours reached.',
      }),
    );

    renderWithProviders(<Component />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^force refresh$/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^force refresh$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByText(/Maximum 3 forced refreshes per company per 24 hours reached/i)).toBeInTheDocument();
  });
});
