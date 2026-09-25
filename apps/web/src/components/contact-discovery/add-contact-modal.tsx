import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCompanyContact, CreateContactRequest, PersonKind } from '../../api/contacts';

interface AddContactModalProps {
  companyId: string;
  companyName: string;
  onClose: () => void;
  setAnnouncement: (msg: string) => void;
}

export function AddContactModal({
  companyId,
  companyName,
  onClose,
  setAnnouncement,
}: AddContactModalProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [personKind, setPersonKind] = useState<PersonKind>('PERSON');
  const [sourceUrl, setSourceUrl] = useState('');

  const [errors, setErrors] = useState<{
    firstName?: string;
    lastName?: string;
    email?: string;
    sourceUrl?: string;
    form?: string;
  }>({});
  
  const queryClient = useQueryClient();
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    modalRef.current?.focus();
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const mutation = useMutation({
    mutationFn: (input: CreateContactRequest) => createCompanyContact(companyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-contacts', companyId] });
      setAnnouncement(`Contact ${firstName} ${lastName} added successfully.`);
      onClose();
    },
    onError: (error: Error) => {
      setErrors((prev) => ({
        ...prev,
        form: error.message || 'Failed to add contact. Please try again.',
      }));
    },
  });

  const validate = () => {
    const newErrors: typeof errors = {};
    if (!firstName.trim()) newErrors.firstName = 'First Name is required';
    if (!lastName.trim()) newErrors.lastName = 'Last Name is required';
    
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    
    if (sourceUrl) {
      try {
        new URL(sourceUrl);
      } catch {
        newErrors.sourceUrl = 'Please enter a valid absolute URL (e.g., https://example.com)';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    
    mutation.mutate({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim() || null,
      title: title.trim() || null,
      personKind: personKind,
      sourceUrl: sourceUrl.trim() || null,
    });
  };

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {/* Screen reader announcement */}
      </div>

      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-slate-50 rounded-none-none border border-slate-200 max-w-lg w-full p-6 space-y-5 focus:outline-none animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto"
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
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-none-none hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                className="block text-xs font-semibold text-slate-700 mb-1"
                htmlFor="contact-firstname-input"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                First Name <span className="text-rose-500">*</span>
              </label>
              <input
                aria-describedby={errors.firstName ? 'contact-firstname-error' : undefined}
                aria-invalid={Boolean(errors.firstName)}
                className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-none-none -2xs focus:outline-none focus:ring-2 focus:ring-slate-900 text-slate-900 placeholder-slate-400"
                id="contact-firstname-input"
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g. Jane"
                type="text"
                value={firstName}
              />
              {errors.firstName && (
                <p className="text-xs text-rose-600 mt-1 font-medium" id="contact-firstname-error">
                  {errors.firstName}
                </p>
              )}
            </div>
            <div>
              <label
                className="block text-xs font-semibold text-slate-700 mb-1"
                htmlFor="contact-lastname-input"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Last Name <span className="text-rose-500">*</span>
              </label>
              <input
                aria-describedby={errors.lastName ? 'contact-lastname-error' : undefined}
                aria-invalid={Boolean(errors.lastName)}
                className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-none-none -2xs focus:outline-none focus:ring-2 focus:ring-slate-900 text-slate-900 placeholder-slate-400"
                id="contact-lastname-input"
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g. Doe"
                type="text"
                value={lastName}
              />
              {errors.lastName && (
                <p className="text-xs text-rose-600 mt-1 font-medium" id="contact-lastname-error">
                  {errors.lastName}
                </p>
              )}
            </div>
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
                className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-none-none -2xs focus:outline-none focus:ring-2 focus:ring-slate-900 text-slate-900 placeholder-slate-400"
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
                className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-none-none -2xs focus:outline-none focus:ring-2 focus:ring-slate-900 text-slate-900 placeholder-slate-400"
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
                className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-none-none -2xs focus:outline-none focus:ring-2 focus:ring-slate-900 text-slate-900 bg-slate-50"
                id="contact-kind-select"
                onChange={(e) => setPersonKind(e.target.value as PersonKind)}
                value={personKind}
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
                className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-none-none -2xs focus:outline-none focus:ring-2 focus:ring-slate-900 text-slate-900 placeholder-slate-400"
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
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-none-none focus:outline-none focus:ring-2 focus:ring-slate-900"
              onClick={onClose}
              type="button"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-none-none -xs focus:outline-none focus:ring-2 focus:ring-slate-900 inline-flex items-center space-x-1"
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
