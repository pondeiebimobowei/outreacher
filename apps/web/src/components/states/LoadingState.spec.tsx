import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { LoadingState } from './LoadingState';

describe('LoadingState Component', () => {
  it('should render default loading message', () => {
    render(<LoadingState />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should render custom loading message when provided', () => {
    render(<LoadingState message="Fetching workspace data..." />);
    expect(screen.getByText('Fetching workspace data...')).toBeDefined();
  });
});
