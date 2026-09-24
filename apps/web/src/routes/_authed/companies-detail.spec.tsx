import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../../api/client';
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
    targetRoles: ['Backend Engineer'],
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
          run: null, opportunities: [], evidence: [], status: 'NOT_STARTED', jobStatus: null, mock: true,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    renderWithProviders(<Component />);

    await waitFor(() => {
      expect(screen.getByText('Acme Research Corp')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Technology')[0]).toBeInTheDocument();
    expect(screen.getAllByText('San Francisco, CA')[0]).toBeInTheDocument(); // Removing the bullet '•' which was in old UI
    expect(screen.getAllByText('Tech company specializing in distributed systems.')[0]).toBeInTheDocument();
  });

  it('renders NOT_STARTED research status and Start Research CTA', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/companies/comp-100') return mockCompany;
      if (url === '/profile') return mockProfileWithRoles;
      if (url === '/companies/comp-100/research') {
        return {
          run: null, opportunities: [], evidence: [], status: 'NOT_STARTED', jobStatus: null, mock: true,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    renderWithProviders(<Component />);

    await waitFor(() => {
      expect(screen.getByText('Acme Research Corp')).toBeInTheDocument();
    });

    // Overview tab is active by default. It shows a primary CTA based on NOT_STARTED
    expect(screen.getByText(/Research this company/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /start research/i })[0]).toBeInTheDocument();
  });

  it('renders QUEUED state with descriptive banner on first run in Research Tab', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/companies/comp-100') return mockCompany;
      if (url === '/profile') return mockProfileWithRoles;
      if (url === '/companies/comp-100/research') {
        return {
          run: null, opportunities: [], evidence: [], status: 'QUEUED', jobStatus: null, mock: true,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    renderWithProviders(<Component />);

    await waitFor(() => {
      expect(screen.getByText('Acme Research Corp')).toBeInTheDocument();
    });

    // Click Research tab
    fireEvent.click(screen.getByText('Research'));

    await waitFor(() => {
      expect(screen.getByText(/Gathering intelligence about Acme Research Corp/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Running\.\.\./i)).toBeInTheDocument();
  });

  it('renders RUNNING state with descriptive banner on first run', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/companies/comp-100') return mockCompany;
      if (url === '/profile') return mockProfileWithRoles;
      if (url === '/companies/comp-100/research') {
        return {
          run: null, opportunities: [], evidence: [], status: 'RUNNING', jobStatus: null, mock: true,
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    renderWithProviders(<Component />);

    await waitFor(() => {
      expect(screen.getByText('Acme Research Corp')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Research'));

    await waitFor(() => {
      expect(screen.getByText(/Gathering intelligence about Acme Research Corp/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Running\.\.\./i)).toBeInTheDocument();
  });

  it('triggers startCompanyResearch on CTA click', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/companies/comp-100') return mockCompany;
      if (url === '/profile') return mockProfileWithRoles;
      if (url === '/companies/comp-100/research') {
        return {
          run: null, opportunities: [], evidence: [], status: 'NOT_STARTED', jobStatus: null, mock: true,
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
      expect(screen.getAllByRole('button', { name: /start research/i })[0]).toBeInTheDocument();
    });

    // First go to the research tab
    fireEvent.click(screen.getByText('Research', { selector: 'button' }));
    
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /start research/i })[0]).toBeInTheDocument();
    });

    // Then click the actual mutation trigger
    fireEvent.click(screen.getAllByRole('button', { name: /start research/i })[1]);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/companies/comp-100/research', {});
    });
  });

  it('renders COMPLETED research state with executive summary and key findings', async () => {
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
              status: 'ACTIVE',
              opportunityType: 'CONFIRMED',
              openingSourceUrl: 'https://acme.com/jobs/1',
            },
          ],
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
      expect(screen.getByText('Acme Research Corp')).toBeInTheDocument();
    });

    // Check Overview tab state
    expect(screen.getByText(/Find relevant contacts/i)).toBeInTheDocument();
    
    fireEvent.click(screen.getByText('Research'));

    await waitFor(() => {
      expect(screen.getByText('Active growth company in cloud infrastructure.')).toBeInTheDocument();
    });

    expect(screen.getByText('Expanding engineering team in SF')).toBeInTheDocument();
    
    // Opportunities are now in their own tab
    fireEvent.click(screen.getByText('Opportunities'));
    
    await waitFor(() => {
      expect(screen.getByText('Staff Backend Engineer')).toBeInTheDocument();
    });
  });

});
