import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './auth-context';
import { apiClient, ApiError } from '../api/client';

jest.mock('../api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
  ApiError: jest.requireActual('../api/client').ApiError,
}));

function TestConsumer() {
  const { status, user, workspace, error, login, signup, logout, retryBootstrap } = useAuth();
  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="user">{user ? user.email : 'none'}</div>
      <div data-testid="workspace">{workspace ? workspace.name : 'none'}</div>
      <div data-testid="error">{error ? error.message : 'none'}</div>
      <button type="button" onClick={() => void login('test@example.com', 'pass')}>
        Login
      </button>
      <button type="button" onClick={() => void signup('test@example.com', 'pass', 'First', 'Last')}>
        Signup
      </button>
      <button type="button" onClick={() => void logout()}>
        Logout
      </button>
      <button type="button" onClick={() => void retryBootstrap()}>
        Retry
      </button>
    </div>
  );
}

describe('AuthProvider & useAuth', () => {
  const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;
  const mockPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hydrates authenticated user and workspace on mount', async () => {
    mockGet.mockResolvedValueOnce({
      user: { id: 'u1', email: 'user@example.com' },
      workspace: { id: 'w1', name: 'User Workspace' },
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    expect(screen.getByTestId('status').textContent).toBe('loading');

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
    });

    expect(screen.getByTestId('user').textContent).toBe('user@example.com');
    expect(screen.getByTestId('workspace').textContent).toBe('User Workspace');
    expect(mockGet).toHaveBeenCalledWith('/auth/me');
  });

  it('sets status to unauthenticated when GET /auth/me returns 401', async () => {
    mockGet.mockRejectedValueOnce(
      new ApiError(401, {
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      }),
    );

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    });

    expect(screen.getByTestId('user').textContent).toBe('none');
    expect(screen.getByTestId('error').textContent).toBe('none');
  });

  it('sets status to bootstrap_error when network or 500 failure occurs on mount', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network failure'));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('bootstrap_error');
    });

    expect(screen.getByTestId('error').textContent).toBe('Network failure');
  });

  it('handles login flow and updates state on success', async () => {
    mockGet.mockRejectedValueOnce(new ApiError(401, null));
    mockPost.mockResolvedValueOnce({
      user: { id: 'u1', email: 'test@example.com' },
      workspace: { id: 'w1', name: 'New Workspace' },
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    });

    act(() => {
      screen.getByText('Login').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
    });

    expect(screen.getByTestId('user').textContent).toBe('test@example.com');
  });

  it('handles logout flow and sets unauthenticated status', async () => {
    mockGet.mockResolvedValueOnce({
      user: { id: 'u1', email: 'user@example.com' },
      workspace: { id: 'w1', name: 'User Workspace' },
    });
    mockPost.mockResolvedValueOnce({});

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
    });

    act(() => {
      screen.getByText('Logout').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    });

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    });

    expect(screen.getByTestId('user').textContent).toBe('none');
  });

  it('sets status to unauthenticated when API returns missing user/workspace (malformed session)', async () => {
    // Return empty object that lacks user and workspace
    mockGet.mockResolvedValueOnce({} as unknown as { user: unknown; workspace: unknown });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    // Initial state is loading
    expect(screen.getByTestId('status').textContent).toBe('loading');

    // It should route to unauthenticated, not become authenticated
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    });

    expect(screen.getByTestId('error').textContent).toBe('none');
  });
});
