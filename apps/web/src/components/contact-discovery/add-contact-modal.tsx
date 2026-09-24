import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';
import { ContactKind, createCompanyContact } from '../../api/contacts';

interface AddContactModalProps {
  companyId: string;
  companyName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function AddContactModal({
  companyId,
  companyName,
  isOpen,
  onClose,
}: AddContactModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [contactKind, setContactKind] = useState<ContactKind>('PERSON');
  const [sourceUrl, setSourceUrl] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState('');

  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
      modalRef.current?.focus();
    } else if (triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setEmail('');
      setTitle('');
      setContactKind('PERSON');
      setSourceUrl('');
      setErrors({});
      setAnnouncement('');
    }
  }, [isOpen]);

  const mutation = useMutation({
    mutationFn: (input: {
      name: string;
      email?: string | null;
      title?: string | null;
      contactKind?: ContactKind;
      sourceUrl?: string | null;
    }) => createCompanyContact(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-contacts', companyId] });
      setAnnouncement(`Contact ${name} added successfully.`);
      onClose();
    },
    onError: (err: Error) => {
      setErrors({ form: err.message || 'Failed to create contact.' });
    },
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    const trimmedName = name.trim();
    if (!trimmedName) {
      newErrors.name = 'Contact name is required.';
    }

    const trimmedEmail = email.trim();
    if (trimmedEmail) {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(trimmedEmail)) {
        newErrors.email = 'Please enter a valid email address (e.g. jane@acme.com) or leave blank.';
      }
    }

    const trimmedUrl = sourceUrl.trim();
    if (trimmedUrl) {
      try {
        const parsed = new URL(trimmedUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          newErrors.sourceUrl = 'Reference URL must start with http:// or https://';
        }
      } catch {
        newErrors.sourceUrl = 'Please enter a valid URL (e.g. https://acme.com/team)';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    mutation.mutate({
      name: trimmedName,
      email: trimmedEmail || null,
      title: title.trim() || null,
      contactKind,
      sourceUrl: trimmedUrl || null,
    });
  };

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-slate-50 rounded-none-none border border-slate-200  max-w-lg w-full p-6 space-y-5 focus:outline-none animate-in fade-in zoom-in-95  max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2
              className="text-base font-bold text-slate-900 tracking-tight"
              id="add-contact-modal-title"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Add Contact Manually
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Add a verified decision-maker or role address for {companyName}.
            </p>
          </div>
          <button
            aria-label="Close modal"
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-none-none hover:bg-slate-100  focus:outline-none focus:ring-2 focus:ring-slate-900"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </div>

        {errors.form && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-none-none text-xs text-rose-800 font-medium">
            {errors.form}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label
              className="block text-xs font-semibold text-slate-700 mb-1"
              htmlFor="contact-name-input"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              aria-describedby={errors.name ? 'contact-name-error' : undefined}
              aria-invalid={Boolean(errors.name)}
              className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-none-none -2xs focus:outline-none focus:ring-2 focus:ring-slate-900 text-slate-900 placeholder-slate-400 "
              id="contact-name-input"
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jane Doe"
              type="text"
              value={name}
            />
            {errors.name && (
              <p className="text-xs text-rose-600 mt-1 font-medium" id="contact-name-error">
                {errors.name}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                className="block text-xs font-semibold text-slate-700 mb-1"
                htmlFor="contact-email-input"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Email Address <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                aria-describedby={errors.email ? 'contact-email-error' : undefined}
                aria-invalid={Boolean(errors.email)}
                className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-none-none -2xs focus:outline-none focus:ring-2 focus:ring-slate-900 text-slate-900 placeholder-slate-400 "
                id="contact-email-input"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane.doe@acme.com"
                type="text"
                value={email}
              />
              {errors.email && (
                <p className="text-xs text-rose-600 mt-1 font-medium" id="contact-email-error">
                  {errors.email}
                </p>
              )}
            </div>

            <div>
              <label
                className="block text-xs font-semibold text-slate-700 mb-1"
                htmlFor="contact-title-input"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Role Title <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-none-none -2xs focus:outline-none focus:ring-2 focus:ring-slate-900 text-slate-900 placeholder-slate-400 "
                id="contact-title-input"
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VP of Engineering"
                type="text"
                value={title}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                className="block text-xs font-semibold text-slate-700 mb-1"
                htmlFor="contact-kind-select"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Contact Type
              </label>
              <select
                className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-none-none -2xs focus:outline-none focus:ring-2 focus:ring-slate-900 text-slate-900 bg-slate-50 "
                id="contact-kind-select"
                onChange={(e) => setContactKind(e.target.value as ContactKind)}
                value={contactKind}
              >
                <option value="PERSON">PERSON (Individual)</option>
                <option value="ROLE_ADDRESS">ROLE_ADDRESS (Functional Inbox)</option>
              </select>
            </div>

            <div>
              <label
                className="block text-xs font-semibold text-slate-700 mb-1"
                htmlFor="contact-url-input"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Reference URL <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                aria-describedby={errors.sourceUrl ? 'contact-url-error' : undefined}
                aria-invalid={Boolean(errors.sourceUrl)}
                className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-none-none -2xs focus:outline-none focus:ring-2 focus:ring-slate-900 text-slate-900 placeholder-slate-400 "
                id="contact-url-input"
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://acme.com/team"
                type="text"
                value={sourceUrl}
              />
              {errors.sourceUrl && (
                <p className="text-xs text-rose-600 mt-1 font-medium" id="contact-url-error">
                  {errors.sourceUrl}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 border-t border-slate-100 pt-4">
            <button
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-none-none  focus:outline-none focus:ring-2 focus:ring-slate-900"
              onClick={onClose}
              type="button"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-none-none -xs  focus:outline-none focus:ring-2 focus:ring-slate-900 inline-flex items-center space-x-1"
              disabled={mutation.isPending}
              type="submit"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {mutation.isPending ? 'Adding Contact...' : 'Add Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
