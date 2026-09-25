import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../../api/client';
import { AddContactModal } from './add-contact-modal';

jest.mock('../../api/client', () => ({
  apiClient: {
    post: jest.fn(),
  },
  ApiError: jest.requireActual('../../api/client').ApiError,
}));

describe('AddContactModal Component - Milestone 07 Manual Contact Creation', () => {
  const mockPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>;
  const mockOnClose = jest.fn();
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

  const renderModal = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <AddContactModal
          companyId="comp-100"
          companyName="Acme Corp"
          setAnnouncement={jest.fn()}
          onClose={mockOnClose}
        />
      </QueryClientProvider>,
    );


  it('renders modal with default form controls', () => {
    renderModal();
    expect(screen.getByText(/Add Contact Manually/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/First Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Last Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Role Title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Contact Type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Reference URL/i)).toBeInTheDocument();
  });

  it('validates required name field on submission', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /^Add Contact$/i }));

    expect(await screen.findByText('First Name is required')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('validates invalid email format', async () => {
    renderModal();

    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'invalid-email' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^Add Contact$/i }));

    expect(await screen.findByText(/Please enter a valid email address/i)).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('validates invalid reference URL format', async () => {
    renderModal();

    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByLabelText(/Reference URL/i), { target: { value: 'not-a-url' } });

    fireEvent.click(screen.getByRole('button', { name: /^Add Contact$/i }));

    expect(await screen.findByText(/Please enter a valid absolute URL/i)).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('submits valid manual contact payload and closes modal on success', async () => {
    mockPost.mockResolvedValue({
      id: 'cont-new-1',
      workspaceId: 'ws-100',
      companyId: 'comp-100',
      personKind: 'PERSON',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@acme.com',
      title: 'Head of Product',
      source: 'USER_PROVIDED',
      sourceUrl: 'https://acme.com/team',
      confidence: null,
      emailConfidence: 'AVAILABLE',
      discoveredAt: '2026-09-18T00:00:00Z',
      createdAt: '2026-09-18T00:00:00Z',
      updatedAt: '2026-09-18T00:00:00Z',
    });

    renderModal();

    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'jane.doe@acme.com' },
    });
    fireEvent.change(screen.getByLabelText(/Role Title/i), {
      target: { value: 'Head of Product' },
    });
    fireEvent.change(screen.getByLabelText(/Reference URL/i), {
      target: { value: 'https://acme.com/team' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^Add Contact$/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/companies/comp-100/contacts', {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane.doe@acme.com',
        title: 'Head of Product',
        personKind: 'PERSON',
        sourceUrl: 'https://acme.com/team',
      });
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('closes modal on Escape keypress', () => {
    renderModal();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(mockOnClose).toHaveBeenCalled();
  });
});
