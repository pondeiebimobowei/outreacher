import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PreDispatchHold } from './pre-dispatch-hold';

describe('PreDispatchHold', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders countdown text and progress bar', () => {
    render(
      <PreDispatchHold
        contactName="Sarah Connor"
        onCancel={jest.fn()}
        onComplete={jest.fn()}
      />,
    );

    expect(screen.getByText(/Sending to Sarah Connor in 5s\.\.\./)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel Send' })).toBeInTheDocument();
  });

  it('calls onCancel when Cancel Send button is clicked', () => {
    const onCancel = jest.fn();
    const onComplete = jest.fn();

    render(<PreDispatchHold onCancel={onCancel} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Send' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('updates countdown text as time elapses and triggers onComplete when done', () => {
    const onCancel = jest.fn();
    const onComplete = jest.fn();

    render(
      <PreDispatchHold
        durationMs={5000}
        onCancel={onCancel}
        onComplete={onComplete}
      />,
    );

    expect(onComplete).not.toHaveBeenCalled();

    // Advance 2 seconds
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(onComplete).not.toHaveBeenCalled();

    // Advance remaining 3 seconds
    act(() => {
      jest.advanceTimersByTime(3100);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
