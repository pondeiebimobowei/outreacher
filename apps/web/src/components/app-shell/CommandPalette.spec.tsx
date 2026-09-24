import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette } from './CommandPalette';

const mockNavigate = jest.fn();

jest.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));

describe('CommandPalette', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when open is false', () => {
    render(<CommandPalette open={false} onClose={mockOnClose} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders search input and commands when open is true', () => {
    render(<CommandPalette open={true} onClose={mockOnClose} />);

    expect(screen.getByRole('dialog', { name: /command palette/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /go to dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /add company/i })).toBeInTheDocument();
  });

  it('filters commands based on search query', () => {
    render(<CommandPalette open={true} onClose={mockOnClose} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'campaign' } });

    expect(screen.getByRole('option', { name: /create campaign/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /go to campaigns/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /go to dashboard/i })).not.toBeInTheDocument();
  });

  it('shows empty state when no commands match', () => {
    render(<CommandPalette open={true} onClose={mockOnClose} />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'xyznonexistent123' } });

    expect(screen.getByText(/no commands found/i)).toBeInTheDocument();
  });

  it('navigates with ArrowDown, ArrowUp, and selects with Enter', () => {
    render(<CommandPalette open={true} onClose={mockOnClose} />);

    const input = screen.getByRole('combobox');

    // First item is active (Add company)
    const firstOption = screen.getByRole('option', { name: /add company/i });
    expect(firstOption).toHaveAttribute('aria-selected', 'true');

    // Arrow down moves to next item (Create campaign)
    fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    const secondOption = screen.getByRole('option', { name: /create campaign/i });
    expect(secondOption).toHaveAttribute('aria-selected', 'true');

    // Enter executes the selected command
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/campaigns' });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape key press', () => {
    render(<CommandPalette open={true} onClose={mockOnClose} />);

    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('closes on clicking the backdrop', () => {
    render(<CommandPalette open={true} onClose={mockOnClose} />);

    const backdrop = screen.getByTestId('palette-backdrop');
    fireEvent.click(backdrop);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
