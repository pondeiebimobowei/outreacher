import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CompanyDto } from '../../../api/companies';
import { CompanyResearchDetailsDto, startCompanyResearch } from '../../../api/research';
import { HugeiconsIcon } from '@hugeicons/react';
import { RefreshCwIcon, PlayIcon, ShieldCheckIcon, ExternalLinkIcon } from '@hugeicons/core-free-icons';;

export function ResearchTab({
  company,
  research,
}: {
  company: CompanyDto;
  research?: CompanyResearchDetailsDto;
}) {
  const queryClient = useQueryClient();

  const startResearchMutation = useMutation({
    mutationFn: (options?: { forceRefresh?: boolean }) => startCompanyResearch(company.id, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-research', company.id] });
    },
  });

  const isRunning = research?.status === 'QUEUED' || research?.status === 'RUNNING';

  return (
    <div className="space-y-6">
      {/* Research Status Card */}
      <div className="bg-slate-50 p-6 rounded-none-none border border-slate-200 -2xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 tracking-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            Research Status
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {isRunning
              ? 'Gathering intelligence about ' + company.name + '...'
              : research?.status === 'COMPLETED'
              ? 'Research is complete and up to date.'
              : 'No research findings yet. Start research to begin.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isRunning ? (
            <span className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-none-none">
              <HugeiconsIcon icon={RefreshCwIcon} className="animate-spin" size={16} /> Running...
            </span>
          ) : (
            <>
              {research?.status === 'COMPLETED' && (
                <button
                  type="button"
                  onClick={() => startResearchMutation.mutate({ forceRefresh: true })}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-300 hover:bg-slate-100 rounded-none-none  focus:outline-none focus:ring-2 focus:ring-slate-900"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  Force Refresh
                </button>
              )}
              <button
                type="button"
                onClick={() => startResearchMutation.mutate()}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-none-none -xs  focus:outline-none focus:ring-2 focus:ring-slate-900"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                <HugeiconsIcon icon={PlayIcon} size={14} className="fill-current" /> {research?.status === 'COMPLETED' ? 'Refresh' : 'Start Research'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Executive Summary */}
      {research?.run?.summary && (
        <div className="bg-slate-50 p-6 rounded-none-none border border-slate-200 -2xs space-y-2">
          <h4
            className="text-xs font-bold uppercase tracking-wider text-slate-500"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Executive Summary
          </h4>
          <p className="text-sm text-slate-700 leading-relaxed">{research.run.summary}</p>
        </div>
      )}

      {/* Key Findings */}
      {research?.run?.keyFindings && research.run.keyFindings.length > 0 && (
        <div className="bg-slate-50 p-6 rounded-none-none border border-slate-200 -2xs space-y-3">
          <h4
            className="text-xs font-bold uppercase tracking-wider text-slate-500"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Key Findings
          </h4>
          <ul className="space-y-2.5">
            {research.run.keyFindings.map((finding, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                <span className="w-1.5 h-1.5 rounded-none-full bg-indigo-600 mt-2 shrink-0" />
                <span className="leading-relaxed">{finding}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Supporting Evidence (if present) */}
      {research?.evidence && research.evidence.length > 0 && (
        <div className="bg-slate-50 p-6 rounded-none-none border border-slate-200 -2xs space-y-3">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={ShieldCheckIcon} size={16} className="text-indigo-600" />
            <h4
              className="text-xs font-bold uppercase tracking-wider text-slate-500"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Supporting Evidence ({research.evidence.length})
            </h4>
          </div>
          <div className="divide-y divide-slate-100">
            {research.evidence.map((ev) => (
              <div key={ev.id} className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-900 leading-relaxed">{ev.claim}</p>
                  {ev.sourceExcerpt && (
                    <p className="text-[11px] text-slate-500 italic bg-slate-50 p-2 rounded-none border border-slate-100">
                      "{ev.sourceExcerpt}"
                    </p>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{ev.sourceName || 'Web Source'}</span>
                  {ev.sourceUrl && (
                    <a
                      href={ev.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-800"
                    >
                      <HugeiconsIcon icon={ExternalLinkIcon} size={12} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
