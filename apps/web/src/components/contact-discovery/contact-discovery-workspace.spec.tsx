import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
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

const mockNavigate = jest.fn();
jest.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
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
    expect(screen.getByRole('button', { name: /\+ Add Contact/i })).toBeInTheDocument();
  });

  it('opens AddContactModal when + Add Contact button is clicked', async () => {
    mockGet.mockResolvedValue({
      companyId: 'comp-100',
      status: 'NOT_STARTED',
      selectedContactId: null,
      contacts: [],
      discoveryJob: null,
    } as unknown as CompanyContactsResponse);

    renderComponent();

    const addBtn = await screen.findByRole('button', { name: /\+ Add Contact/i });
    fireEvent.click(addBtn);

    expect(await screen.findByText(/Add Contact Manually/i)).toBeInTheDocument();
  });

  it('renders candidates with badges, rationale, missing email, handles selection, and opens review modal', async () => {
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
          email: null,
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

    mockGet.mockImplementation((url: string) => {
      if (url === '/companies/comp-200/contacts') {
        return Promise.resolve(mockResponse as unknown as CompanyContactsResponse);
      }
      if (url.startsWith('/campaigns')) {
        if (url.includes('/contacts')) {
          return Promise.resolve([
            {
              id: 'cc-1',
              workspaceId: 'ws-1',
              campaignId: 'camp-1',
              contactId: 'cont-1',
              status: 'PENDING',
              contact: { id: 'cont-1', name: 'Jane Doe' },
            },
          ]);
        }
        return Promise.resolve([
          {
            id: 'camp-1',
            workspaceId: 'ws-1',
            companyId: 'comp-200',
            name: 'Outreach — Acme Corp',
            status: 'DRAFT',
          },
        ]);
      }
      if (url.startsWith('/campaign-contacts/')) {
        return Promise.resolve({
          id: 'cc-1',
          workspaceId: 'ws-1',
          campaignId: 'camp-1',
          contactId: 'cont-1',
          status: 'PENDING',
          currentSubject: 'Acme distributed systems',
          currentBody: 'Hi Jane, reaching out regarding distributed systems at Acme.',
          updatedAt: '2026-09-19T00:00:00.000Z',
          contact: { id: 'cont-1', name: 'Jane Doe' },
          campaign: { id: 'camp-1', name: 'Outreach — Acme Corp' },
        });
      }
      return Promise.resolve(mockResponse as unknown as CompanyContactsResponse);
    });

    mockPost.mockImplementation((url: string) => {
      if (url.includes('/contacts') && url.includes('/campaigns')) {
        return Promise.resolve({
          bound: [
            {
              id: 'cc-1',
              workspaceId: 'ws-1',
              campaignId: 'camp-1',
              contactId: 'cont-1',
              status: 'PENDING',
            },
          ],
          ignoredDuplicateCount: 0,
        });
      }
      return Promise.resolve({
        id: 'sel-1',
        companyId: 'comp-200',
        contactId: 'cont-2',
        selectedAt: '2026-09-18T00:00:00Z',
      });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ContactDiscoveryWorkspace companyId="comp-200" companyName="Acme Corp" />
      </QueryClientProvider>,
    );

    // Verify candidate identity & badges
    expect(await screen.findAllByText('Jane Doe')).not.toHaveLength(0);
    expect(screen.getByText('Alex Rivera')).toBeInTheDocument();

    // Verify Top Recommendations vs Additional Candidates sectioning
    expect(screen.getByText(/Top Recommendations/i)).toBeInTheDocument();
    expect(screen.getByText(/Additional Candidates/i)).toBeInTheDocument();

    // Verify transition banner when contact is selected
    expect(screen.getByText(/Target Contact Selected/i)).toBeInTheDocument();
    const prepareBtn = screen.getByRole('button', { name: /Prepare Outreach & Campaign Context/i });
    fireEvent.click(prepareBtn);
    expect(await screen.findByText(/AI Assisted — Review Required/i)).toBeInTheDocument();

    // Close outreach drawer
    const closeDrawerBtn = screen.getByRole('button', { name: /Close outreach review drawer/i });
    fireEvent.click(closeDrawerBtn);

    // Test Review Details modal opening
    const reviewBtns = screen.getAllByRole('button', { name: /Review Details/i });
    fireEvent.click(reviewBtns[0]);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('opens OutreachReviewDrawer when Review Outreach Draft button is clicked on a selected contact card', async () => {
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
          recommendationRationale: 'Target decision maker.',
          isSelected: true,
        },
      ],
      discoveryJob: null,
    };

    mockGet.mockImplementation((url: string) => {
      if (url === '/companies/comp-200/contacts') {
        return Promise.resolve(mockResponse as unknown as CompanyContactsResponse);
      }
      if (url.startsWith('/campaigns')) {
        if (url.includes('/contacts')) {
          return Promise.resolve([
            {
              id: 'cc-1',
              workspaceId: 'ws-1',
              campaignId: 'camp-1',
              contactId: 'cont-1',
              status: 'PENDING',
              contact: { id: 'cont-1', name: 'Jane Doe' },
            },
          ]);
        }
        return Promise.resolve([
          {
            id: 'camp-1',
            workspaceId: 'ws-1',
            companyId: 'comp-200',
            name: 'Outreach — Acme Corp',
            status: 'DRAFT',
          },
        ]);
      }
      if (url.startsWith('/campaign-contacts/')) {
        return Promise.resolve({
          id: 'cc-1',
          workspaceId: 'ws-1',
          campaignId: 'camp-1',
          contactId: 'cont-1',
          status: 'PENDING',
          currentSubject: 'Acme distributed systems',
          currentBody: 'Hi Jane, reaching out regarding distributed systems at Acme.',
          updatedAt: '2026-09-19T00:00:00.000Z',
          contact: { id: 'cont-1', name: 'Jane Doe' },
          campaign: { id: 'camp-1', name: 'Outreach — Acme Corp' },
        });
      }
      return Promise.resolve(mockResponse as unknown as CompanyContactsResponse);
    });

    mockPost.mockResolvedValue({
      bound: [
        {
          id: 'cc-1',
          workspaceId: 'ws-1',
          campaignId: 'camp-1',
          contactId: 'cont-1',
          status: 'PENDING',
        },
      ],
      ignoredDuplicateCount: 0,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ContactDiscoveryWorkspace companyId="comp-200" companyName="Acme Corp" />
      </QueryClientProvider>,
    );

    const reviewOutreachBtn = await screen.findByRole('button', {
      name: /Review Outreach Draft/i,
    });
    fireEvent.click(reviewOutreachBtn);

    expect(await screen.findByText(/AI Assisted — Review Required/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Acme distributed systems')).toBeInTheDocument();
  });

  it('filters candidates by search input', async () => {
    mockGet.mockResolvedValue({
      companyId: 'comp-200',
      status: 'COMPLETED',
      selectedContactId: null,
      contacts: [
        {
          id: 'cont-1',
          workspaceId: 'ws-1',
          companyId: 'comp-200',
          contactKind: 'PERSON',
          name: 'Jane Doe',
          email: 'jane.doe@acme.com',
          title: 'VP of Engineering',
          relevance: 'HIGH',
          emailConfidence: 'AVAILABLE',
          isSelected: false,
        },
        {
          id: 'cont-2',
          workspaceId: 'ws-1',
          companyId: 'comp-200',
          contactKind: 'PERSON',
          name: 'Alex Rivera',
          email: null,
          title: 'Recruiting Manager',
          relevance: 'MEDIUM',
          emailConfidence: 'UNAVAILABLE',
          isSelected: false,
        },
      ],
      discoveryJob: null,
    } as unknown as CompanyContactsResponse);

    render(
      <QueryClientProvider client={queryClient}>
        <ContactDiscoveryWorkspace companyId="comp-200" companyName="Acme Corp" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Alex Rivera')).toBeInTheDocument();

    // Type search query
    const searchInput = screen.getByPlaceholderText(/Search by name, title, or email/i);
    fireEvent.change(searchInput, { target: { value: 'Jane' } });

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.queryByText('Alex Rivera')).not.toBeInTheDocument();

    // Type zero-match query
    fireEvent.change(searchInput, { target: { value: 'NonexistentUser' } });
    expect(
      await screen.findByText("No candidate contacts match 'NonexistentUser'."),
    ).toBeInTheDocument();
  });

  it('selects a contact, resolves canonical company campaign, and binds contact into PENDING state', async () => {
    const mockResponse: CompanyContactsResponse = {
      companyId: 'comp-200',
      status: 'COMPLETED',
      selectedContactId: null,
      contacts: [
        {
          id: 'cont-2',
          workspaceId: 'ws-1',
          companyId: 'comp-200',
          contactKind: 'PERSON',
          name: 'Alex Rivera',
          email: 'alex@acme.com',
          title: 'Head of Engineering',
          source: 'TEAM_PAGE',
          sourceUrl: 'https://acme.com/about',
          confidence: 'HIGH',
          emailConfidence: 'AVAILABLE',
          discoveredAt: '2026-09-18T00:00:00Z',
          createdAt: '2026-09-18T00:00:00Z',
          updatedAt: '2026-09-18T00:00:00Z',
          relevance: 'HIGH',
          recommendationRationale: 'Engineering leadership decision maker.',
          isSelected: false,
        },
      ],
      discoveryJob: null,
    };

    mockGet.mockImplementation((url: string) => {
      if (url === '/companies/comp-200/contacts') {
        return Promise.resolve(mockResponse as unknown as CompanyContactsResponse);
      }
      if (url === '/campaigns') {
        return Promise.resolve([
          {
            id: 'camp-42',
            workspaceId: 'ws-1',
            companyId: 'comp-200',
            name: 'Outreach — Acme Corp',
            status: 'ACTIVE',
            sendingIdentity: null,
            followUpDelayBusinessDays: 3,
            createdAt: '2026-09-18T00:00:00Z',
            updatedAt: '2026-09-18T00:00:00Z',
          },
        ]);
      }
      return Promise.reject(new Error(`Unhandled GET url: ${url}`));
    });

    mockPost.mockImplementation((url: string) => {
      if (url === '/companies/comp-200/contacts/cont-2/select') {
        mockResponse.contacts[0].isSelected = true;
        mockResponse.selectedContactId = 'cont-2';
        return Promise.resolve({
          id: 'sel-1',
          companyId: 'comp-200',
          contactId: 'cont-2',
          selectedAt: '2026-09-18T00:00:00Z',
        });
      }
      if (url === '/campaigns/camp-42/contacts') {
        return Promise.resolve({
          bound: [
            {
              id: 'cc-99',
              workspaceId: 'ws-1',
              campaignId: 'camp-42',
              contactId: 'cont-2',
              status: 'PENDING',
              targetRole: null,
              outreachReason: null,
              currentSubject: null,
              currentBody: null,
              selectedOpportunityId: null,
              createdAt: '2026-09-18T00:00:00Z',
              updatedAt: '2026-09-18T00:00:00Z',
            },
          ],
          ignoredDuplicateCount: 0,
        });
      }
      return Promise.reject(new Error(`Unhandled POST url: ${url}`));
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ContactDiscoveryWorkspace companyId="comp-200" companyName="Acme Corp" />
      </QueryClientProvider>,
    );

    const selectBtn = await screen.findByRole('button', { name: /Select Target Contact/i });
    fireEvent.click(selectBtn);

    // Verify transition banner displays bound campaign and PENDING status
    expect(await screen.findByText('Outreach — Acme Corp')).toBeInTheDocument();
    expect(await screen.findByText('PENDING')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Review Outreach Draft/i })).toBeInTheDocument();

    // Verify select endpoint called
    expect(mockPost).toHaveBeenCalledWith('/companies/comp-200/contacts/cont-2/select');

    // Verify campaigns lookup called
    expect(mockGet).toHaveBeenCalledWith('/campaigns');

    // Verify bind contacts called
    expect(mockPost).toHaveBeenCalledWith('/campaigns/camp-42/contacts', {
      contactIds: ['cont-2'],
    });
  });

  it('creates canonical campaign if none exists and binds contact', async () => {
    const mockResponse: CompanyContactsResponse = {
      companyId: 'comp-300',
      status: 'COMPLETED',
      selectedContactId: null,
      contacts: [
        {
          id: 'cont-3',
          workspaceId: 'ws-1',
          companyId: 'comp-300',
          contactKind: 'PERSON',
          name: 'Sarah Connor',
          email: 'sarah@acme.com',
          title: 'CTO',
          source: 'TEAM_PAGE',
          sourceUrl: 'https://acme.com/team',
          confidence: 'HIGH',
          emailConfidence: 'AVAILABLE',
          discoveredAt: '2026-09-18T00:00:00Z',
          createdAt: '2026-09-18T00:00:00Z',
          updatedAt: '2026-09-18T00:00:00Z',
          relevance: 'HIGH',
          recommendationRationale: 'Key technical decision maker.',
          isSelected: false,
        },
      ],
      discoveryJob: null,
    };

    mockGet.mockImplementation((url: string) => {
      if (url === '/companies/comp-300/contacts') {
        return Promise.resolve(mockResponse as unknown as CompanyContactsResponse);
      }
      if (url === '/campaigns') {
        return Promise.resolve([]);
      }
      return Promise.reject(new Error(`Unhandled GET url: ${url}`));
    });

    mockPost.mockImplementation((url: string) => {
      if (url === '/companies/comp-300/contacts/cont-3/select') {
        mockResponse.contacts[0].isSelected = true;
        mockResponse.selectedContactId = 'cont-3';
        return Promise.resolve({
          id: 'sel-2',
          companyId: 'comp-300',
          contactId: 'cont-3',
          selectedAt: '2026-09-18T00:00:00Z',
        });
      }
      if (url === '/campaigns') {
        return Promise.resolve({
          id: 'camp-new',
          workspaceId: 'ws-1',
          companyId: 'comp-300',
          name: 'Outreach — Cyberdyne',
          status: 'ACTIVE',
          sendingIdentity: null,
          followUpDelayBusinessDays: 3,
          createdAt: '2026-09-18T00:00:00Z',
          updatedAt: '2026-09-18T00:00:00Z',
        });
      }
      if (url === '/campaigns/camp-new/contacts') {
        return Promise.resolve({
          bound: [
            {
              id: 'cc-101',
              workspaceId: 'ws-1',
              campaignId: 'camp-new',
              contactId: 'cont-3',
              status: 'PENDING',
              targetRole: null,
              outreachReason: null,
              currentSubject: null,
              currentBody: null,
              selectedOpportunityId: null,
              createdAt: '2026-09-18T00:00:00Z',
              updatedAt: '2026-09-18T00:00:00Z',
            },
          ],
          ignoredDuplicateCount: 0,
        });
      }
      return Promise.reject(new Error(`Unhandled POST url: ${url}`));
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ContactDiscoveryWorkspace companyId="comp-300" companyName="Cyberdyne" />
      </QueryClientProvider>,
    );

    const selectBtn = await screen.findByRole('button', { name: /Select Target Contact/i });
    fireEvent.click(selectBtn);

    expect(await screen.findByText('Outreach — Cyberdyne')).toBeInTheDocument();
    expect(await screen.findByText('PENDING')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith('/campaigns', {
      companyId: 'comp-300',
      name: 'Outreach — Cyberdyne',
    });
  });

  it('displays warning alert when campaign binding encounters an error', async () => {
    const mockResponse: CompanyContactsResponse = {
      companyId: 'comp-200',
      status: 'COMPLETED',
      selectedContactId: null,
      contacts: [
        {
          id: 'cont-2',
          workspaceId: 'ws-1',
          companyId: 'comp-200',
          contactKind: 'PERSON',
          name: 'Alex Rivera',
          email: 'alex@acme.com',
          title: 'Head of Engineering',
          source: 'TEAM_PAGE',
          sourceUrl: 'https://acme.com/about',
          confidence: 'HIGH',
          emailConfidence: 'AVAILABLE',
          discoveredAt: '2026-09-18T00:00:00Z',
          createdAt: '2026-09-18T00:00:00Z',
          updatedAt: '2026-09-18T00:00:00Z',
          relevance: 'HIGH',
          recommendationRationale: 'Engineering leadership decision maker.',
          isSelected: false,
        },
      ],
      discoveryJob: null,
    };

    mockGet.mockImplementation((url: string) => {
      if (url === '/companies/comp-200/contacts') {
        return Promise.resolve(mockResponse as unknown as CompanyContactsResponse);
      }
      if (url === '/campaigns') {
        return Promise.reject(new Error('Network error retrieving campaigns'));
      }
      return Promise.reject(new Error(`Unhandled GET url: ${url}`));
    });

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

    const selectBtn = await screen.findByRole('button', { name: /Select Target Contact/i });
    fireEvent.click(selectBtn);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Campaign Binding Warning:/i);
    expect(alert).toHaveTextContent(/Network error retrieving campaigns/i);
  });

  it('does not select an unrelated ACTIVE campaign when canonical campaign is absent, but creates canonical campaign', async () => {
    const mockResponse: CompanyContactsResponse = {
      companyId: 'comp-200',
      status: 'COMPLETED',
      selectedContactId: null,
      contacts: [
        {
          id: 'cont-2',
          workspaceId: 'ws-1',
          companyId: 'comp-200',
          contactKind: 'PERSON',
          name: 'Alex Rivera',
          email: 'alex@acme.com',
          title: 'Head of Engineering',
          source: 'TEAM_PAGE',
          sourceUrl: 'https://acme.com/about',
          confidence: 'HIGH',
          emailConfidence: 'AVAILABLE',
          discoveredAt: '2026-09-18T00:00:00Z',
          createdAt: '2026-09-18T00:00:00Z',
          updatedAt: '2026-09-18T00:00:00Z',
          relevance: 'HIGH',
          recommendationRationale: 'Engineering leadership decision maker.',
          isSelected: false,
        },
      ],
      discoveryJob: null,
    };

    mockGet.mockImplementation((url: string) => {
      if (url === '/companies/comp-200/contacts') {
        return Promise.resolve(mockResponse as unknown as CompanyContactsResponse);
      }
      if (url === '/campaigns') {
        // Return an unrelated ACTIVE campaign for this company
        return Promise.resolve([
          {
            id: 'camp-unrelated',
            workspaceId: 'ws-1',
            companyId: 'comp-200',
            name: 'Backend Outreach - September',
            status: 'ACTIVE',
            sendingIdentity: null,
            followUpDelayBusinessDays: 3,
            createdAt: '2026-09-18T00:00:00Z',
            updatedAt: '2026-09-18T00:00:00Z',
          },
        ]);
      }
      return Promise.reject(new Error(`Unhandled GET url: ${url}`));
    });

    mockPost.mockImplementation((url: string) => {
      if (url === '/companies/comp-200/contacts/cont-2/select') {
        mockResponse.contacts[0].isSelected = true;
        mockResponse.selectedContactId = 'cont-2';
        return Promise.resolve({
          id: 'sel-1',
          companyId: 'comp-200',
          contactId: 'cont-2',
          selectedAt: '2026-09-18T00:00:00Z',
        });
      }
      if (url === '/campaigns') {
        return Promise.resolve({
          id: 'camp-canonical',
          workspaceId: 'ws-1',
          companyId: 'comp-200',
          name: 'Outreach — Acme Corp',
          status: 'DRAFT',
          sendingIdentity: null,
          followUpDelayBusinessDays: 4,
          createdAt: '2026-09-18T00:00:00Z',
          updatedAt: '2026-09-18T00:00:00Z',
        });
      }
      if (url === '/campaigns/camp-canonical/contacts') {
        return Promise.resolve({
          bound: [
            {
              id: 'cc-99',
              workspaceId: 'ws-1',
              campaignId: 'camp-canonical',
              contactId: 'cont-2',
              status: 'PENDING',
              targetRole: null,
              outreachReason: null,
              currentSubject: null,
              currentBody: null,
              selectedOpportunityId: null,
              createdAt: '2026-09-18T00:00:00Z',
              updatedAt: '2026-09-18T00:00:00Z',
            },
          ],
          ignoredDuplicateCount: 0,
        });
      }
      return Promise.reject(new Error(`Unhandled POST url: ${url}`));
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ContactDiscoveryWorkspace companyId="comp-200" companyName="Acme Corp" />
      </QueryClientProvider>,
    );

    const selectBtn = await screen.findByRole('button', { name: /Select Target Contact/i });
    fireEvent.click(selectBtn);

    // Verify it created the canonical campaign rather than binding to unrelated active campaign
    expect(await screen.findByText('Outreach — Acme Corp')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith('/campaigns', {
      companyId: 'comp-200',
      name: 'Outreach — Acme Corp',
    });
    expect(mockPost).toHaveBeenCalledWith('/campaigns/camp-canonical/contacts', {
      contactIds: ['cont-2'],
    });
    // Ensure it NEVER bound to the unrelated campaign
    expect(mockPost).not.toHaveBeenCalledWith(expect.stringContaining('camp-unrelated'), expect.anything());
  });

  it('selects the canonical campaign when it exists in DRAFT status without creating a new campaign', async () => {
    const mockResponse: CompanyContactsResponse = {
      companyId: 'comp-200',
      status: 'COMPLETED',
      selectedContactId: null,
      contacts: [
        {
          id: 'cont-2',
          workspaceId: 'ws-1',
          companyId: 'comp-200',
          contactKind: 'PERSON',
          name: 'Alex Rivera',
          email: 'alex@acme.com',
          title: 'Head of Engineering',
          source: 'TEAM_PAGE',
          sourceUrl: 'https://acme.com/about',
          confidence: 'HIGH',
          emailConfidence: 'AVAILABLE',
          discoveredAt: '2026-09-18T00:00:00Z',
          createdAt: '2026-09-18T00:00:00Z',
          updatedAt: '2026-09-18T00:00:00Z',
          relevance: 'HIGH',
          recommendationRationale: 'Engineering leadership decision maker.',
          isSelected: false,
        },
      ],
      discoveryJob: null,
    };

    mockGet.mockImplementation((url: string) => {
      if (url === '/companies/comp-200/contacts') {
        return Promise.resolve(mockResponse as unknown as CompanyContactsResponse);
      }
      if (url === '/campaigns') {
        // Return existing canonical campaign in DRAFT status
        return Promise.resolve([
          {
            id: 'camp-draft-1',
            workspaceId: 'ws-1',
            companyId: 'comp-200',
            name: 'Outreach — Acme Corp',
            status: 'DRAFT',
            sendingIdentity: null,
            followUpDelayBusinessDays: 4,
            createdAt: '2026-09-18T00:00:00Z',
            updatedAt: '2026-09-18T00:00:00Z',
          },
        ]);
      }
      return Promise.reject(new Error(`Unhandled GET url: ${url}`));
    });

    mockPost.mockImplementation((url: string) => {
      if (url === '/companies/comp-200/contacts/cont-2/select') {
        mockResponse.contacts[0].isSelected = true;
        mockResponse.selectedContactId = 'cont-2';
        return Promise.resolve({
          id: 'sel-1',
          companyId: 'comp-200',
          contactId: 'cont-2',
          selectedAt: '2026-09-18T00:00:00Z',
        });
      }
      if (url === '/campaigns/camp-draft-1/contacts') {
        return Promise.resolve({
          bound: [
            {
              id: 'cc-99',
              workspaceId: 'ws-1',
              campaignId: 'camp-draft-1',
              contactId: 'cont-2',
              status: 'PENDING',
              targetRole: null,
              outreachReason: null,
              currentSubject: null,
              currentBody: null,
              selectedOpportunityId: null,
              createdAt: '2026-09-18T00:00:00Z',
              updatedAt: '2026-09-18T00:00:00Z',
            },
          ],
          ignoredDuplicateCount: 0,
        });
      }
      return Promise.reject(new Error(`Unhandled POST url: ${url}`));
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ContactDiscoveryWorkspace companyId="comp-200" companyName="Acme Corp" />
      </QueryClientProvider>,
    );

    const selectBtn = await screen.findByRole('button', { name: /Select Target Contact/i });
    fireEvent.click(selectBtn);

    // Verify it bound directly to the DRAFT canonical campaign
    expect(await screen.findByText('Outreach — Acme Corp')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith('/campaigns/camp-draft-1/contacts', {
      contactIds: ['cont-2'],
    });
    // Verify NO campaign was created via POST /campaigns
    expect(mockPost).not.toHaveBeenCalledWith('/campaigns', expect.anything());
  });
});
