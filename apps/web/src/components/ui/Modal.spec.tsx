import { render, fireEvent } from '@testing-library/react';
import { Modal } from './Modal';
import '@testing-library/jest-dom';

describe('Modal component', () => {
  it('calls onClose when Escape is pressed and preventClose is false/undefined', () => {
    const handleClose = jest.fn();
    render(
      <Modal isOpen={true} onClose={handleClose}>
        <div>Modal Content</div>
      </Modal>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose when Escape is pressed and preventClose is true', () => {
    const handleClose = jest.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} preventClose={true}>
        <div>Modal Content</div>
      </Modal>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).not.toHaveBeenCalled();
  });
});
