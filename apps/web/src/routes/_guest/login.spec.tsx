import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Route } from './login';
import { useAuth } from '../../lib/auth-context';

jest.mock('../../lib/auth-context', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
  useNavigate: () => jest.fn(),
}));

describe('LoginComponent', () => {
  const mockLogin = jest.fn();
  const mockSignup = jest.fn();
  const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

  beforeEach(() => {
    jest.clearAllMocks();
    window.history.pushState({}, '', '/login');
    mockUseAuth.mockReturnValue({
      status: 'unauthenticated',
      user: null,
      workspace: null,
      isLoading: false,
      error: null,
      login: mockLogin,
      signup: mockSignup,
      logout: jest.fn(),
      refetchAuth: jest.fn(),
      retryBootstrap: jest.fn(),
    });
  });

  const LoginComponent = (Route as unknown as { component: React.ComponentType }).component;

  it('renders sign in form with proper HTML autocomplete attributes', () => {
    render(<LoginComponent />);

    expect(screen.getByRole('heading', { name: /sign in to outreacher/i })).toBeInTheDocument();

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);

    expect(emailInput).toHaveAttribute('autoComplete', 'email');
    expect(passwordInput).toHaveAttribute('autoComplete', 'current-password');
  });

  it('toggles to Create Account mode and updates password autocomplete hint', () => {
    render(<LoginComponent />);

    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));

    expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();

    const passwordInput = screen.getByLabelText(/password/i);
    expect(passwordInput).toHaveAttribute('autoComplete', 'new-password');
  });

  it('renders Google sign in button pointing to /auth/google', () => {
    render(<LoginComponent />);

    const googleLink = screen.getByRole('link', { name: /sign in with google/i });
    expect(googleLink).toHaveAttribute('href', expect.stringContaining('/auth/google'));
  });

  it('parses allowlisted error query parameter and displays alert message', () => {
    window.history.pushState({}, '', '/login?error=google_auth_failed');

    render(<LoginComponent />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/google sign-in could not be completed/i);
  });

  it('submits login credentials when form is submitted', async () => {
    mockLogin.mockResolvedValueOnce(undefined);

    render(<LoginComponent />);

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'Password123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('user@example.com', 'Password123!');
    });
  });
});
