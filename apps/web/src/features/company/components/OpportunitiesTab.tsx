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
    return null; // No opportunities to display
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
