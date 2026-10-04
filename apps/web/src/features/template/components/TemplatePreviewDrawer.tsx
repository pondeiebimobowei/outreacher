import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { XIcon, AlertCircleIcon, ViewIcon } from '@hugeicons/core-free-icons';
import type { EmailTemplateDto, EmailTemplateStepDto } from '../../../api/templates';

interface TemplatePreviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  template: EmailTemplateDto | null;
}

const DEFAULT_SAMPLE_DATA: Record<string, string> = {
  'contact.firstName': 'Alex',
  'contact.lastName': 'Mercer',
  'contact.title': 'VP of Engineering',
  'company.name': 'Acme Technologies',
  'company.website': 'https://acme.example.com',
  'opportunity.title': 'Head of Distributed Systems',
  'recipient.role': 'Engineering Leader',
  'sender.name': 'Jordan Smith',
};

export function TemplatePreviewDrawer({
  isOpen,
  onClose,
  template,
}: TemplatePreviewDrawerProps) {
  const [selectedSequence, setSelectedSequence] = useState<number>(0);
  const [sampleData, setSampleData] = useState<Record<string, string>>(DEFAULT_SAMPLE_DATA);

  if (!isOpen || !template) return null;

  const steps = [...(template.steps || [])].sort((a, b) => a.sequence - b.sequence);
  const currentStep: EmailTemplateStepDto | undefined =
    steps.find((s) => s.sequence === selectedSequence) || steps[0];

  const renderText = (templateText: string) => {
    return templateText.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (match, key: string) => {
      const val = sampleData[key];
      if (val !== undefined && val.trim() !== '') {
        return val;
      }
      return match;
    });
  };

  const renderedSubject = currentStep ? renderText(currentStep.subjectTemplate) : '';
  const renderedBody = currentStep ? renderText(currentStep.bodyTemplate) : '';

  // Check unresolved placeholders
  const unresolvedMatches = [
    ...(renderedSubject.match(/\{\{([a-zA-Z0-9_.]+)\}\}/g) || []),
    ...(renderedBody.match(/\{\{([a-zA-Z0-9_.]+)\}\}/g) || []),
  ];
  const uniqueUnresolved = Array.from(new Set(unresolvedMatches));

  // Check if {{sender.name}} is used
  const hasSenderName =
    (currentStep?.subjectTemplate.includes('{{sender.name}}') ||
      currentStep?.bodyTemplate.includes('{{sender.name}}')) ??
    false;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-preview-title"
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs"
    >
      <div
        className="w-full max-w-xl bg-white border-l border-slate-200 h-full flex flex-col shadow-2xl overflow-hidden"
        style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={ViewIcon} size={20} className="text-slate-600" />
            <div>
              <h2 id="template-preview-title" className="text-base font-bold text-slate-900">
                Preview: {template.name}
              </h2>
              <p className="text-xs text-slate-500 font-normal">
                Render with simulated contact and opportunity data
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="p-1.5 rounded-none text-slate-400 hover:text-slate-600 hover:bg-slate-200"
          >
            <HugeiconsIcon icon={XIcon} size={18} />
          </button>
        </div>

        {/* Step Selector Tabs */}
        {steps.length > 1 && (
          <div className="flex border-b border-slate-200 bg-slate-100 px-6 pt-3 gap-2">
            {steps.map((step) => (
              <button
                key={step.sequence}
                type="button"
                onClick={() => setSelectedSequence(step.sequence)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-t-none border-t border-x ${
                  (currentStep?.sequence ?? 0) === step.sequence
                    ? 'bg-white border-slate-200 text-slate-900 border-b-transparent -mb-px'
                    : 'bg-slate-200 border-transparent text-slate-600 hover:bg-slate-100'
                }`}
              >
                {step.sequence === 0 ? 'Step 0 (Initial)' : `Step ${step.sequence} (Follow-up)`}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {hasSenderName && (
            <div
              role="alert"
              className="p-3 bg-amber-50 border border-amber-200 rounded-none text-amber-800 text-xs flex items-center gap-2 font-medium"
            >
              <HugeiconsIcon icon={AlertCircleIcon} size={16} className="text-amber-600 shrink-0" />
              <span>
                Cannot be used in campaigns (senders dynamically chosen at send time). Valid for direct outreach only.
              </span>
            </div>
          )}

          {uniqueUnresolved.length > 0 && (
            <div
              role="alert"
              className="p-3 bg-rose-50 border border-rose-200 rounded-none text-rose-800 text-xs flex items-center gap-2 font-medium"
            >
              <HugeiconsIcon icon={AlertCircleIcon} size={16} className="text-rose-600 shrink-0" />
              <span>
                Missing sample values for: {uniqueUnresolved.join(', ')}
              </span>
            </div>
          )}

          {/* Rendered Preview Card */}
          <div className="border border-slate-200 rounded-none bg-slate-50 p-4 space-y-3">
            <div className="border-b border-slate-200 pb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                Subject
              </span>
              <p className="text-sm font-semibold text-slate-900">
                {renderedSubject || <span className="text-slate-400 italic">No subject</span>}
              </p>
            </div>

            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Body
              </span>
              <div className="text-sm text-slate-800 whitespace-pre-wrap font-normal leading-relaxed">
                {renderedBody || <span className="text-slate-400 italic">No body</span>}
              </div>
            </div>
          </div>

          {/* Sample Data Configuration */}
          <div className="space-y-3 pt-4 border-t border-slate-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Sample Variables for Preview
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {Object.keys(DEFAULT_SAMPLE_DATA).map((key) => (
                <div key={key} className="space-y-1">
                  <label htmlFor={`sample-${key}`} className="block text-[11px] font-mono text-slate-600 truncate">
                    {`{{${key}}}`}
                  </label>
                  <input
                    id={`sample-${key}`}
                    type="text"
                    value={sampleData[key] ?? ''}
                    onChange={(e) =>
                      setSampleData((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded-none focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-none"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}
