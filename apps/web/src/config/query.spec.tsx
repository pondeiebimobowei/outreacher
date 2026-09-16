import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { queryClient } from './query';

const ConsumerComponent: React.FC = () => {
  const client = useQueryClient();
  const isCorrectClient = client === queryClient;

  return (
    <div>
      <span data-testid="client-check">
        {isCorrectClient ? 'MATCHED_QUERY_CLIENT' : 'MISMATCHED_QUERY_CLIENT'}
      </span>
    </div>
  );
};

describe('QueryClientProvider Integration', () => {
  it('provides the expected queryClient instance to child components via useQueryClient()', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <ConsumerComponent />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('client-check')).toHaveTextContent('MATCHED_QUERY_CLIENT');
  });
});
