import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { EvaluatedPersonDto } from '../../api/contacts';
import { ContactCard } from './contact-card';

describe('ContactCard Component - BL-011 Evidence Count & Canonical Rationale Display', () => {
  const baseContact: EvaluatedPersonDto = {
    id: 'person-1',
    workspaceId: 'ws-1',
    personKind: 'PERSON',
    firstName: 'Sarah',
    lastName: 'Connor',
    email: 'sarah@cyberdyne.com',
    title: 'Security Director',
    source: 'COMPANY_WEBSITE',
    sourceUrl: 'https://cyberdyne.com/team',
    confidence: 'HIGH',
    emailConfidence: 'AVAILABLE',
    discoveredAt: '2026-10-01T00:00:00Z',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    relevance: 'HIGH',
    recommendationRationale: 'Direct hiring authority for security operations.',
    isSelected: false,
  };

  it('renders recommendationRationale in the Why This Contact block', () => {
    render(
      <ContactCard
        contact={baseContact}
        onSelect={jest.fn()}
        isSelectPending={false}
      />,
    );

    expect(screen.getByText(/Why This Contact:/i)).toBeInTheDocument();
    expect(
      screen.getByText('Direct hiring authority for security operations.'),
    ).toBeInTheDocument();
  });

  it('does NOT render evidence chip when evidenceIds is undefined or empty', () => {
    const { rerender } = render(
      <ContactCard
        contact={{ ...baseContact, evidenceIds: undefined }}
        onSelect={jest.fn()}
        isSelectPending={false}
      />,
    );

    expect(screen.queryByText(/Evidence:/i)).not.toBeInTheDocument();

    rerender(
      <ContactCard
        contact={{ ...baseContact, evidenceIds: [] }}
        onSelect={jest.fn()}
        isSelectPending={false}
      />,
    );

    expect(screen.queryByText(/Evidence:/i)).not.toBeInTheDocument();
  });

  it('renders neutral Evidence: N items indicator when evidenceIds has items', () => {
    render(
      <ContactCard
        contact={{ ...baseContact, evidenceIds: ['ev-1', 'ev-2', 'ev-3'] }}
        onSelect={jest.fn()}
        isSelectPending={false}
      />,
    );

    expect(screen.getByText('Evidence: 3 items')).toBeInTheDocument();
  });

  it('handles singular items count correctly (Evidence: 1 item)', () => {
    render(
      <ContactCard
        contact={{ ...baseContact, evidenceIds: ['ev-1'] }}
        onSelect={jest.fn()}
        isSelectPending={false}
      />,
    );

    expect(screen.getByText('Evidence: 1 item')).toBeInTheDocument();
  });

  it('preserves existing relevance, identity confidence, and email badges', () => {
    render(
      <ContactCard
        contact={{
          ...baseContact,
          relevance: 'HIGH',
          confidence: 'MEDIUM',
          emailConfidence: 'AVAILABLE',
        }}
        onSelect={jest.fn()}
        isSelectPending={false}
      />,
    );

    expect(screen.getByText('Relevance: HIGH')).toBeInTheDocument();
    expect(screen.getByText('Identity: MEDIUM')).toBeInTheDocument();
    expect(screen.getByText('Email: AVAILABLE')).toBeInTheDocument();
  });
});
