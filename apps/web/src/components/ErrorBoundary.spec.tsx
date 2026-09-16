import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ErrorBoundary } from './ErrorBoundary';

const ProblemChild: React.FC<{ shouldThrow?: boolean }> = ({ shouldThrow = false }) => {
  if (shouldThrow) {
    throw new Error('Sensitive internal database memory leak details');
  }
  return <div>Normal Content</div>;
};

describe('ErrorBoundary', () => {
  const originalConsoleError = console.error;

  beforeAll(() => {
    console.error = jest.fn();
  });

  afterAll(() => {
    console.error = originalConsoleError;
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Normal Content')).toBeInTheDocument();
  });

  it('masks raw exception messages in production mode', () => {
    render(
      <ErrorBoundary isProduction={true}>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Application Error')).toBeInTheDocument();
    expect(
      screen.getByText('An unexpected application error occurred. Please try again.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Sensitive internal database memory leak details'),
    ).not.toBeInTheDocument();
  });

  it('allows resetting error state via reload button', () => {
    let throwError = true;
    const DynamicChild = () => {
      if (throwError) {
        throw new Error('Temporary glitch');
      }
      return <div>Recovered Content</div>;
    };

    const { rerender } = render(
      <ErrorBoundary isProduction={true}>
        <DynamicChild />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Application Error')).toBeInTheDocument();

    throwError = false;
    fireEvent.click(screen.getByRole('button', { name: /reload page/i }));

    rerender(
      <ErrorBoundary isProduction={true}>
        <DynamicChild />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Recovered Content')).toBeInTheDocument();
  });
});
