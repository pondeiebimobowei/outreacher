import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiClient, ApiError } from '../../api/client';
import { Route as CompaniesRoute } from './companies.index';

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
  createFileRoute: () => (config: Record<string, unknown>) => config,
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: 'comp-1' }),
}));

describe('CompaniesRoute Component', () => {
  const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;
  const mockPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>;

  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  const CompaniesComponent = (CompaniesRoute as unknown as { component: React.ComponentType })
    .component;

  function renderWithProviders(ui: React.ReactNode) {
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  }

  it('renders LoadingState while fetching companies', () => {
    mockGet.mockReturnValue(new Promise(() => {})); // Never resolves

    renderWithProviders(<CompaniesComponent />);

    expect(screen.getByText(/loading target companies/i)).toBeInTheDocument();
  });

  it('renders EmptyState when company list is empty', async () => {
    mockGet.mockResolvedValueOnce([]);

    renderWithProviders(<CompaniesComponent />);

    await waitFor(() => {
      expect(screen.getByText(/no companies added yet/i)).toBeInTheDocument();
    });

    expect(screen.getAllByRole('button', { name: /^add company$/i })[0]).toBeInTheDocument();
  });

  it('renders company cards when companies exist', async () => {
    mockGet.mockResolvedValueOnce([
      {
        id: 'c1',
        workspaceId: 'w1',
        name: 'Acme Corporation',
        normalizedName: 'acme',
        websiteUrl: 'https://acme.com',
        domain: 'acme.com',
        description: 'Building cool things',
        industry: 'Tech',
        location: 'SF',
        linkedinUrl: null,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    renderWithProviders(<CompaniesComponent />);

    await waitFor(() => {
      expect(screen.getByText('Acme Corporation')).toBeInTheDocument();
    });

    expect(screen.getByText('acme.com')).toBeInTheDocument();
    expect(screen.getByText('Building cool things')).toBeInTheDocument();
  });

  it('opens accessible Add Company modal on CTA click and handles successful creation', async () => {
    mockGet.mockResolvedValueOnce([]);
    mockPost.mockResolvedValueOnce({
      id: 'c-new',
      workspaceId: 'w1',
      name: 'Stripe Inc',
      normalizedName: 'stripe',
      websiteUrl: 'https://stripe.com',
      domain: 'stripe.com',
      description: null,
      industry: null,
      location: null,
      linkedinUrl: null,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    renderWithProviders(<CompaniesComponent />);

    await waitFor(() => {
      expect(screen.getByText(/no companies added yet/i)).toBeInTheDocument();
    });

    // Click Add Company
    fireEvent.click(screen.getAllByRole('button', { name: /^add company$/i })[0]);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    // Fill form using placeholder text
    fireEvent.change(screen.getByPlaceholderText('e.g. Acme Corporation'), {
      target: { value: 'Stripe Inc' },
    });
    fireEvent.change(screen.getByPlaceholderText('https://www.acme.com'), {
      target: { value: 'https://stripe.com' },
    });

    // Submit using modal submit button
    const modalSubmitBtn = screen.getAllByRole('button', { name: /^add company$/i }).slice(-1)[0];
    fireEvent.click(modalSubmitBtn);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/companies', {
        name: 'Stripe Inc',
        websiteUrl: 'https://stripe.com',
        industry: null,
        location: null,
        description: null,
      });
    });

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/companies/$id',
      params: { id: 'c-new' },
    });
  });

  it('handles 409 duplicate response and provides View Existing Company recovery link', async () => {
    mockGet.mockResolvedValueOnce([]);
    mockPost.mockRejectedValueOnce(
      new ApiError(409, {
        statusCode: 409,
        code: 'COMPANY_DUPLICATE_NAME',
        message: 'A company with this name already exists in your workspace.',
        existingCompanyId: 'existing-c-id',
      }),
    );

    renderWithProviders(<CompaniesComponent />);

    await waitFor(() => {
      expect(screen.getByText(/no companies added yet/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole('button', { name: /^add company$/i })[0]);

    fireEvent.change(screen.getByPlaceholderText('e.g. Acme Corporation'), {
      target: { value: 'Acme Corp' },
    });

    const modalSubmitBtn = screen.getAllByRole('button', { name: /^add company$/i }).slice(-1)[0];
    fireEvent.click(modalSubmitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByText(/already exists in your workspace/i)).toBeInTheDocument();

    const recoveryBtn = screen.getByRole('button', {
      name: /view existing company/i,
    });
    expect(recoveryBtn).toBeInTheDocument();

    fireEvent.click(recoveryBtn);

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/companies/$id',
      params: { id: 'existing-c-id' },
    });
  });
});
