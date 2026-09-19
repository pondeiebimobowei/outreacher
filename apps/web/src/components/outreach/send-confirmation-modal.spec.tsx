import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SendConfirmationModal } from './send-confirmation-modal';

describe('SendConfirmationModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    contactName: 'Sarah Connor',
    contactTitle: 'VP of Engineering',
    companyName: 'Acme Corp',
    recipientEmail: 'sarah@acme.com',
    subject: 'Acme Distributed Architecture',
    bodyPreview: 'I saw Acme is scaling...',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders dialog with recipient summary and subject', () => {
    render(<SendConfirmationModal {...defaultProps} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Confirm Outreach Dispatch')).toBeInTheDocument();
    expect(
      screen.getByText(/Sarah Connor · VP of Engineering · Acme Corp/),
    ).toBeInTheDocument();
    expect(screen.getByText('sarah@acme.com')).toBeInTheDocument();
    expect(screen.getByText('Acme Distributed Architecture')).toBeInTheDocument();
    expect(screen.getByText(/I saw Acme is scaling/)).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<SendConfirmationModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onClose when Cancel button is clicked', () => {
    render(<SendConfirmationModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    expect(defaultProps.onConfirm).not.toHaveBeenCalled();
  });

  it('calls onClose on Escape key', () => {
    render(<SendConfirmationModal {...defaultProps} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm(false) by default when Confirm & Send is clicked', () => {
    render(<SendConfirmationModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Send' }));
    expect(defaultProps.onConfirm).toHaveBeenCalledWith(false);
  });

  it('calls onConfirm(true) when checkbox is toggled and Confirm & Send is clicked', () => {
    render(<SendConfirmationModal {...defaultProps} />);
    const checkbox = screen.getByRole('checkbox', {
      name: "Don't ask again for single sends",
    });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm & Send' }));
    expect(defaultProps.onConfirm).toHaveBeenCalledWith(true);
  });
});
