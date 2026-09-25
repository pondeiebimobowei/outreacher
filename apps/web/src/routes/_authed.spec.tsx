import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Route as AuthedRoute } from './_authed';
import { useAuth } from '../lib/auth-context';

jest.mock('../components/states/LoadingState', () => ({
  LoadingState: ({ message }: { message?: string }) => (
    <div data-testid="loading-state">{message}</div>
  ),
}));

jest.mock('../components/profile-banner', () => ({
  ProfileBanner: () => <div data-testid="profile-banner">Profile Banner</div>,
}));

jest.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => config,
  Link: ({ children, to, onClick, className }: { children: React.ReactNode; to: string; onClick?: () => void; className?: string }) => (
    <a href={to} onClick={onClick} className={className} data-testid={`nav-link-${to}`}>
      {children}
    </a>
  ),
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate-redirect" data-to={to} />,
  Outlet: () => <div data-testid="outlet-content">Outlet Content</div>,
  useRouterState: () => ({ location: { pathname: '/' } }),
  useNavigate: () => jest.fn(),
}));

jest.mock('../lib/auth-context', () => ({
  useAuth: jest.fn(),
}));

describe('AuthedLayoutComponent (Responsive Shell & Navigation)', () => {
  const mockLogout = jest.fn();
  const mockRetryBootstrap = jest.fn();
  const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

  const defaultUser = { id: 'u1', email: 'founder@startup.io', firstName: 'Founder', lastName: 'Lead' };
  const defaultWorkspace = { id: 'w1', name: 'Primary Outreacher Workspace' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      user: defaultUser,
      workspace: defaultWorkspace,
      isLoading: false,
      error: null,
      login: jest.fn(),
      signup: jest.fn(),
      logout: mockLogout,
      refetchAuth: jest.fn(),
      retryBootstrap: mockRetryBootstrap,
    } as unknown as ReturnType<typeof useAuth>);
  });

  const AuthedLayout = (AuthedRoute as unknown as { component: React.ComponentType }).component;

  it('renders loading state when session resolution is in flight', () => {
    mockUseAuth.mockReturnValue({ status: 'loading' } as unknown as ReturnType<typeof useAuth>);
    render(<AuthedLayout />);
    expect(screen.getByTestId('loading-state')).toBeInTheDocument();
    expect(screen.getByText(/Resolving authenticated session/i)).toBeInTheDocument();
  });

  it('renders connection error screen and handles retry when bootstrap fails', () => {
    mockUseAuth.mockReturnValue({
      status: 'bootstrap_error',
      error: new Error('Network timeout'),
      retryBootstrap: mockRetryBootstrap,
    } as unknown as ReturnType<typeof useAuth>);
    render(<AuthedLayout />);
    expect(screen.getByText('Connection Error')).toBeInTheDocument();
    expect(screen.getByText('Network timeout')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry connection/i }));
    expect(mockRetryBootstrap).toHaveBeenCalledTimes(1);
  });

  it('redirects to /login if user is unauthenticated', () => {
    mockUseAuth.mockReturnValue({ status: 'unauthenticated', user: null } as unknown as ReturnType<typeof useAuth>);
    render(<AuthedLayout />);
    expect(screen.getByTestId('navigate-redirect')).toHaveAttribute('data-to', '/login');
  });

  it('renders desktop sidebar shell', () => {
    render(<AuthedLayout />);
    const sidebars = screen.getAllByRole('complementary');
    expect(sidebars.length).toBeGreaterThan(0);
    // Should have links in sidebar
    expect(within(sidebars[0]).getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
  });

  it('opens mobile drawer sheet when hamburger button is clicked', () => {
    render(<AuthedLayout />);
    const menuButtons = screen.getAllByRole('button').filter(b => b.querySelector('.lucide-menu'));
    fireEvent.click(menuButtons[0]);
    expect(document.querySelector('.fixed.inset-0.z-40')).toBeInTheDocument();
  });

  it('dismisses mobile drawer when clicking backdrop overlay', () => {
    render(<AuthedLayout />);
    const menuButtons = screen.getAllByRole('button').filter(b => b.querySelector('.lucide-menu'));
    fireEvent.click(menuButtons[0]); // Open
    const overlay = document.querySelector('div[aria-hidden="true"].inset-0');
    fireEvent.click(overlay!); // Close
    expect(document.querySelector('.fixed.inset-0.z-40')).not.toBeInTheDocument();
  });
});
