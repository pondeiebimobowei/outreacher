import { CompanyDto } from '../../../api/companies';
import { CompanyResearchDetailsDto } from '../../../api/research';
import { OpportunityDetail } from '../../opportunity/components/OpportunityDetail';

export function OpportunitiesTab({
   
  research,
}: {
  company: CompanyDto;
  research?: CompanyResearchDetailsDto;
}) {
  return (
    <div className="pt-2">
      <OpportunityDetail research={research} />
    </div>
  );
}
