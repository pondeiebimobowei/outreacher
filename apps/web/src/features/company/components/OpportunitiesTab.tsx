import { CompanyDto } from '../../../api/companies';
import { CompanyResearchDetailsDto } from '../../../api/research';
import { Briefcase, ExternalLink, Calendar } from 'lucide-react';

export function OpportunitiesTab({
  company,
  research,
}: {
  company: CompanyDto;
  research?: CompanyResearchDetailsDto;
}) {
  const opportunities = research?.opportunities || [];

  if (opportunities.length === 0) {
    return (
      <div className="bg-white p-12 rounded-xl border border-slate-200 shadow-sm text-center">
        <Briefcase className="mx-auto h-12 w-12 text-slate-300 mb-4" />
        <h3 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>No Opportunities Found</h3>
        <p className="text-slate-500 text-sm max-w-sm mx-auto">
          We haven't discovered any active job openings or specific opportunities for {company.name} yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {opportunities.map((opp) => (
        <div key={opp.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-start">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-bold text-slate-900">{opp.roleTitle}</h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                opp.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
              }`}>
                {opp.status}
              </span>
            </div>
            {opp.roleDescription && (
              <p className="text-sm text-slate-600 line-clamp-2">{opp.roleDescription}</p>
            )}
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-2">
              {opp.roleLocation && (
                <span className="font-medium">{opp.roleLocation}</span>
              )}
              {opp.opportunityType && (
                <span className="font-medium px-2 py-0.5 bg-slate-100 rounded">{opp.opportunityType}</span>
              )}
              {opp.openingDiscoveredAt && (
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  Discovered {new Date(opp.openingDiscoveredAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          {(opp.roleUrl || opp.openingSourceUrl) && (
            <div className="shrink-0 pt-1">
              <a 
                href={opp.roleUrl || opp.openingSourceUrl || '#'} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
              >
                View Role <ExternalLink size={14} />
              </a>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
