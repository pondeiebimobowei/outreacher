import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../../api/client';
import { CompanyContactsResponse } from '../../api/contacts';
import { ContactDiscoveryWorkspace } from './contact-discovery-workspace';

jest.mock('../../api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
  ApiError: jest.requireActual('../../api/client').ApiError,
}));

describe('ContactDiscoveryWorkspace Component - UX-004 Contact Discovery & Selection', () => {
  const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;
  const mockPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>;
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    queryClient.clear();
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <ContactDiscoveryWorkspace companyId="comp-100" companyName="Acme Corp" />
      </QueryClientProvider>,
    );

  it('renders initial NOT_STARTED state with CTA button', async () => {
    mockGet.mockResolvedValue({
      companyId: 'comp-100',
      status: 'NOT_STARTED',
      selectedContactId: null,
      contacts: [],
      discoveryJob: null,
    } as unknown as CompanyContactsResponse);

    renderComponent();

    expect(
      await screen.findByRole('heading', { name: /6\. Contact Discovery & Selection/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Find Relevant Contacts/i })).toBeInTheDocument();
  });

  it('renders candidates with badges, rationale, missing email, and handles selection', async () => {
    const mockResponse: CompanyContactsResponse = {
      companyId: 'comp-200',
      status: 'COMPLETED',
      selectedContactId: 'cont-1',
      contacts: [
        {
          id: 'cont-1',
          workspaceId: 'ws-1',
          companyId: 'comp-200',
          contactKind: 'PERSON',
          name: 'Jane Doe',
          email: 'jane.doe@acme.com',
          title: 'VP of Engineering',
          source: 'COMPANY_WEBSITE',
          sourceUrl: 'https://acme.com/team',
          confidence: 'HIGH',
          emailConfidence: 'AVAILABLE',
          discoveredAt: '2026-09-18T00:00:00Z',
          createdAt: '2026-09-18T00:00:00Z',
          updatedAt: '2026-09-18T00:00:00Z',
          relevance: 'HIGH',
          recommendationRationale:
            "Role 'VP of Engineering' directly matches target role 'Engineering Lead'.",
          isSelected: true,
        },
        {
          id: 'cont-2',
          workspaceId: 'ws-1',
          companyId: 'comp-200',
          contactKind: 'PERSON',
          name: 'Alex Rivera',
          email: null, // Zero fabrication missing email
          title: 'Head of Engineering',
          source: 'TEAM_PAGE',
          sourceUrl: 'https://acme.com/about',
          confidence: 'MEDIUM',
          emailConfidence: 'UNAVAILABLE',
          discoveredAt: '2026-09-18T00:00:00Z',
          createdAt: '2026-09-18T00:00:00Z',
          updatedAt: '2026-09-18T00:00:00Z',
          relevance: 'MEDIUM',
          recommendationRationale: 'Functional decision-maker role for proactive outreach.',
          isSelected: false,
        },
      ],
      discoveryJob: {
        id: 'job-100',
        status: 'COMPLETED',
        createdAt: '2026-09-18T00:00:00Z',
        completedAt: '2026-09-18T00:00:00Z',
      },
      mock: true,
    };

    mockGet.mockResolvedValue(mockResponse as unknown as CompanyContactsResponse);
    mockPost.mockResolvedValue({
      id: 'sel-1',
      companyId: 'comp-200',
      contactId: 'cont-2',
      selectedAt: '2026-09-18T00:00:00Z',
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ContactDiscoveryWorkspace companyId="comp-200" companyName="Acme Corp" />
      </QueryClientProvider>,
    );

    // Verify candidate identity & badges
    expect(await screen.findAllByText('Jane Doe')).not.toHaveLength(0);
    expect(screen.getByText('Alex Rivera')).toBeInTheDocument();
    expect(screen.getAllByText('PERSON')).toHaveLength(2);
    expect(screen.getByText(/Mock Data Provider/i)).toBeInTheDocument();

    // Verify missing email state
    expect(screen.getByText('Email Unavailable')).toBeInTheDocument();

    // Verify selection status
    expect(screen.getByText('Selected Target')).toBeInTheDocument();

    // Test selection trigger for unselected candidate
    const selectBtn = screen.getByRole('button', { name: /Select Target Contact/i });
    fireEvent.click(selectBtn);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/companies/comp-200/contacts/cont-2/select');
    });
  });
});
