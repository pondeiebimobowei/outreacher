import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route } from './onboarding';
import { useAuth } from '../lib/auth-context';
import { apiClient } from '../api/client';

const mockNavigate = jest.fn();

jest.mock('../lib/auth-context', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../api/client', () => ({
  apiClient: {
    get: jest.fn(),
    patch: jest.fn(),
  },
}));

jest.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
  useNavigate: () => mockNavigate,
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate-mock" data-to={to} />,
}));

describe('OnboardingComponent', () => {
  const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
  const mockPatch = apiClient.patch as jest.MockedFunction<typeof apiClient.patch>;
  const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;

  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      user: { id: 'u1', email: 'alex@example.com', firstName: 'Alex', lastName: 'Smith' },
      workspace: { id: 'w1', name: "Alex's Workspace" },
      isLoading: false,
      error: null,
      login: jest.fn(),
      signup: jest.fn(),
      logout: jest.fn(),
      refetchAuth: jest.fn(),
      retryBootstrap: jest.fn(),
    });

    mockGet.mockResolvedValue(null);
  });

  const OnboardingComponent = (Route as unknown as { component: React.ComponentType }).component;

  function renderOnboarding() {
    return render(
      <QueryClientProvider client={queryClient}>
        <OnboardingComponent />
      </QueryClientProvider>,
    );
  }

  it('redirects to /login if user is unauthenticated', () => {
    mockUseAuth.mockReturnValueOnce({
      status: 'unauthenticated',
      user: null,
      workspace: null,
      isLoading: false,
      error: null,
      login: jest.fn(),
      signup: jest.fn(),
      logout: jest.fn(),
      refetchAuth: jest.fn(),
      retryBootstrap: jest.fn(),
    });

    renderOnboarding();
    const nav = screen.getByTestId('navigate-mock');
    expect(nav).toHaveAttribute('data-to', '/login');
  });

  it('renders Step 1 (Role & Direction) by default', async () => {
    renderOnboarding();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /role & direction/i })).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/professional headline/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/target roles/i)).toBeInTheDocument();
  });

  it('validates Step 1 and blocks progression if required fields are empty', async () => {
    renderOnboarding();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /role & direction/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(screen.getByText(/professional headline is required/i)).toBeInTheDocument();
    expect(screen.getByText(/please add at least one target role/i)).toBeInTheDocument();
  });

  it('navigates through all 4 steps and submits PATCH /profile on completion', async () => {
    mockPatch.mockResolvedValueOnce({ success: true });

    renderOnboarding();

    // Step 1: Role & Direction
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /role & direction/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/professional headline/i), {
      target: { value: 'Staff Product Engineer' },
    });

    const roleInput = screen.getByLabelText(/target roles/i);
    fireEvent.change(roleInput, { target: { value: 'Staff Engineer' } });
    fireEvent.keyDown(roleInput, { key: 'Enter', code: 'Enter' });

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    // Step 2: Core Skills
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /core skills/i })).toBeInTheDocument();
    });

    const skillInput = screen.getByLabelText(/core skills/i);
    fireEvent.change(skillInput, { target: { value: 'React' } });
    fireEvent.keyDown(skillInput, { key: 'Enter', code: 'Enter' });

    // Click quick-add chip for TypeScript
    const tsChip = screen.getByRole('button', { name: /\+ typescript/i });
    fireEvent.click(tsChip);

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    // Step 3: Professional Summary
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /professional summary/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/professional summary/i), {
      target: { value: 'Passionate engineer with extensive frontend architecture experience.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    // Step 4: Presence & Links
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /presence & links/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/linkedin url/i), {
      target: { value: 'https://linkedin.com/in/alexsmith' },
    });

    const submitBtn = screen.getByRole('button', { name: /complete profile/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/profile', {
        headline: 'Staff Product Engineer',
        targetRoles: ['Staff Engineer'],
        skills: ['React', 'TypeScript'],
        summary: 'Passionate engineer with extensive frontend architecture experience.',
        linkedinUrl: 'https://linkedin.com/in/alexsmith',
        githubUrl: null,
        portfolioUrl: null,
        backgroundAndPositioning: null,
        careerGoals: null,
        currentRole: null,
        experienceSummary: null,
        targetIndustries: [],
        targetLocations: [],
        websiteUrl: null,
        yearsExperience: null,
      });
    });

    // Celebration screen
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /you're all set, alex/i })).toBeInTheDocument();
    });

    // Enter Outreacher button
    const enterBtn = screen.getByRole('button', { name: /enter outreacher/i });
    fireEvent.click(enterBtn);
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/dashboard' });
  });

  it('allows clicking Skip for now to navigate to / without mutating', async () => {
    renderOnboarding();

    await waitFor(() => {
      expect(screen.getByText(/skip for now/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/skip for now/i));
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/' });
    expect(mockPatch).not.toHaveBeenCalled();
  });
});
