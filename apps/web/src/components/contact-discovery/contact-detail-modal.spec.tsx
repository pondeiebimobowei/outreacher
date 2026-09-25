import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { EvaluatedPersonDto } from '../../api/contacts';
import { ContactDetailModal } from './contact-detail-modal';

describe('ContactDetailModal Component', () => {
  const mockOnClose = jest.fn();
  const mockOnSelect = jest.fn();

  const mockContact: EvaluatedPersonDto = {
    id: 'cont-100',
    workspaceId: 'ws-1',
    companyId: 'comp-1',
    personKind: 'PERSON',
    firstName: 'Jane',
    lastName: 'Doe',
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
    recommendationRationale: "Role 'VP of Engineering' directly matches opening.",
    isSelected: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when isOpen is false or contact is null', () => {
    render(
      <ContactDetailModal
        isOpen={false}
        onClose={mockOnClose}
        contact={mockContact}
        companyName="Acme Corp"
        onSelect={mockOnSelect}
        isSelectPending={false}
      />,
    );
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();

    render(
      <ContactDetailModal
        isOpen={true}
        onClose={mockOnClose}
        contact={null}
        companyName="Acme Corp"
        onSelect={mockOnSelect}
        isSelectPending={false}
      />,
    );
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
  });

  it('renders contact identity, rationale, evidence, and Source Page link label', () => {
    render(
      <ContactDetailModal
        isOpen={true}
        onClose={mockOnClose}
        contact={mockContact}
        companyName="Acme Corp"
        onSelect={mockOnSelect}
        isSelectPending={false}
      />,
    );

    expect(screen.getByRole('heading', { name: /Jane Doe/ })).toBeInTheDocument();
    expect(screen.getAllByText(/VP of Engineering/i)).not.toHaveLength(0);
    expect(
      screen.getByText("Role 'VP of Engineering' directly matches opening."),
    ).toBeInTheDocument();
    expect(screen.getByText('Source Page:')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View Source Page/i })).toHaveAttribute(
      'href',
      'https://acme.com/team',
    );
  });

  it('triggers onSelect when Select Target Contact is clicked', () => {
    render(
      <ContactDetailModal
        isOpen={true}
        onClose={mockOnClose}
        contact={mockContact}
        companyName="Acme Corp"
        onSelect={mockOnSelect}
        isSelectPending={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Select Target Contact/i }));

    expect(mockOnSelect).toHaveBeenCalledWith('cont-100');
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('renders selected state badge when contact is already selected', () => {
    render(
      <ContactDetailModal
        isOpen={true}
        onClose={mockOnClose}
        contact={{ ...mockContact, isSelected: true }}
        companyName="Acme Corp"
        onSelect={mockOnSelect}
        isSelectPending={false}
      />,
    );

    expect(screen.getByText('✓ Selected Target')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Select Target Contact/i }),
    ).not.toBeInTheDocument();
  });

  it('closes on Escape keypress', () => {
    render(
      <ContactDetailModal
        isOpen={true}
        onClose={mockOnClose}
        contact={mockContact}
        companyName="Acme Corp"
        onSelect={mockOnSelect}
        isSelectPending={false}
      />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(mockOnClose).toHaveBeenCalled();
  });
});
