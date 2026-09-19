import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Route } from './_authed';
import { useAuth } from '../lib/auth-context';

jest.mock('../lib/auth-context', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../components/profile-banner', () => ({
  ProfileBanner: () => <div data-testid="profile-banner">Profile Banner</div>,
}));

jest.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
  Link: ({
    children,
    to,
    onClick,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    onClick?: () => void;
    className?: string;
  }) => (
    <a href={to} onClick={onClick} className={className} data-testid={`nav-link-${to}`}>
      {children}
    </a>
  ),
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate-redirect" data-to={to} />,
  Outlet: () => <div data-testid="outlet-content">Outlet Content</div>,
}));

describe('AuthedLayoutComponent (Responsive Shell & Navigation)', () => {
  const mockLogout = jest.fn();
  const mockRetryBootstrap = jest.fn();
  const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

  const defaultUser = {
    id: 'u1',
    email: 'founder@startup.io',
    name: 'Founder Lead',
  };

  const defaultWorkspace = {
    id: 'w1',
    name: 'Primary Outreacher Workspace',
  };

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
    });
  });

  const AuthedLayout = (Route as unknown as { component: React.ComponentType }).component;

  it('renders loading state when session resolution is in flight', () => {
    mockUseAuth.mockReturnValueOnce({
      status: 'loading',
      user: null,
      workspace: null,
      isLoading: true,
      error: null,
      login: jest.fn(),
      signup: jest.fn(),
      logout: mockLogout,
      refetchAuth: jest.fn(),
      retryBootstrap: mockRetryBootstrap,
    });

    render(<AuthedLayout />);
    expect(screen.getByText(/resolving authenticated session/i)).toBeInTheDocument();
  });

  it('renders connection error screen and handles retry when bootstrap fails', () => {
    mockUseAuth.mockReturnValueOnce({
      status: 'bootstrap_error',
      user: null,
      workspace: null,
      isLoading: false,
      error: new Error('Network unreachable'),
      login: jest.fn(),
      signup: jest.fn(),
      logout: mockLogout,
      refetchAuth: jest.fn(),
      retryBootstrap: mockRetryBootstrap,
    });

    render(<AuthedLayout />);
    expect(screen.getByText(/connection error/i)).toBeInTheDocument();
    expect(screen.getByText('Network unreachable')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry connection/i });
    fireEvent.click(retryBtn);
    expect(mockRetryBootstrap).toHaveBeenCalledTimes(1);
  });

  it('redirects to /login if user is unauthenticated', () => {
    mockUseAuth.mockReturnValueOnce({
      status: 'unauthenticated',
      user: null,
      workspace: null,
      isLoading: false,
      error: null,
      login: jest.fn(),
      signup: jest.fn(),
      logout: mockLogout,
      refetchAuth: jest.fn(),
      retryBootstrap: mockRetryBootstrap,
    });

    render(<AuthedLayout />);
    const redirect = screen.getByTestId('navigate-redirect');
    expect(redirect).toHaveAttribute('data-to', '/login');
  });

  it('renders tablet and desktop sidebar shell with compact width and minimum 44px touch targets', () => {
    render(<AuthedLayout />);

    const sidebar = screen.getByRole('complementary');
    expect(sidebar).toHaveClass('md:flex');
    expect(sidebar).toHaveClass('md:w-52');
    expect(sidebar).toHaveClass('lg:w-64');

    expect(within(sidebar).getByText('Primary Outreacher Workspace')).toBeInTheDocument();
    expect(within(sidebar).getByText('founder@startup.io')).toBeInTheDocument();

    // Verify touch target size classes on desktop/tablet sidebar links
    const desktopHomeLink = within(sidebar).getByRole('link', { name: /home/i });
    expect(desktopHomeLink).toHaveClass('min-h-[44px]');

    const desktopSignOut = within(sidebar).getByRole('button', { name: /sign out/i });
    expect(desktopSignOut).toHaveClass('min-h-[44px]');

    fireEvent.click(desktopSignOut);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('renders mobile sticky top header with menu trigger', () => {
    render(<AuthedLayout />);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    expect(menuButton).toBeInTheDocument();
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    expect(menuButton).toHaveAttribute('aria-controls', 'mobile-navigation-drawer');
    expect(menuButton).toHaveClass('h-11'); // 44px
    expect(menuButton).toHaveClass('w-11'); // 44px
  });

  it('opens mobile drawer sheet when hamburger button is clicked', () => {
    render(<AuthedLayout />);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    fireEvent.click(menuButton);

    expect(menuButton).toHaveAttribute('aria-expanded', 'true');

    const drawer = screen.getByRole('dialog', { name: /navigation menu/i });
    expect(drawer).toBeInTheDocument();
    expect(drawer).toHaveAttribute('aria-modal', 'true');

    // Close button exists and has 44px touch target
    const closeBtn = within(drawer).getByRole('button', { name: /close navigation menu/i });
    expect(closeBtn).toBeInTheDocument();
    expect(closeBtn).toHaveClass('h-11');
    expect(closeBtn).toHaveClass('w-11');

    // Clicking close button dismisses drawer
    fireEvent.click(closeBtn);
    expect(screen.queryByRole('dialog', { name: /navigation menu/i })).not.toBeInTheDocument();
  });

  it('dismisses mobile drawer when clicking backdrop overlay', () => {
    render(<AuthedLayout />);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    fireEvent.click(menuButton);

    const backdrop = screen.getByTestId('mobile-backdrop');
    fireEvent.click(backdrop);

    expect(screen.queryByRole('dialog', { name: /navigation menu/i })).not.toBeInTheDocument();
  });

  it('dismisses mobile drawer on Escape key press', () => {
    render(<AuthedLayout />);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    fireEvent.click(menuButton);

    expect(screen.getByRole('dialog', { name: /navigation menu/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /navigation menu/i })).not.toBeInTheDocument();
  });

  it('dismisses mobile drawer when a navigation link is clicked', () => {
    render(<AuthedLayout />);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    fireEvent.click(menuButton);

    const drawer = screen.getByRole('dialog', { name: /navigation menu/i });
    const mobileCompaniesLink = within(drawer).getByRole('link', { name: /companies/i });
    expect(mobileCompaniesLink).toHaveClass('min-h-[44px]');

    fireEvent.click(mobileCompaniesLink);
    expect(screen.queryByRole('dialog', { name: /navigation menu/i })).not.toBeInTheDocument();
  });

  it('dismisses mobile drawer and invokes logout when mobile sign out is clicked', () => {
    render(<AuthedLayout />);

    const menuButton = screen.getByRole('button', { name: /open navigation menu/i });
    fireEvent.click(menuButton);

    const drawer = screen.getByRole('dialog', { name: /navigation menu/i });
    const mobileSignOut = within(drawer).getByRole('button', { name: /sign out/i });
    expect(mobileSignOut).toHaveClass('min-h-[44px]');

    fireEvent.click(mobileSignOut);
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: /navigation menu/i })).not.toBeInTheDocument();
  });
});
