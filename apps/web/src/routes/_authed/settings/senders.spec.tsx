import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Route } from './senders';
import { apiClient } from '../../../api/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
  ApiError: jest.requireActual('../../../api/client').ApiError,
}));

jest.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
}));

const mockIntegrations = [
  { id: 'int-1', workspaceId: 'w-1', name: 'Primary Resend', provider: 'RESEND', status: 'ACTIVE' },
  { id: 'int-2', workspaceId: 'w-1', name: 'Broken Resend', provider: 'RESEND', status: 'INVALID_CREDENTIALS' },
  { id: 'int-3', workspaceId: 'w-1', name: 'Disabled Resend', provider: 'RESEND', status: 'DISABLED' },
];

const mockSenders = [
  { id: 's-1', workspaceId: 'w-1', integrationId: 'int-1', fromName: 'Alice', fromEmail: 'alice@example.com', status: 'ACTIVE', dailyLimit: 500 },
  { id: 's-2', workspaceId: 'w-1', integrationId: 'int-2', fromName: 'Bob', fromEmail: 'bob@example.com', status: 'ACTIVE' },
  { id: 's-3', workspaceId: 'w-1', integrationId: 'int-3', fromName: 'Charlie', fromEmail: 'charlie@example.com', status: 'ACTIVE' },
  { id: 's-4', workspaceId: 'w-1', integrationId: 'int-1', fromName: 'Dave', fromEmail: 'dave@example.com', status: 'PAUSED' },
  { id: 's-5', workspaceId: 'w-1', integrationId: 'int-1', fromName: 'Eve', fromEmail: 'eve@example.com', status: 'DISABLED' },
];

