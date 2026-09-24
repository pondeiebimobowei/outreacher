import { CompanyDto } from '../../../api/companies';
import { CompanyResearchDetailsDto } from '../../../api/research';
import { OpportunityDetail } from '../../opportunity/components/OpportunityDetail';

export function OpportunitiesTab({
  company,
  research,
}: {
  company: CompanyDto;
  research?: CompanyResearchDetailsDto;
}) {
  if (!research?.opportunities || research.opportunities.length === 0) {
    return (
      <div className="bg-slate-50 p-12 rounded-none-none border border-slate-200 -2xs text-center space-y-3">
        <h3
          className="text-base font-bold text-slate-900"
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          No Confirmed Openings Identified
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
          Research has not identified listed openings for {company.name}. You can still pursue a proactive conversation based on company-fit signals.
        </p>
      </div>
    );
  }

  return (
    <div className="pt-2 space-y-4">
      {research.opportunities.map((opp) => (
        <OpportunityDetail
          key={opp.id}
          company={company}
          opportunity={opp}
        />
      ))}
    </div>
  );
}
