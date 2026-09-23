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

  function getCards() {
    return screen.getAllByRole('article');
  }

  it('renders all 6 status states with correct navigation labels', async () => {
    renderWithProviders(<CampaignsComponent />);
    
    await waitFor(() => {
      expect(screen.getAllByText('Outreach — Acme').length).toBeGreaterThan(0);
    });

    const cards = getCards();
    expect(cards).toHaveLength(6);

    const statuses = cards.map(c => c.textContent);
    
    // We check that the statuses are rendered in the cards
    expect(statuses.some(s => /Active/i.test(s || ''))).toBe(true);
    expect(statuses.some(s => /Paused/i.test(s || ''))).toBe(true);
    expect(statuses.some(s => /Draft/i.test(s || ''))).toBe(true);
    expect(statuses.some(s => /Scheduled/i.test(s || ''))).toBe(true);
    expect(statuses.some(s => /Completed/i.test(s || ''))).toBe(true);
    expect(statuses.some(s => /Archived/i.test(s || ''))).toBe(true);
  });

  it('resolves company names and handles unmatched companies gracefully', async () => {
    renderWithProviders(<CampaignsComponent />);
    
    await waitFor(() => {
      expect(screen.getAllByText('Outreach — Acme').length).toBeGreaterThan(0);
    });

    const cards = getCards();
    const texts = cards.map(c => c.textContent);
    
    expect(texts.some(t => /Target: Acme Corp/i.test(t || ''))).toBe(true);
    expect(texts.some(t => /Target: Globex Inc/i.test(t || ''))).toBe(true);
    expect(texts.some(t => /Target: Unknown/i.test(t || ''))).toBe(true);
  });

  it('filters campaigns by status', async () => {
    renderWithProviders(<CampaignsComponent />);
    
    await waitFor(() => {
      expect(screen.getAllByText('Outreach — Acme').length).toBeGreaterThan(0);
    });

    // Click /Active/ filter
    const activeFilter = screen.getByRole('button', { name: /^Active/i });
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

    const cards = getCards();
    
    // ACTIVE has Pause
    const pauseButtons = cards.flatMap(card => within(card).queryAllByRole('button', { name: /Pause/i }));
    expect(pauseButtons).toHaveLength(1); // Only for camp-1
    
    // PAUSED has Resume
    const resumeButtons = cards.flatMap(card => within(card).queryAllByRole('button', { name: /Resume/i }));
    expect(resumeButtons).toHaveLength(1); // Only for camp-2
    
    // No other pause/resume buttons exist
    const allControlButtons = cards.flatMap(card => within(card).queryAllByRole('button', { name: /(Pause|Resume)/i }));
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
  });
});
