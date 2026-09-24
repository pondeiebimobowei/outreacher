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
  createFileRoute: () => (component: unknown) => component,
}));

describe('IntegrationsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSenderAccounts as jest.Mock).mockReturnValue({
      data: [],
      error: null,
    });
    (useCreateIntegration as jest.Mock).mockReturnValue({ mutateAsync: jest.fn() });
    (useTestIntegration as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    (useDisableIntegration as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
    (useEnableIntegration as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
  });

  describe('Page States', () => {
    it('renders loading state', () => {
      (useIntegrations as jest.Mock).mockReturnValue({ data: undefined, isLoading: true, error: null });
      render(<IntegrationsPage />);
      expect(screen.getByLabelText(/Loading integrations/i)).toBeInTheDocument();
    });

    it('renders error state when integrations fail to load', () => {
      (useIntegrations as jest.Mock).mockReturnValue({ data: undefined, isLoading: false, error: new Error('API Error') });
      render(<IntegrationsPage />);
      expect(screen.getByText(/Error loading integrations/i)).toBeInTheDocument();
    });

    it('renders empty state when no integrations exist', () => {
      (useIntegrations as jest.Mock).mockReturnValue({ data: [], isLoading: false, error: null });
      render(<IntegrationsPage />);
      expect(screen.getByText(/No integrations/i)).toBeInTheDocument();
      expect(screen.getByText(/Get started by connecting an email provider/i)).toBeInTheDocument();
    });

    it('handles partial failure gracefully when sender accounts fail to load', () => {
      (useIntegrations as jest.Mock).mockReturnValue({
        data: [{ id: '1', name: 'Resend Prod', provider: 'RESEND', status: 'ACTIVE' }],
        isLoading: false,
        error: null,
      });
      // sender accounts throw error
      (useSenderAccounts as jest.Mock).mockReturnValue({
        data: undefined,
        error: new Error('Cannot load sender accounts'),
      });

      render(<IntegrationsPage />);
      
      // Page should NOT show global error
      expect(screen.queryByText(/Error loading integrations/i)).not.toBeInTheDocument();
      
      // Card should render with fallback
      expect(screen.getByText('Resend Prod')).toBeInTheDocument();
      expect(screen.getByText('Sender count unavailable')).toBeInTheDocument();
    });

    it('renders a list of integrations with correct status badges and dependency count', () => {
      (useIntegrations as jest.Mock).mockReturnValue({
        data: [
          { id: '1', name: 'Resend Prod', provider: 'RESEND', status: 'ACTIVE' },
          { id: '2', name: 'Resend Staging', provider: 'RESEND', status: 'INVALID_CREDENTIALS' },
          { id: '3', name: 'Resend Dev', provider: 'RESEND', status: 'DISABLED' },
        ],
        isLoading: false,
        error: null,
      });
      (useSenderAccounts as jest.Mock).mockReturnValue({
        data: [
          { id: 's1', integrationId: '1' },
          { id: 's2', integrationId: '1' },
        ],
        error: null,
      });

      render(<IntegrationsPage />);
      
      // ACTIVE card
      expect(screen.getByText('Resend Prod')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('2 sender accounts linked')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument();
      
      // INVALID_CREDENTIALS card
      expect(screen.getByText('Resend Staging')).toBeInTheDocument();
      expect(screen.getByText('Action Required')).toBeInTheDocument();
      expect(screen.getAllByText('0 sender accounts linked').length).toBeGreaterThan(0);
      // Should NOT have a Disable button, just Test
      const cards = screen.getAllByRole('button', { name: /Test connection/i });
      expect(cards).toHaveLength(3);
      expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument();

      // DISABLED card
      expect(screen.getByText('Resend Dev')).toBeInTheDocument();
      expect(screen.getByText('Disabled')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument();
    });
  });

  describe('Connect Modal Validation', () => {
    beforeEach(() => {
      (useIntegrations as jest.Mock).mockReturnValue({ data: [], isLoading: false, error: null });
    });

    it('validates required fields and credential format', async () => {
      const mockCreate = jest.fn();
      (useCreateIntegration as jest.Mock).mockReturnValue({ mutateAsync: mockCreate });
      
      render(<IntegrationsPage />);
      fireEvent.click(screen.getAllByRole('button', { name: /Connect provider/i })[0]);
      
      // Submit empty form
      fireEvent.click(screen.getByRole('button', { name: /Save & test connection/i }));
      
      expect(screen.getByText('Connection name is required.')).toBeInTheDocument();
      expect(screen.getByText('Credential reference is required.')).toBeInTheDocument();
      expect(mockCreate).not.toHaveBeenCalled();

      // Submit invalid credential format
      fireEvent.change(screen.getByLabelText(/Connection Name/i), { target: { value: 'Valid Name' } });
      fireEvent.change(screen.getByLabelText(/Credential Environment Variable/i), { target: { value: 'invalid-key' } });
      
      fireEvent.click(screen.getByRole('button', { name: /Save & test connection/i }));
      
      expect(screen.getByText('Must be an uppercase environment variable (e.g. RESEND_API_KEY).')).toBeInTheDocument();
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('Connect Modal Orchestration & Accessibility', () => {
    let mockCreate: jest.Mock;
    let mockTest: jest.Mock;

    beforeEach(() => {
      mockCreate = jest.fn();
      mockTest = jest.fn();
      (useIntegrations as jest.Mock).mockReturnValue({ data: [], isLoading: false, error: null });
      (useCreateIntegration as jest.Mock).mockReturnValue({ mutateAsync: mockCreate });
      (useTestIntegration as jest.Mock).mockReturnValue({ mutateAsync: mockTest });
    });

    it('orchestrates create then test, closing on success', async () => {
      mockCreate.mockResolvedValue({ id: 'integration-123' });
      mockTest.mockResolvedValue({ success: true });

      render(<IntegrationsPage />);
      
      const connectBtn = screen.getAllByRole('button', { name: /Connect provider/i })[0];
      connectBtn.focus(); fireEvent.click(connectBtn);
      
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
      await waitFor(() => expect(document.activeElement).toBe(connectBtn));
    });

    it('retains created integration and retries ONLY test on failure', async () => {
      mockCreate.mockResolvedValue({ id: 'integration-123' });
      mockTest.mockResolvedValueOnce({ success: false, reason: 'INVALID_CREDENTIALS' });
      mockTest.mockResolvedValueOnce({ success: true });

      render(<IntegrationsPage />);
      fireEvent.click(screen.getAllByRole('button', { name: /Connect provider/i })[0]);
      
      fireEvent.change(screen.getByLabelText(/Connection Name/i), { target: { value: 'Test' } });
      fireEvent.change(screen.getByLabelText(/Credential Environment Variable/i), { target: { value: 'KEY' } });
      
      fireEvent.click(screen.getByRole('button', { name: /Save & test connection/i }));
      
      await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(1));
      
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(/Test failed: Invalid credentials provided/i);
      
      const retryBtn = screen.getByRole('button', { name: /Test connection again/i });
      fireEvent.click(retryBtn);
      
      await waitFor(() => expect(mockTest).toHaveBeenCalledTimes(2));
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('Disable Confirmation Dialog', () => {
    let mockDisable: jest.Mock;

    beforeEach(() => {
      mockDisable = jest.fn();
      (useIntegrations as jest.Mock).mockReturnValue({
        data: [{ id: '1', name: 'Active Conn', provider: 'RESEND', status: 'ACTIVE' }],
        isLoading: false,
        error: null,
      });
      (useSenderAccounts as jest.Mock).mockReturnValue({
        data: [{ id: 's1', integrationId: '1' }, { id: 's2', integrationId: '1' }],
        error: null,
      });
      (useDisableIntegration as jest.Mock).mockReturnValue({ mutate: mockDisable, isPending: false });
      (useTestIntegration as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
      (useEnableIntegration as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
    });

    it('prompts for confirmation via accessible dialog before disabling', async () => {
      render(<IntegrationsPage />);
      
      fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
      
      // Should show confirmation dialog
      const dialog = screen.getByRole('dialog', { name: /Disable Integration/i });
      expect(dialog).toBeInTheDocument();
      expect(screen.getAllByText(/2 sender accounts/i).length).toBeGreaterThan(0);
      
      // Cancel shouldn't disable
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(mockDisable).not.toHaveBeenCalled();
      
      // Confirm should disable
      fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
      fireEvent.click(screen.getByRole('button', { name: 'Yes, disable' }));
      
      expect(mockDisable).toHaveBeenCalledWith('1', expect.any(Object));
    });
  });

  describe('Integration Card Actions', () => {
    it('calls enable mutation when Enable is clicked', () => {
      const mockEnable = jest.fn();
      (useIntegrations as jest.Mock).mockReturnValue({
        data: [{ id: '1', name: 'Dev', provider: 'RESEND', status: 'DISABLED' }],
        isLoading: false,
        error: null,
      });
      (useEnableIntegration as jest.Mock).mockReturnValue({ mutate: mockEnable, isPending: false });
      (useTestIntegration as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
      
      render(<IntegrationsPage />);
      
      fireEvent.click(screen.getByRole('button', { name: 'Enable' }));
      expect(mockEnable).toHaveBeenCalledWith('1');
    });
  });
});
