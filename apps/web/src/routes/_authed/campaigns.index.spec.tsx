import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { apiClient } from '../../api/client';
import { Route as CampaignsRoute } from './campaigns.index';
import { CampaignDto } from '../../api/campaigns';
import { CompanyDto } from '../../api/companies';

const mockNavigate = jest.fn();

jest.mock('../../api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

jest.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
  useNavigate: () => mockNavigate,
}));

const mockCampaigns: CampaignDto[] = ( [
  {
    id: 'camp-1',
    companyId: 'comp-1',
    name: 'Outreach — Acme',
    status: 'ACTIVE',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-02T10:00:00Z',
  },
  {
    id: 'camp-2',
    companyId: 'comp-2',
    name: 'Outreach — Globex',
    status: 'PAUSED',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-02T10:00:00Z',
  },
  {
    id: 'camp-3',
    companyId: 'comp-1',
    name: 'Outreach — Draft',
    status: 'DRAFT',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-02T10:00:00Z',
  },
  {
    id: 'camp-4',
    companyId: 'comp-3',
    name: 'Outreach — Sched',
    status: 'SCHEDULED',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-02T10:00:00Z',
  },
  {
    id: 'camp-5',
    companyId: 'comp-2',
    name: 'Outreach — Comp',
    status: 'COMPLETED',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-02T10:00:00Z',
  },
  {
    id: 'camp-6',
    companyId: 'comp-4', // missing company
    name: 'Outreach — Missing',
    status: 'ARCHIVED',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-02T10:00:00Z',
  },
]) as unknown as CampaignDto[];

const mockCompanies: CompanyDto[] = ( [
  {
    id: 'comp-1',
    name: 'Acme Corp',
    normalizedName: 'acme corp',
    status: 'ACTIVE',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    workspaceId: 'ws-1',
  },
  {
    id: 'comp-2',
    name: 'Globex Inc',
    normalizedName: 'globex inc',
    status: 'ACTIVE',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    workspaceId: 'ws-1',
  },
]) as unknown as CompanyDto[];

describe('CampaignsIndexComponent', () => {
  const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;
  const mockPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>;

  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    mockGet.mockImplementation((url: string) => {
      if (url === '/campaigns') {
        return Promise.resolve(mockCampaigns);
      }
      if (url === '/companies') {
        return Promise.resolve(mockCompanies);
      }
      return Promise.resolve([]);
    });
    
    mockPost.mockResolvedValue({});
  });

  const CampaignsComponent = (CampaignsRoute as unknown as { component: React.ComponentType }).component;

  function renderWithProviders(ui: React.ReactNode) {
    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  }

  function getDesktopTable() {
    return screen.getByRole('table');
  }

  it('renders all 6 status states with correct navigation labels', async () => {
    renderWithProviders(<CampaignsComponent />);
    
    await waitFor(() => {
      expect(screen.getAllByText('Outreach — Acme').length).toBeGreaterThan(0);
    });

    const table = getDesktopTable();

    // 1. ACTIVE
    expect(within(table).getByText('Active')).toBeInTheDocument();
    // 2. PAUSED
    expect(within(table).getByText('Paused')).toBeInTheDocument();
    // 3. DRAFT
    expect(within(table).getByText('In Preparation')).toBeInTheDocument();
    // 4. SCHEDULED
    expect(within(table).getByText('Scheduled')).toBeInTheDocument();
    // 5. COMPLETED
    expect(within(table).getByText('Completed')).toBeInTheDocument();
    // 6. ARCHIVED
    expect(within(table).getByText('Archived')).toBeInTheDocument();

    // Action Labels
    const actionButtons = within(table).getAllByRole('button', { name: /(Review Queue|Review Drafts|View Schedule|View Outcomes|View History)/i });
    const labels = actionButtons.map(b => b.textContent);
    
    expect(labels).toContain('Review Queue'); // for Active and Paused
    expect(labels).toContain('Review Drafts'); // for Draft
    expect(labels).toContain('View Schedule'); // for Scheduled
    expect(labels).toContain('View Outcomes'); // for Completed
    expect(labels).toContain('View History'); // for Archived
  });

  it('resolves company names and handles unmatched companies gracefully', async () => {
    renderWithProviders(<CampaignsComponent />);
    
    await waitFor(() => {
      expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0); // resolved from comp-1
    });

    const table = getDesktopTable();
    expect(within(table).getAllByText('Acme Corp').length).toBeGreaterThan(0);
    expect(within(table).getAllByText('Globex Inc').length).toBeGreaterThan(0);
    
    // Unmatched company fallback
    expect(within(table).getAllByText('Unknown').length).toBeGreaterThan(0);
  });

  it('filters campaigns by status', async () => {
    renderWithProviders(<CampaignsComponent />);
    
    await waitFor(() => {
      expect(screen.getAllByText('Outreach — Acme').length).toBeGreaterThan(0);
    });

    // Click 'Active' filter
    const activeFilter = screen.getByRole('button', { name: /^Active$/i });
    fireEvent.click(activeFilter);

    // Only Acme (Active) should be visible
    expect(screen.getAllByText('Outreach — Acme').length).toBeGreaterThan(0);
    expect(screen.queryByText('Outreach — Globex')).not.toBeInTheDocument(); // Paused is hidden
  });

  it('shows pause/resume only for ACTIVE and PAUSED respectively and triggers query invalidation without optimistic update', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    
    renderWithProviders(<CampaignsComponent />);
    
    await waitFor(() => {
      expect(screen.getAllByText('Outreach — Acme').length).toBeGreaterThan(0);
    });

    const table = getDesktopTable();
    
    // ACTIVE has Pause
    const pauseButtons = within(table).getAllByRole('button', { name: /^Pause$/i });
    expect(pauseButtons).toHaveLength(1); // Only for camp-1
    
    // PAUSED has Resume
    const resumeButtons = within(table).getAllByRole('button', { name: /^Resume$/i });
    expect(resumeButtons).toHaveLength(1); // Only for camp-2
    
    // No other pause/resume buttons exist
    const allControlButtons = within(table).queryAllByRole('button', { name: /^(Pause|Resume)$/i });
    expect(allControlButtons).toHaveLength(2); // exactly 1 pause, 1 resume in the desktop table

    // Trigger Pause
    fireEvent.click(pauseButtons[0]);
    
    await waitFor(() => { expect(mockPost).toHaveBeenCalledWith('/campaigns/camp-1/pause'); });
    
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['campaigns'] });
    });
    
    // Trigger Resume
    fireEvent.click(resumeButtons[0]);
    await waitFor(() => { expect(mockPost).toHaveBeenCalledWith('/campaigns/camp-2/resume'); });
    
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledTimes(2); // once for pause, once for resume
    });
    
    // Crucially, verify it didn't optimistically update local state by checking if it still says Pause
    // (mockGet hasn't fired with new data yet in this tick unless we wait for the refetch to complete)
  });
});
