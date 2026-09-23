import { CompanyDto } from '../../../api/companies';
import { CompanyResearchDetailsDto } from '../../../api/research';
import { ExternalLink } from 'lucide-react';

export function OverviewTab({
  company,
  research,
  onTabChange,
}: {
  company: CompanyDto;
  research?: CompanyResearchDetailsDto;
  onTabChange: (tab: string) => void;
}) {
  const latestOpp = research?.opportunities?.[0];
  const activeStatus = latestOpp ? 'CONFIRMED' : research?.status === 'COMPLETED' ? 'PROACTIVE' : 'UNCLASSIFIED';

  return (
    <div className="flex flex-col xl:flex-row gap-5 items-start">
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {/* Next Step Placeholder using real data state */}
        <div className="rounded-xl p-5 relative overflow-hidden bg-white border border-slate-200 border-l-[3px] border-l-blue-600">
          <p className="text-[11px] font-bold uppercase tracking-wide mb-2 text-slate-500" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '0.07em' }}>
            What to do next
          </p>
          <h3 className="text-[17px] font-bold leading-snug mb-2 text-slate-900" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {research?.status === 'COMPLETED' ? 'Find relevant contacts' : 'Research this company'}
          </h3>
          <p className="text-[13.5px] leading-relaxed mb-4 text-slate-500" style={{ fontFamily: 'Inter, sans-serif' }}>
            {research?.status === 'COMPLETED'
              ? 'Research is complete. The next step is to find the right person to approach.'
              : 'Research hasn\'t been started yet. Outreacher will look for company signals and evidence.'}
          </p>
          <button
            onClick={() => onTabChange(research?.status === 'COMPLETED' ? 'Contacts' : 'Research')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13.5px] font-semibold transition-all bg-slate-900 text-white hover:bg-slate-800"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            {research?.status === 'COMPLETED' ? 'Find contacts' : 'Start research'} &rarr;
          </button>
        </div>

        {/* Opportunity State Card */}
        <div className="rounded-xl p-5 bg-white border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <p className="text-[11.5px] font-bold uppercase tracking-wide text-slate-500" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '0.07em' }}>
              Opportunity
            </p>
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
              activeStatus === 'CONFIRMED' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
              activeStatus === 'PROACTIVE' ? 'bg-indigo-50 text-indigo-800 border-indigo-200' :
              'bg-yellow-50 text-yellow-800 border-yellow-200'
            }`} style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '0.04em', borderWidth: 1 }}>
              {activeStatus}
            </span>
          </div>
          <p className="text-[13.5px] leading-relaxed text-slate-500" style={{ fontFamily: 'Inter, sans-serif' }}>
            {latestOpp ? `A relevant opening was found: ${latestOpp.roleTitle}` : research?.status === 'COMPLETED' ? 'No confirmed opening, but company-fit signals are present.' : 'Start research to gather evidence.'}
          </p>
        </div>
      </div>

      <div className="w-full xl:w-64 shrink-0 flex flex-col gap-4">
        {/* Company Context Card */}
        <div className="rounded-xl overflow-hidden bg-white border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-200">
            <p className="text-[13px] font-bold text-slate-900" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Company</p>
          </div>
          <div className="px-5 py-4">
            {company.description && (
              <p className="text-[12.5px] leading-relaxed mb-4 text-slate-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                {company.description}
              </p>
            )}
            <div className="flex flex-col gap-2.5">
              {company.domain && (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11.5px] font-semibold uppercase tracking-wide shrink-0 text-slate-500" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '0.06em' }}>
                    Domain
                  </span>
                  <a href={`https://${company.domain}`} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-right text-blue-600 hover:text-blue-800 flex items-center gap-1">
                    {company.domain} <ExternalLink size={12} />
                  </a>
                </div>
              )}
              {company.industry && (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11.5px] font-semibold uppercase tracking-wide shrink-0 text-slate-500" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '0.06em' }}>
                    Industry
                  </span>
                  <span className="text-[12.5px] text-right text-slate-900">{company.industry}</span>
                </div>
              )}
              {company.location && (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11.5px] font-semibold uppercase tracking-wide shrink-0 text-slate-500" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '0.06em' }}>
                    Location
                  </span>
                  <span className="text-[12.5px] text-right text-slate-900">{company.location}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
