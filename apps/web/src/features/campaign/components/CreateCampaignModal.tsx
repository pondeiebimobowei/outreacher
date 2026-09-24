import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { XIcon, AlertCircleIcon, ArrowRightIcon } from '@hugeicons/core-free-icons';;
import { useNavigate } from '@tanstack/react-router';
import type { CompanyDto } from '../../../api/companies';

interface CreateCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  companies: CompanyDto[];
}

export function CreateCampaignModal({
  isOpen,
  onClose,
  companies,
}: CreateCampaignModalProps) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-campaign-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
    >
      <div
        className="w-full max-w-lg rounded-none-none bg-slate-50 border border-slate-200  overflow-hidden flex flex-col max-h-[90vh]"
        style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 id="create-campaign-title" className="text-lg font-bold text-slate-900">
              Create Campaign
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-normal" style={{ fontFamily: 'sans-serif' }}>
              Define a new outreach initiative for a target company
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded-none-none text-slate-400 hover:text-slate-600 hover:bg-slate-100 "
          >
            <HugeiconsIcon icon={XIcon} size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Campaign Name */}
          <div className="space-y-1.5">
            <label htmlFor="campaign-name" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Campaign Name
            </label>
            <input
              id="campaign-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Outreach — Acme Corp"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-none-none focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium text-slate-900 placeholder-slate-400"
              style={{ fontFamily: 'sans-serif' }}
            />
          </div>

          {/* Target Company */}
          <div className="space-y-1.5">
            <label htmlFor="campaign-company" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Target Company
            </label>
            <select
              id="campaign-company"
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-none-none focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium text-slate-900 bg-slate-50"
              style={{ fontFamily: 'sans-serif' }}
            >
              <option value="">Select a company...</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Template Limitation Notice */}
          <div
            role="status"
            className="p-4 rounded-none-none bg-amber-50 border border-amber-200 text-amber-900 space-y-2"
          >
            <div className="flex items-center gap-2 font-bold text-xs">
              <HugeiconsIcon icon={AlertCircleIcon} size={16} className="text-amber-600 shrink-0" />
              <span>Campaign Creation Deferred: Template Required</span>
            </div>
            <p className="text-xs leading-relaxed text-amber-800" style={{ fontFamily: 'sans-serif' }}>
              The production API requires a valid <code className="font-mono text-[11px] bg-amber-100 px-1 py-0.5 rounded-none">templateId</code> to create a campaign, but no public template endpoints are currently exposed. Arbitrary campaign creation from this form is deferred until template support is available.
            </p>
            <p className="text-xs text-amber-800 pt-1 border-t border-amber-200" style={{ fontFamily: 'sans-serif' }}>
              To engage contacts today, use <strong>Contact Discovery</strong> on any company page to discover decision-makers and review outreach.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              if (selectedCompanyId) {
                void navigate({ to: '/companies/$id', params: { id: selectedCompanyId } });
              } else {
                void navigate({ to: '/companies' });
              }
            }}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1  order-2 sm:order-1"
          >
            Go to Contact Discovery <HugeiconsIcon icon={ArrowRightIcon} size={12} />
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end order-1 sm:order-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-none-none "
            >
              Cancel
            </button>
            <button
              type="button"
              disabled
              title="Campaign creation is deferred because the production API requires templateId but exposes no template endpoint"
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-400 rounded-none-none cursor-not-allowed opacity-75 -xs"
            >
              Create Campaign (Deferred)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
