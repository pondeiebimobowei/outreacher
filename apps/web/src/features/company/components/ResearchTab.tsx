import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CompanyDto } from '../../../api/companies';
import { CompanyResearchDetailsDto, startCompanyResearch } from '../../../api/research';
import { RefreshCw, Play } from 'lucide-react';

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
    }
  });

  const isRunning = research?.status === 'QUEUED' || research?.status === 'RUNNING';

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Research Status</h3>
          <p className="text-sm text-slate-500 mt-1">
            {isRunning ? 'Gathering intelligence about ' + company.name + '...' : 
             research?.status === 'COMPLETED' ? 'Research is complete and up to date.' :
             'No research findings yet. Start research to begin.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isRunning ? (
            <span className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
              <RefreshCw className="animate-spin" size={16} /> Running...
            </span>
          ) : (
            <>
              {research?.status === 'COMPLETED' && (
                <button
                  onClick={() => startResearchMutation.mutate({ forceRefresh: true })}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Force Refresh
                </button>
              )}
              <button
                onClick={() => startResearchMutation.mutate()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <Play size={16} /> {research?.status === 'COMPLETED' ? 'Refresh' : 'Start Research'}
              </button>
            </>
          )}
        </div>
      </div>

      {research?.run?.summary && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Executive Summary</h4>
          <p className="text-sm text-slate-700 leading-relaxed">{research.run.summary}</p>
        </div>
      )}

      {research?.run?.keyFindings && research.run.keyFindings.length > 0 && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Key Findings</h4>
          <ul className="space-y-2">
            {research.run.keyFindings.map((finding, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="text-blue-600 mt-0.5">•</span>
                <span>{finding}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
