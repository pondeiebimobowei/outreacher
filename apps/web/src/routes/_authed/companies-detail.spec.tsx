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
    description: 'Tech company specializing in distributed systems.',
    industry: 'Technology',
    location: 'San Francisco, CA',
    linkedinUrl: null,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockProfileWithRoles = {
    id: 'prof-1',
    workspaceId: 'ws-1',
    targetRoles: ['Backend Engineer', 'Engineering Manager'],
    targetIndustries: ['Technology'],
    targetLocations: ['Remote'],
    skills: ['TypeScript', 'NestJS'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockProfileNoRoles = {
    id: 'prof-1',
    workspaceId: 'ws-1',
    targetRoles: [],
    targetIndustries: ['Technology'],
    targetLocations: ['Remote'],
    skills: ['TypeScript'],
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

  it('renders company identity header metadata including industry, location, and description', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/companies/comp-100') return mockCompany;
      if (url === '/profile') return mockProfileWithRoles;
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
      if (url === '/companies/comp-100/contacts') {
        return {
          companyId: 'comp-100',
          status: 'NOT_STARTED',
          selectedContactId: null,
          contacts: [],
          discoveryJob: null,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    renderWithProviders(<Component />);

    await waitFor(() => {
      expect(screen.getByText('Acme Research Corp')).toBeInTheDocument();
    });

    expect(screen.getByText('Technology')).toBeInTheDocument();
    expect(screen.getByText('• San Francisco, CA')).toBeInTheDocument();
    expect(
      screen.getByText('Tech company specializing in distributed systems.'),
    ).toBeInTheDocument();
  });

  it('renders NOT_STARTED research status and Start Research CTA', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/companies/comp-100') return mockCompany;
      if (url === '/profile') return mockProfileWithRoles;
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

  it('renders QUEUED state with disabled Queued button and descriptive banner on first run', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/companies/comp-100') return mockCompany;
      if (url === '/profile') return mockProfileWithRoles;
      if (url === '/companies/comp-100/research') {
        return {
          run: null,
          opportunities: [],
          evidence: [],
          status: 'QUEUED',
          jobStatus: null,
          mock: true,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    renderWithProviders(<Component />);

    await waitFor(() => {
      expect(screen.getByText('QUEUED')).toBeInTheDocument();
    });

    expect(screen.getByText(/Research requested, waiting for worker slot/i)).toBeInTheDocument();
    const queuedBtn = screen.getByRole('button', { name: /^queued$/i });
    expect(queuedBtn).toBeDisabled();
  });

  it('renders RUNNING state with disabled Researching... button and descriptive banner on first run', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/companies/comp-100') return mockCompany;
      if (url === '/profile') return mockProfileWithRoles;
      if (url === '/companies/comp-100/research') {
        return {
          run: null,
          opportunities: [],
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
      expect(screen.getByText('RUNNING')).toBeInTheDocument();
    });

    expect(screen.getByText(/Analyzing company website and openings/i)).toBeInTheDocument();
    const researchingBtn = screen.getByRole('button', { name: /^researching\.\.\.$/i });
    expect(researchingBtn).toBeDisabled();
  });

  it('triggers startCompanyResearch on CTA click', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/companies/comp-100') return mockCompany;
      if (url === '/profile') return mockProfileWithRoles;
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

  it('renders COMPLETED research state with decision hierarchy, evidence toggle, evidence badges, profile fit, and next-step preview CTA', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/companies/comp-100') return mockCompany;
      if (url === '/profile') return mockProfileWithRoles;
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
            {
              id: 'ev-2',
              claim: 'Hiring expansion planned',
              classification: 'INFERENCE',
              sourceName: 'Engineering Blog',
              sourceUrl: 'https://acme.com/blog',
              sourceExcerpt: 'Scaling backend team headcount in Q3.',
              confidence: 0.8,
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
    expect(screen.getByText('INFERENCE')).toBeInTheDocument();

    // Target Role Fit section checks
    expect(screen.getByText(/Target Roles Matched/i)).toBeInTheDocument();

    // Contact Discovery & Selection Section check
    expect(
      screen.getByRole('heading', { name: /6\. Contact Discovery & Selection/i }),
    ).toBeInTheDocument();

    // Toggle evidence detail expansion
    const toggleBtns = screen.getAllByRole('button', { name: /view evidence/i });
    expect(toggleBtns.length).toBe(2);
    expect(
      screen.queryByText(/"Rebuilding core backend with NestJS and Postgres."/i),
    ).not.toBeInTheDocument();

    fireEvent.click(toggleBtns[0]);

    expect(
      screen.getByText(/"Rebuilding core backend with NestJS and Postgres."/i),
    ).toBeInTheDocument();
  });

  it('omits Target Role Fit section completely when career profile has no target roles', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/companies/comp-100') return mockCompany;
      if (url === '/profile') return mockProfileNoRoles;
      if (url === '/companies/comp-100/research') {
        return {
          run: {
            id: 'run-1',
            status: 'COMPLETED',
            summary: 'Summary string',
          },
          opportunities: [],
          evidence: [],
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

    expect(screen.queryByText(/Career Profile Alignment/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Target Roles Matched/i)).not.toBeInTheDocument();
  });

  it('renders REFRESHING IN BACKGROUND status while preserving existing research on screen', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/companies/comp-100') return mockCompany;
      if (url === '/profile') return mockProfileWithRoles;
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

    // Disabled Refreshing... button rendered
    expect(screen.getByRole('button', { name: /^refreshing\.\.\.$/i })).toBeDisabled();

    // Existing findings preserved on screen
    expect(
      screen.getByText('Existing research summary preserved during refresh.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Existing Opportunity Title')).toBeInTheDocument();
  });

  it('renders PARTIAL RESULTS state with amber badge', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/companies/comp-100') return mockCompany;
      if (url === '/profile') return mockProfileWithRoles;
      if (url === '/companies/comp-100/research') {
        return {
          run: {
            id: 'run-1',
            status: 'PARTIAL',
            summary: 'Partial summary.',
          },
          opportunities: [],
          evidence: [],
          status: 'PARTIAL',
          jobStatus: null,
          mock: true,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    renderWithProviders(<Component />);

    await waitFor(() => {
      expect(screen.getByText('PARTIAL RESULTS')).toBeInTheDocument();
    });

    expect(screen.getByText(/Research completed with partial findings/i)).toBeInTheDocument();
  });

  it('renders FAILED state with Retry Research CTA', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/companies/comp-100') return mockCompany;
      if (url === '/profile') return mockProfileWithRoles;
      if (url === '/companies/comp-100/research') {
        return {
          run: null,
          opportunities: [],
          evidence: [],
          status: 'FAILED',
          jobStatus: null,
          mock: true,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    renderWithProviders(<Component />);

    await waitFor(() => {
      expect(screen.getByText('FAILED')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /^retry research$/i })).toBeInTheDocument();
  });

  it('displays rate limit error alert when forced refresh returns 429', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/companies/comp-100') return mockCompany;
      if (url === '/profile') return mockProfileWithRoles;
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

    expect(
      screen.getByText(/Maximum 3 forced refreshes per company per 24 hours reached/i),
    ).toBeInTheDocument();
  });

  it('announces discrete ARIA live messages across actual status transitions', async () => {
    let currentResearchState = {
      run: null as unknown,
      opportunities: [] as unknown[],
      evidence: [] as unknown[],
      status: 'QUEUED',
      jobStatus: null,
      mock: true,
    };

    mockGet.mockImplementation(async (url: string) => {
      if (url === '/companies/comp-100') return mockCompany;
      if (url === '/profile') return mockProfileWithRoles;
      if (url === '/companies/comp-100/research') {
        return currentResearchState;
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const { rerender } = renderWithProviders(<Component />);

    await waitFor(() => {
      expect(screen.getByText('QUEUED')).toBeInTheDocument();
    });

    // Transition: QUEUED -> COMPLETED
    currentResearchState = {
      run: { id: 'run-1', status: 'COMPLETED', summary: 'Research completed summary' },
      opportunities: [],
      evidence: [],
      status: 'COMPLETED',
      jobStatus: null,
      mock: true,
    };

    queryClient.invalidateQueries({ queryKey: ['company-research', 'comp-100'] });
    rerender(
      <QueryClientProvider client={queryClient}>
        <Component />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Research completed.')).toBeInTheDocument();
    });

    // Transition: COMPLETED -> REFRESHING (background RUNNING)
    currentResearchState = {
      run: { id: 'run-2', status: 'RUNNING', summary: 'Research completed summary' },
      opportunities: [],
      evidence: [],
      status: 'RUNNING',
      jobStatus: null,
      mock: true,
    };

    queryClient.invalidateQueries({ queryKey: ['company-research', 'comp-100'] });
    rerender(
      <QueryClientProvider client={queryClient}>
        <Component />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Research is being updated.')).toBeInTheDocument();
    });

    // Transition: REFRESHING -> FAILED
    currentResearchState = {
      run: { id: 'run-2', status: 'FAILED' },
      opportunities: [],
      evidence: [],
      status: 'FAILED',
      jobStatus: null,
      mock: true,
    };

    queryClient.invalidateQueries({ queryKey: ['company-research', 'comp-100'] });
    rerender(
      <QueryClientProvider client={queryClient}>
        <Component />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Research failed.')).toBeInTheDocument();
    });
  });
});
