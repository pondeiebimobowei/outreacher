import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntegrationsPage } from './integrations';
import {
  useIntegrations,
  useCreateIntegration,
  useTestIntegration,
  useDisableIntegration,
  useEnableIntegration,
} from '../../../api/integrations';
import { useSenderAccounts } from '../../../api/sender-accounts';
import '@testing-library/jest-dom';

jest.mock('../../../api/integrations');
jest.mock('../../../api/sender-accounts');
jest.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (component: any) => component,
}));

describe('IntegrationsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSenderAccounts as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });
  });

  it('renders loading state', () => {
    (useIntegrations as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });
    render(<IntegrationsPage />);
    expect(screen.getByLabelText(/Loading integrations/i)).toBeInTheDocument();
  });

  it('renders a list of integrations with correct status badges and dependency count', () => {
    (useIntegrations as jest.Mock).mockReturnValue({
      data: [
        { id: '1', name: 'Resend Prod', provider: 'RESEND', status: 'ACTIVE' },
        { id: '2', name: 'Resend Staging', provider: 'RESEND', status: 'INVALID_CREDENTIALS' },
      ],
      isLoading: false,
      error: null,
    });
    (useSenderAccounts as jest.Mock).mockReturnValue({
      data: [
        { id: 's1', integrationId: '1', name: 'Sender 1' },
        { id: 's2', integrationId: '1', name: 'Sender 2' },
      ],
      isLoading: false,
      error: null,
    });
    (useTestIntegration as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    (useDisableIntegration as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
    (useEnableIntegration as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });

    render(<IntegrationsPage />);
    
    // Check ACTIVE card
    expect(screen.getByText('Resend Prod')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('2 sender accounts linked')).toBeInTheDocument();
    
    // Check INVALID_CREDENTIALS card
    expect(screen.getByText('Resend Staging')).toBeInTheDocument();
    expect(screen.getByText('Action Required')).toBeInTheDocument();
    expect(screen.getByText('0 sender accounts linked')).toBeInTheDocument();
    
    // Action should be Reconnect for invalid credentials, not Disable
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
  });

  describe('Connect Modal Orchestration & Accessibility', () => {
    let mockCreate: jest.Mock;
    let mockTest: jest.Mock;

    beforeEach(() => {
      mockCreate = jest.fn();
      mockTest = jest.fn();
      
      (useIntegrations as jest.Mock).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      });
      (useCreateIntegration as jest.Mock).mockReturnValue({ mutateAsync: mockCreate });
      (useTestIntegration as jest.Mock).mockReturnValue({ mutateAsync: mockTest });
    });

    it('orchestrates create then test, closing on success', async () => {
      mockCreate.mockResolvedValue({ id: 'integration-123' });
      mockTest.mockResolvedValue({ success: true });

      render(<IntegrationsPage />);
      
      const connectBtn = screen.getAllByRole('button', { name: /Connect provider/i })[0];
      connectBtn.focus(); fireEvent.click(connectBtn);
      
      // Initial focus should move to name input
      expect(document.activeElement).toBe(screen.getByLabelText(/Connection Name/i));

      fireEvent.change(screen.getByLabelText(/Connection Name/i), { target: { value: 'Test Connection' } });
      fireEvent.change(screen.getByLabelText(/Credential Environment Variable/i), { target: { value: 'API_KEY' } });
      
      fireEvent.click(screen.getByRole('button', { name: /Save & test connection/i }));
      
      await waitFor(() => {
        expect(mockCreate).toHaveBeenCalledWith({
          name: 'Test Connection',
          provider: 'RESEND',
          secretReference: 'env://API_KEY'
        });
      });
      
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      
      // Focus should be restored to trigger button
      await waitFor(() => expect(document.activeElement).toBe(connectBtn));
    });

    it('retains created integration and retries ONLY test on failure', async () => {
      mockCreate.mockResolvedValue({ id: 'integration-123' });
      mockTest.mockResolvedValueOnce({ success: false, reason: 'INVALID_CREDENTIALS' });
      mockTest.mockResolvedValueOnce({ success: true }); // succeeds on second try

      render(<IntegrationsPage />);
      fireEvent.click(screen.getAllByRole('button', { name: /Connect provider/i })[0]);
      
      fireEvent.change(screen.getByLabelText(/Connection Name/i), { target: { value: 'Test' } });
      fireEvent.change(screen.getByLabelText(/Credential Environment Variable/i), { target: { value: 'KEY' } });
      
      fireEvent.click(screen.getByRole('button', { name: /Save & test connection/i }));
      
      // First test attempt fails
      await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));
      
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(/Test failed: Invalid credentials provided/i);
      
      // Retry
      const retryBtn = screen.getByRole('button', { name: /Test connection again/i });
      fireEvent.click(retryBtn);
      
      await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(2));
      expect(mockCreate).toHaveBeenCalledTimes(1); // Still only created once!
    });
  });

  describe('Disconnect Confirmation', () => {
    let mockDisable: jest.Mock;

    beforeEach(() => {
      mockDisable = jest.fn();

      (useIntegrations as jest.Mock).mockReturnValue({
        data: [
          { id: '1', name: 'Active Conn', provider: 'RESEND', status: 'ACTIVE' },
        ],
        isLoading: false,
        error: null,
      });
      (useSenderAccounts as jest.Mock).mockReturnValue({
        data: [{ id: 's1', integrationId: '1' }, { id: 's2', integrationId: '1' }],
        isLoading: false,
        error: null,
      });
      (useCreateIntegration as jest.Mock).mockReturnValue({ mutateAsync: jest.fn() });
      (useTestIntegration as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
      (useDisableIntegration as jest.Mock).mockReturnValue({ mutate: mockDisable, isPending: false });
      (useEnableIntegration as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
    });

    it('prompts for confirmation with dependency count before disabling', async () => {
      render(<IntegrationsPage />);
      
      fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
      
      // Should show confirmation warning
      expect(screen.getByText(/Disable this integration\?/i)).toBeInTheDocument();
      expect(screen.getByText(/currently used by 2 sender accounts/i)).toBeInTheDocument();
      
      // Cancel shouldn't disable
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(mockDisable).not.toHaveBeenCalled();
      
      // Confirm should disable
      fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
      fireEvent.click(screen.getByRole('button', { name: 'Yes, disable' }));
      
      expect(mockDisable).toHaveBeenCalledWith('1');
    });
  });
});
