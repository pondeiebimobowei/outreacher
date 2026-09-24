import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { CreateCampaignModal } from './CreateCampaignModal';
import type { CompanyDto } from '../../../api/companies';

const mockNavigate = jest.fn();

jest.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

const mockCompanies: CompanyDto[] = [
  {
    id: 'co-1',
    name: 'Acme Corp',
    normalizedName: 'acme corp',
    websiteUrl: 'https://acme.com',
    domain: 'acme.com',
    description: 'Acme corporation',
    industry: 'Technology',
    location: 'San Francisco, CA',
    linkedinUrl: null,
    status: 'ACTIVE',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    workspaceId: 'ws-1',
  },
  {
    id: 'co-2',
    name: 'Globex Inc',
    normalizedName: 'globex inc',
    websiteUrl: 'https://globex.com',
    domain: 'globex.com',
    description: 'Globex corporation',
    industry: 'Defense',
    location: 'New York, NY',
    linkedinUrl: null,
    status: 'ACTIVE',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    workspaceId: 'ws-1',
  },
];

describe('CreateCampaignModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    render(
      <CreateCampaignModal
        isOpen={false}
        onClose={jest.fn()}
        companies={mockCompanies}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders modal dialog with company options and deferred notice when open', () => {
    render(
      <CreateCampaignModal
        isOpen={true}
        onClose={jest.fn()}
        companies={mockCompanies}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Create Campaign')).toBeInTheDocument();
    expect(screen.getByText(/Campaign Creation Deferred: Template Required/i)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Acme Corp' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Globex Inc' })).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /create campaign \(deferred\)/i });
    expect(submitBtn).toBeDisabled();
  });

  it('calls onClose when close button or Cancel is clicked', () => {
    const onClose = jest.fn();
    render(
      <CreateCampaignModal
        isOpen={true}
        onClose={onClose}
        companies={mockCompanies}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('navigates to contact discovery when link is clicked', () => {
    const onClose = jest.fn();
    render(
      <CreateCampaignModal
        isOpen={true}
        onClose={onClose}
        companies={mockCompanies}
      />,
    );

    // Click without company selected -> navigates to /companies
    fireEvent.click(screen.getByRole('button', { name: /go to contact discovery/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/companies' });

    // Select company and click again
    fireEvent.change(screen.getByRole('combobox', { name: /target company/i }), {
      target: { value: 'co-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /go to contact discovery/i }));
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/companies/$id', params: { id: 'co-1' } });
  });
});
