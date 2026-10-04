import React, { useState, useEffect } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { XIcon, PlusIcon, Delete02Icon, AlertCircleIcon } from '@hugeicons/core-free-icons';
import {
  ALLOWED_PLACEHOLDERS,
  createTemplate,
  fetchTemplateById,
  setTemplateSteps,
  updateTemplate,
  type EmailTemplateDto,
} from '../../../api/templates';
import { ApiError } from '../../../api/client';

interface StepDraft {
  sequence: number;
  subjectTemplate: string;
  bodyTemplate: string;
}

interface TemplateEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateId?: string | null;
  onSaveSuccess: () => void;
}

export function TemplateEditorModal({
  isOpen,
  onClose,
  templateId,
  onSaveSuccess,
}: TemplateEditorModalProps) {
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<StepDraft[]>([
    { sequence: 0, subjectTemplate: '', bodyTemplate: '' },
  ]);
  const [focusedField, setFocusedField] = useState<{
    sequence: number;
    field: 'subject' | 'body';
  }>({ sequence: 0, field: 'subject' });
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setSteps([{ sequence: 0, subjectTemplate: '', bodyTemplate: '' }]);
      setErrorMessage(null);
      return;
    }

    if (templateId) {
      setIsLoadingDetails(true);
      fetchTemplateById(templateId)
        .then((data: EmailTemplateDto) => {
          setName(data.name);
          if (data.steps && data.steps.length > 0) {
            const sorted = [...data.steps]
              .sort((a, b) => a.sequence - b.sequence)
              .map((s) => ({
                sequence: s.sequence,
                subjectTemplate: s.subjectTemplate,
                bodyTemplate: s.bodyTemplate,
              }));
            setSteps(sorted);
          } else {
            setSteps([{ sequence: 0, subjectTemplate: '', bodyTemplate: '' }]);
          }
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Failed to load template details';
          setErrorMessage(msg);
        })
        .finally(() => setIsLoadingDetails(false));
    } else {
      setName('');
      setSteps([{ sequence: 0, subjectTemplate: '', bodyTemplate: '' }]);
      setErrorMessage(null);
    }
  }, [isOpen, templateId]);

  if (!isOpen) return null;

  const handleAddStep = () => {
    const nextSeq = steps.length;
    setSteps((prev) => [
      ...prev,
      { sequence: nextSeq, subjectTemplate: '', bodyTemplate: '' },
    ]);
  };

  const handleRemoveStep = (sequence: number) => {
    const updated = steps
      .filter((s) => s.sequence !== sequence)
      .map((s, idx) => ({ ...s, sequence: idx }));
    setSteps(updated);
  };

  const handleInsertPlaceholder = (placeholder: string) => {
    const chipText = `{{${placeholder}}}`;
    setSteps((prev) =>
      prev.map((s) => {
        if (s.sequence !== focusedField.sequence) return s;
        if (focusedField.field === 'subject') {
          return { ...s, subjectTemplate: s.subjectTemplate + chipText };
        } else {
          return { ...s, bodyTemplate: s.bodyTemplate + chipText };
        }
      }),
    );
  };

  // Check if any step contains {{sender.name}}
  const hasSenderNameInAnyStep = steps.some(
    (s) =>
      s.subjectTemplate.includes('{{sender.name}}') ||
      s.bodyTemplate.includes('{{sender.name}}'),
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Template name is required.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      if (templateId) {
        // Updating existing template
        await updateTemplate(templateId, { name: name.trim() });
        await setTemplateSteps(templateId, {
          steps: steps.map((s, idx) => ({
            sequence: idx,
            subjectTemplate: s.subjectTemplate,
            bodyTemplate: s.bodyTemplate,
          })),
        });
      } else {
        // Creating new template
        await createTemplate({
          name: name.trim(),
          steps: steps.map((s, idx) => ({
            sequence: idx,
            subjectTemplate: s.subjectTemplate,
            bodyTemplate: s.bodyTemplate,
          })),
        });
      }

      onSaveSuccess();
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.statusCode === 409 && templateId) {
          setErrorMessage(`Conflict: ${err.message}`);
          try {
            const fresh = await fetchTemplateById(templateId);
            setName(fresh.name);
            setSteps(
              fresh.steps.map((s) => ({
                sequence: s.sequence,
                subjectTemplate: s.subjectTemplate,
                bodyTemplate: s.bodyTemplate,
              })),
            );
          } catch {
            // Keep existing form state if reload fails
          }
        } else {
          setErrorMessage(err.message);
        }
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('An unexpected error occurred while saving the template.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const isEditing = Boolean(templateId);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? 'Edit Email Template' : 'Create Email Template'}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
    >
      <div
        className="w-full max-w-3xl bg-white border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] shadow-2xl rounded-none"
        style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isEditing ? 'Edit Email Template' : 'Create Email Template'}
            </h2>
            <p className="text-xs text-slate-500 font-normal">
              Manage ordered outreach sequences and follow-up templates
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded-none text-slate-400 hover:text-slate-600 hover:bg-slate-200"
          >
            <HugeiconsIcon icon={XIcon} size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {errorMessage && (
              <div
                role="alert"
                className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2"
              >
                <HugeiconsIcon icon={AlertCircleIcon} size={16} className="text-rose-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {hasSenderNameInAnyStep && (
              <div
                role="status"
                className="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-center gap-2"
              >
                <HugeiconsIcon icon={AlertCircleIcon} size={16} className="text-amber-600 shrink-0" />
                <span>
                  Cannot be used in campaigns (senders dynamically chosen at send time). Valid for direct outreach only.
                </span>
              </div>
            )}

            {/* Template Name */}
            <div className="space-y-1.5">
              <label htmlFor="template-name" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Template Name
              </label>
              <input
                id="template-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Executive Introduction Sequence"
                disabled={isLoadingDetails || isSaving}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-none focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            {/* Placeholder Chip Insertion Bar */}
            <div className="p-3 bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                Insert Personalization Placeholder
              </span>
              <div className="flex flex-wrap gap-1.5">
                {ALLOWED_PLACEHOLDERS.map((placeholder) => (
                  <button
                    key={placeholder}
                    type="button"
                    onClick={() => handleInsertPlaceholder(placeholder)}
                    aria-label={`{{${placeholder}}}`}
                    className="px-2 py-0.5 text-[11px] font-mono bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 rounded-none cursor-pointer"
                  >
                    {`{{${placeholder}}}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Ordered Steps */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Sequenced Steps ({steps.length})
                </span>
                <button
                  type="button"
                  onClick={handleAddStep}
                  disabled={isLoadingDetails || isSaving}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-none"
                >
                  <HugeiconsIcon icon={PlusIcon} size={14} /> Add Step
                </button>
              </div>

              {steps.map((step) => (
                <div
                  key={step.sequence}
                  className="p-4 border border-slate-200 rounded-none bg-white space-y-3 relative"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-slate-900">
                      {step.sequence === 0
                        ? 'Step 0 — Initial Message'
                        : `Step ${step.sequence} — Follow-up ${step.sequence}`}
                    </span>
                    {step.sequence > 0 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveStep(step.sequence)}
                        aria-label={`Remove Step ${step.sequence}`}
                        disabled={isSaving}
                        className="text-xs text-rose-600 hover:text-rose-800 inline-flex items-center gap-1 font-semibold"
                      >
                        <HugeiconsIcon icon={Delete02Icon} size={13} /> Remove Step {step.sequence}
                      </button>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor={`step-${step.sequence}-subject`}
                      className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider"
                    >
                      {`Step ${step.sequence} Subject`}
                    </label>
                    <input
                      id={`step-${step.sequence}-subject`}
                      type="text"
                      value={step.subjectTemplate}
                      onFocus={() =>
                        setFocusedField({ sequence: step.sequence, field: 'subject' })
                      }
                      onChange={(e) =>
                        setSteps((prev) =>
                          prev.map((s) =>
                            s.sequence === step.sequence
                              ? { ...s, subjectTemplate: e.target.value }
                              : s,
                          ),
                        )
                      }
                      placeholder={
                        step.sequence === 0
                          ? 'e.g. Conversation with {{contact.firstName}}'
                          : 'e.g. Re: Conversation with {{contact.firstName}}'
                      }
                      disabled={isLoadingDetails || isSaving}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-none focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor={`step-${step.sequence}-body`}
                      className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider"
                    >
                      {`Step ${step.sequence} Body`}
                    </label>
                    <textarea
                      id={`step-${step.sequence}-body`}
                      rows={4}
                      value={step.bodyTemplate}
                      onFocus={() =>
                        setFocusedField({ sequence: step.sequence, field: 'body' })
                      }
                      onChange={(e) =>
                        setSteps((prev) =>
                          prev.map((s) =>
                            s.sequence === step.sequence
                              ? { ...s, bodyTemplate: e.target.value }
                              : s,
                          ),
                        )
                      }
                      placeholder="e.g. Hi {{contact.firstName}}, I noticed {{company.name}} is expanding..."
                      disabled={isLoadingDetails || isSaving}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-none focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || isLoadingDetails}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-none disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
