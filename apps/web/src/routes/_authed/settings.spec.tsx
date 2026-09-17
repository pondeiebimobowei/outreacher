import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Route } from './settings';
import { apiClient, ApiError } from '../../api/client';

jest.mock('../../api/client', () => ({
  apiClient: {
    get: jest.fn(),
    patch: jest.fn(),
  },
  ApiError: jest.requireActual('../../api/client').ApiError,
}));

jest.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
}));

describe('SettingsComponent (Career Profile UI)', () => {
  const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;
  const mockPatch = apiClient.patch as jest.MockedFunction<typeof apiClient.patch>;

  const initialProfile = {
    id: 'p1',
    workspaceId: 'w1',
    headline: 'Senior Backend Lead',
    summary: 'Building distributed systems',
    experienceSummary: '10 years experience',
    targetRoles: ['Staff Engineer'],
    targetIndustries: ['Fintech'],
    targetLocations: ['Remote'],
    skills: ['TypeScript', 'PostgreSQL'],
    portfolioUrl: 'https://portfolio.example.com',
    githubUrl: 'https://github.com/user',
    linkedinUrl: 'https://linkedin.com/in/user',
    websiteUrl: 'https://website.example.com',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const SettingsComponent = (Route as unknown as { component: React.ComponentType }).component;

  it('hydrates profile data from GET /profile on mount', async () => {
    mockGet.mockResolvedValueOnce(initialProfile);

    render(<SettingsComponent />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /career profile/i })).toBeInTheDocument();
    });

    expect(mockGet).toHaveBeenCalledWith('/profile');
    expect(screen.getByLabelText(/professional headline/i)).toHaveValue('Senior Backend Lead');
    expect(screen.getByLabelText(/professional summary/i)).toHaveValue(
      'Building distributed systems',
    );
    expect(screen.getByText('Staff Engineer')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
  });

  it('marks form as dirty and shows Unsaved changes badge when inputs change', async () => {
    mockGet.mockResolvedValueOnce(initialProfile);

    render(<SettingsComponent />);

    await waitFor(() => {
      expect(screen.getByLabelText(/professional headline/i)).toHaveValue('Senior Backend Lead');
    });

    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/professional headline/i), {
      target: { value: 'Principal Architect' },
    });

    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });

  it('submits updated profile payload via PATCH /profile with string-to-null mapping', async () => {
    mockGet.mockResolvedValueOnce(initialProfile);
    const updatedProfile = {
      ...initialProfile,
      headline: 'Principal Architect',
      portfolioUrl: null,
    };
    mockPatch.mockResolvedValueOnce(updatedProfile);

    render(<SettingsComponent />);

    await waitFor(() => {
      expect(screen.getByLabelText(/professional headline/i)).toHaveValue('Senior Backend Lead');
    });

    // Update headline and clear portfolio URL
    fireEvent.change(screen.getByLabelText(/professional headline/i), {
      target: { value: 'Principal Architect' },
    });
    fireEvent.change(screen.getByLabelText(/portfolio url/i), {
      target: { value: '' },
    });

    fireEvent.click(screen.getAllByRole('button', { name: /save profile/i })[0]);

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/profile', {
        headline: 'Principal Architect',
        summary: 'Building distributed systems',
        experienceSummary: '10 years experience',
        targetRoles: ['Staff Engineer'],
        targetIndustries: ['Fintech'],
        targetLocations: ['Remote'],
        skills: ['TypeScript', 'PostgreSQL'],
        portfolioUrl: null,
        githubUrl: 'https://github.com/user',
        linkedinUrl: 'https://linkedin.com/in/user',
        websiteUrl: 'https://website.example.com',
      });
    });

    expect(screen.getByText(/career profile saved successfully/i)).toBeInTheDocument();
    expect(screen.getByText(/^saved$/i)).toBeInTheDocument();
  });

  it('renders server validation error banner on 400 ApiError', async () => {
    mockGet.mockResolvedValueOnce(initialProfile);
    mockPatch.mockRejectedValueOnce(
      new ApiError(400, {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: ['portfolioUrl must be a URL address'],
      }),
    );

    render(<SettingsComponent />);

    await waitFor(() => {
      expect(screen.getByLabelText(/professional headline/i)).toHaveValue('Senior Backend Lead');
    });

    fireEvent.change(screen.getByLabelText(/portfolio url/i), {
      target: { value: 'invalid-url' },
    });

    fireEvent.click(screen.getAllByRole('button', { name: /save profile/i })[0]);

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/portfolioUrl must be a URL address/i);
    });

    // Form inputs preserved after error
    expect(screen.getByLabelText(/portfolio url/i)).toHaveValue('invalid-url');
  });

  it('allows adding and removing tags in TagInput', async () => {
    mockGet.mockResolvedValueOnce(initialProfile);

    render(<SettingsComponent />);

    await waitFor(() => {
      expect(screen.getByText('TypeScript')).toBeInTheDocument();
    });

    const skillsInput = screen.getByLabelText(/core skills/i);

    // Add new skill
    fireEvent.change(skillsInput, { target: { value: 'Docker' } });
    fireEvent.keyDown(skillsInput, { key: 'Enter', code: 'Enter' });

    expect(screen.getByText('Docker')).toBeInTheDocument();

    // Remove existing skill
    const removeBtn = screen.getByRole('button', { name: /remove typescript/i });
    fireEvent.click(removeBtn);

    expect(screen.queryByText('TypeScript')).not.toBeInTheDocument();
  });
});
