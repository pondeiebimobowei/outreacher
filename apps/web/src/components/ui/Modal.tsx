import { useEffect, useRef, ReactNode, forwardRef, useImperativeHandle } from 'react';

export function useModalFocus(isOpen: boolean, onClose: () => void, modalRef: React.RefObject<HTMLElement>, preventClose?: boolean) {
  const onCloseRef = useRef(onClose);
  const preventCloseRef = useRef(preventClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    preventCloseRef.current = preventClose;
  }, [preventClose]);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!preventCloseRef.current) {
          onCloseRef.current();
        }
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) as NodeListOf<HTMLElement>;
        
        if (focusableElements.length === 0) return;
        
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || document.activeElement === modalRef.current) {
            lastElement?.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement?.focus();
            e.preventDefault();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus when modal unmounts
      setTimeout(() => previousFocus?.focus(), 0);
    };
  }, [isOpen, modalRef]);
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  preventClose?: boolean;
}

export const Modal = forwardRef<HTMLDivElement, ModalProps>(
  ({ isOpen, onClose, children, maxWidth = 'md', preventClose }, ref) => {
    const internalRef = useRef<HTMLDivElement>(null);
    
    useImperativeHandle(ref, () => internalRef.current as HTMLDivElement);
    
    useModalFocus(isOpen, onClose, internalRef as React.RefObject<HTMLElement>, preventClose);

    if (!isOpen) return null;

    const maxWidthClasses = {
      sm: 'max-w-sm',
      md: 'max-w-md',
      lg: 'max-w-lg',
      xl: 'max-w-xl',
      '2xl': 'max-w-2xl',
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
        <div 
          ref={internalRef}
          tabIndex={-1}
          className={`bg-slate-50 rounded-none-none  w-full ${maxWidthClasses[maxWidth]} overflow-hidden focus:outline-none`}
          role="dialog" 
          aria-modal="true" 
          aria-labelledby="modal-title"
        >
          {children}
        </div>
      </div>
    );
  }
);
Modal.displayName = 'Modal';