describe('Sender Accounts Page', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    jest.clearAllMocks();
  });

  const renderComponent = () => {
    const Component = (Route as any).component;
    return render(
      <QueryClientProvider client={queryClient}>
        <Component />
      </QueryClientProvider>
    );
  };

  it('renders derived readiness states correctly', async () => {
    (apiClient.get as jest.Mock).mockImplementation(async (url) => {
      if (url === '/sender-accounts') return mockSenders;
      if (url === '/integrations') return mockIntegrations;
      return [];
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    });

    expect(screen.getByText('alice@example.com').closest('.rounded-lg')).toHaveTextContent('Ready');
    expect(screen.getByText('bob@example.com').closest('.rounded-lg')).toHaveTextContent('Needs attention');
    expect(screen.getByText('charlie@example.com').closest('.rounded-lg')).toHaveTextContent('Unavailable');
    expect(screen.getByText('dave@example.com').closest('.rounded-lg')).toHaveTextContent('Paused');
    expect(screen.getByText('eve@example.com').closest('.rounded-lg')).toHaveTextContent('Disconnected');
  });

  it('handles empty, loading, and error states for integrations in the add modal', async () => {
    let resolveIntegrations: any;
    const integrationsPromise = new Promise((resolve) => { resolveIntegrations = resolve; });

    (apiClient.get as jest.Mock).mockImplementation(async (url) => {
      if (url === '/sender-accounts') return [];
      if (url === '/integrations') return integrationsPromise;
      return [];
    });

    renderComponent();
    
    // Wait for senders to load (returns empty)
    await waitFor(() => {
      expect(screen.getByText('No sender accounts')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add sender', { selector: 'button' }));
    
    const dialog = screen.getByRole('dialog');
    
    // Initial state -> loading
    expect(dialog).toHaveTextContent('Loading integrations...');

    // Resolve with empty array
    resolveIntegrations([]);

    await waitFor(() => {
      expect(dialog).toHaveTextContent('You have no configured integrations.');
    });

    // Test Error State
    (apiClient.get as jest.Mock).mockImplementation(async (url) => {
      if (url === '/integrations') throw new Error('API down');
      return [];
    });

    queryClient.invalidateQueries({ queryKey: ['integrations'] });

    await waitFor(() => {
      expect(dialog).toHaveTextContent('Failed to load integrations.');
    });
  });

  it('displays a warning when selecting a degraded integration in the add modal', async () => {
    (apiClient.get as jest.Mock).mockImplementation(async (url) => {
      if (url === '/sender-accounts') return [];
      if (url === '/integrations') return mockIntegrations;
      return [];
    });

    renderComponent();

    await waitFor(() => {
      fireEvent.click(screen.getByText('Add sender', { selector: 'button' }));
    });

    const dialog = screen.getByRole('dialog');
    const select = screen.getByLabelText('Integration');
    fireEvent.change(select, { target: { value: 'int-2' } });

    expect(dialog).toHaveTextContent(/invalid credentials/i);
    expect(dialog).toHaveTextContent(/The sender account will not be fully ready until the integration is corrected/i);
    
    const buttons = screen.getAllByText('Add sender', { selector: 'button' });
    expect(buttons[buttons.length - 1]).not.toBeDisabled();
  });

  it('submits Add Sender form with dailyLimit', async () => {
    (apiClient.get as jest.Mock).mockImplementation(async (url) => {
      if (url === '/sender-accounts') return [];
      if (url === '/integrations') return mockIntegrations;
      return [];
    });

    renderComponent();

    await waitFor(() => {
      fireEvent.click(screen.getByText('Add sender', { selector: 'button' }));
    });

    fireEvent.change(screen.getByLabelText('From name'), { target: { value: 'Test Name' } });
    fireEvent.change(screen.getByLabelText('From email'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/Daily limit/i), { target: { value: '1000' } });

    const buttons = screen.getAllByText('Add sender', { selector: 'button' });
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/sender-accounts', {
        integrationId: 'int-1',
        fromName: 'Test Name',
        fromEmail: 'test@example.com',
        dailyLimit: 1000, replyTo: undefined,
      });
    });
  });

  it('closes Add Sender modal on Escape', async () => {
    (apiClient.get as jest.Mock).mockImplementation(async (url) => {
      if (url === '/sender-accounts') return [];
      if (url === '/integrations') return mockIntegrations;
      return [];
    });

    renderComponent();

    await waitFor(() => {
      fireEvent.click(screen.getByText('Add sender', { selector: 'button' }));
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('allows editing a sender and updating dailyLimit', async () => {
    (apiClient.get as jest.Mock).mockImplementation(async (url) => {
      if (url === '/sender-accounts') return [mockSenders[0]]; // Alice
      if (url === '/integrations') return mockIntegrations;
      return [];
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Edit'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toHaveTextContent('Edit Sender Account');
    });

    // It should have prepopulated dailyLimit of 500
    const limitInput = screen.getByLabelText(/Daily limit/i) as HTMLInputElement;
    expect(limitInput.value).toBe('500');

    fireEvent.change(limitInput, { target: { value: '1000' } });

    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith('/sender-accounts/s-1', {
        fromName: 'Alice',
        fromEmail: 'alice@example.com',
        dailyLimit: 1000, replyTo: null,
      });
    });
  });

  it('requires confirmation to disconnect a sender', async () => {
    (apiClient.get as jest.Mock).mockImplementation(async (url) => {
      if (url === '/sender-accounts') return [mockSenders[0]]; // Alice
      if (url === '/integrations') return mockIntegrations;
      return [];
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Disconnect'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toHaveTextContent('Disconnect sender');
    });

    // Not submitted yet
    expect(apiClient.patch).not.toHaveBeenCalled();

    const buttons = screen.getAllByText('Disconnect', { selector: 'button' });
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith('/sender-accounts/s-1', { status: 'DISABLED' });
    });
  });

  it('displays mutation error states', async () => {
    (apiClient.get as jest.Mock).mockImplementation(async (url) => {
      if (url === '/sender-accounts') return [mockSenders[0]]; // Alice
      if (url === '/integrations') return mockIntegrations;
      return [];
    });

    (apiClient.patch as jest.Mock).mockRejectedValue(new Error('Network Error'));

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Pause'));

    await waitFor(() => {
      expect(screen.getByText(/Couldn't pause this sender./i)).toBeInTheDocument();
    });

    // Dismiss the error
    fireEvent.click(screen.getByText('Dismiss'));

    await waitFor(() => {
      expect(screen.queryByText(/Couldn't pause this sender./i)).not.toBeInTheDocument();
    });
  });
});
