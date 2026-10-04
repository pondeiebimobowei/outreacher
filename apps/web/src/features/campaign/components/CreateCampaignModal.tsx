import React, { useState, useEffect } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { XIcon, AlertCircleIcon } from '@hugeicons/core-free-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCampaign,
  type CampaignDto,
  type CreateCampaignRequest,
} from '../../../api/campaigns';
import {
  fetchTemplates,
  fetchTemplateById,
  type EmailTemplateSummaryDto,
  type EmailTemplateDto,
} from '../../../api/templates';
import { useSenderAccounts } from '../../../api/sender-accounts';
import type { CompanyDto } from '../../../api/companies';

export interface CreateCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  companies?: CompanyDto[];
  onSuccess?: (campaign: CampaignDto) => void;
}

export function CreateCampaignModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateCampaignModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [contentSource, setContentSource] = useState<'TEMPLATE' | 'AI'>('TEMPLATE');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [aiPromptContext, setAiPromptContext] = useState('');
  const [followUpDelayBusinessDays, setFollowUpDelayBusinessDays] = useState(3);
  const [maxFollowUps, setMaxFollowUps] = useState(1);
  const [selectedSenderAccountIds, setSelectedSenderAccountIds] = useState<string[]>([]);
  const [selectedTemplateDetail, setSelectedTemplateDetail] = useState<EmailTemplateDto | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load templates
  const { data: templates = [] } = useQuery<EmailTemplateSummaryDto[]>({
    queryKey: ['templates', false],
    queryFn: () => fetchTemplates({ includeArchived: false }),
    enabled: isOpen,
  });

  // Load senders
  const { data: senderAccounts = [] } = useSenderAccounts();

  // Load template detail when selected to check steps and {{sender.name}}
  useEffect(() => {
    if (!selectedTemplateId || contentSource !== 'TEMPLATE') {
      setSelectedTemplateDetail(null);
      return;
    }
    let isCancelled = false;
    void fetchTemplateById(selectedTemplateId).then((data) => {
      if (!isCancelled) {
        setSelectedTemplateDetail(data);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [selectedTemplateId, contentSource]);

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setContentSource('TEMPLATE');
      setSelectedTemplateId('');
      setAiPromptContext('');
      setFollowUpDelayBusinessDays(3);
      setMaxFollowUps(1);
      setSelectedSenderAccountIds([]);
      setSelectedTemplateDetail(null);
      setSubmitError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Validation rules
  const selectedTemplateSummary = templates.find((t) => t.id === selectedTemplateId);
  const stepCount = selectedTemplateDetail?.steps?.length ?? selectedTemplateSummary?.stepCount ?? 0;
  const requiredSteps = maxFollowUps + 1;
  const hasStepDeficit = contentSource === 'TEMPLATE' && selectedTemplateId !== '' && stepCount < requiredSteps;

  const hasSenderNameInTemplate =
    contentSource === 'TEMPLATE' &&
    Boolean(
      selectedTemplateDetail?.steps?.some(
        (s) =>
          s.subjectTemplate.includes('{{sender.name}}') ||
          s.bodyTemplate.includes('{{sender.name}}'),
      ),
    );

  const isFormValid =
    name.trim().length > 0 &&
    (contentSource === 'AI'
      ? aiPromptContext.trim().length > 0
      : selectedTemplateId !== '' && !hasStepDeficit && !hasSenderNameInTemplate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const payload: CreateCampaignRequest = {
      name: name.trim(),
      contentSource,
      templateId: contentSource === 'TEMPLATE' ? selectedTemplateId : null,
      aiPromptContext: contentSource === 'AI' ? aiPromptContext.trim() : null,
      followUpDelayBusinessDays,
      maxFollowUps,
      senderAccountIds: selectedSenderAccountIds,
    };

    try {
      const created = await createCampaign(payload);
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      onSuccess?.(created);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create campaign';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create Campaign"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
    >
      <div
        className="w-full max-w-lg bg-white border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] shadow-2xl rounded-none"
        style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-base font-bold text-slate-900">Create Campaign</h2>
            <p className="text-xs text-slate-500 mt-0.5 font-normal">
              Define a workspace outreach initiative across multiple target companies
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded-none text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <HugeiconsIcon icon={XIcon} size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 space-y-5 overflow-y-auto">
            {submitError && (
              <div
                role="alert"
                className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2"
              >
                <HugeiconsIcon icon={AlertCircleIcon} size={16} className="text-rose-600 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Campaign Name */}
            <div className="space-y-1.5">
              <label
                htmlFor="campaign-name"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Campaign Name
              </label>
              <input
                id="campaign-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q4 Executive Leadership Outreach"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-none focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium text-slate-900 placeholder-slate-400"
              />
            </div>

            {/* Content Source Selection */}
            <div className="space-y-2">
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Content Source
              </span>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="contentSource"
                    value="TEMPLATE"
                    checked={contentSource === 'TEMPLATE'}
                    onChange={() => setContentSource('TEMPLATE')}
                    className="text-slate-900 focus:ring-slate-900"
                  />
                  Template
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="contentSource"
                    value="AI"
                    checked={contentSource === 'AI'}
                    onChange={() => setContentSource('AI')}
                    className="text-slate-900 focus:ring-slate-900"
                  />
                  AI Generation
                </label>
              </div>
            </div>

            {/* Template Selector (when TEMPLATE) */}
            {contentSource === 'TEMPLATE' && (
              <div className="space-y-1.5">
                <label
                  htmlFor="campaign-template"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Select Template
                </label>
                <select
                  id="campaign-template"
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-none focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium text-slate-900 bg-white"
                >
                  <option value="">Select a template...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.stepCount} {t.stepCount === 1 ? 'step' : 'steps'})
                    </option>
                  ))}
                </select>

                {hasSenderNameInTemplate && (
                  <div
                    role="alert"
                    className="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-center gap-2 mt-2"
                  >
                    <HugeiconsIcon icon={AlertCircleIcon} size={16} className="text-amber-600 shrink-0" />
                    <span>
                      Cannot use templates with {'{{sender.name}}'} in campaigns (senders are selected at send time).
                    </span>
                  </div>
                )}

                {hasStepDeficit && (
                  <div
                    role="alert"
                    className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2 mt-2"
                  >
                    <HugeiconsIcon icon={AlertCircleIcon} size={16} className="text-rose-600 shrink-0" />
                    <span>
                      Selected template only has {stepCount} steps, but max follow-ups of {maxFollowUps} requires {requiredSteps} steps.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* AI Prompt Context (when AI) */}
            {contentSource === 'AI' && (
              <div className="space-y-1.5">
                <label
                  htmlFor="campaign-ai-context"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  AI Prompt Context
                </label>
                <textarea
                  id="campaign-ai-context"
                  rows={3}
                  value={aiPromptContext}
                  onChange={(e) => setAiPromptContext(e.target.value)}
                  placeholder="e.g. Focus on distributed systems experience, tone should be concise and professional..."
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-none focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium text-slate-900 placeholder-slate-400"
                />
              </div>
            )}

            {/* Timing & Follow-ups */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="campaign-max-followups"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Max Follow-ups
                </label>
                <input
                  id="campaign-max-followups"
                  type="number"
                  min={0}
                  max={5}
                  value={maxFollowUps}
                  onChange={(e) => setMaxFollowUps(Number(e.target.value))}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-none focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium text-slate-900"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="campaign-followup-delay"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                >
                  Delay (Business Days)
                </label>
                <input
                  id="campaign-followup-delay"
                  type="number"
                  min={1}
                  max={30}
                  value={followUpDelayBusinessDays}
                  onChange={(e) => setFollowUpDelayBusinessDays(Number(e.target.value))}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-none focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium text-slate-900"
                />
              </div>
            </div>

            {/* Senders */}
            {senderAccounts.length > 0 && (
              <div className="space-y-1.5">
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Assigned Senders
                </span>
                <div className="space-y-1 max-h-32 overflow-y-auto border border-slate-200 p-2 bg-slate-50">
                  {senderAccounts.map((sender) => (
                    <label key={sender.id} className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedSenderAccountIds.includes(sender.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSenderAccountIds((prev) => [...prev, sender.id]);
                          } else {
                            setSelectedSenderAccountIds((prev) => prev.filter((id) => id !== sender.id));
                          }
                        }}
                        className="rounded-none text-slate-900 focus:ring-slate-900"
                      />
                      <span>
                        {sender.fromName} ({sender.fromEmail})
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-none disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
            >
              {isSubmitting ? 'Creating...' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
