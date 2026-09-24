import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { CompanyDto } from '../../../api/companies';
import { fetchCompanyResearch } from '../../../api/research';
import { OpportunityClassificationBadge, ClassificationType } from './OpportunityClassificationBadge';

export function OpportunityCard({ company }: { company: CompanyDto }) {
  const { data: research, isLoading } = useQuery({
    queryKey: ['company-research', company.id],
    queryFn: () => fetchCompanyResearch(company.id),
  });

  const latestOpp = research?.opportunities?.[0];
  const activeStatus: ClassificationType = latestOpp 
    ? (latestOpp.opportunityType as ClassificationType) 
    : research?.status === 'COMPLETED' ? 'PROACTIVE' : 'UNCLASSIFIED';

  let snippet = 'Research not started';
  if (isLoading) {
    snippet = 'Loading research...';
  } else if (latestOpp) {
    snippet = `Active opportunity: ${latestOpp.roleTitle}`;
  } else if (research?.evidence && research.evidence.length > 0) {
    snippet = `${research.evidence.length} piece${research.evidence.length > 1 ? 's' : ''} of evidence found`;
  } else if (research?.status === 'COMPLETED') {
    snippet = 'Research complete';
  } else if (research?.status === 'RUNNING' || research?.status === 'QUEUED') {
    snippet = 'Research in progress';
  }

  return (
    <Link
      to={`/companies/$id`}
      params={{ id: company.id }}
      className="w-full text-left rounded-xl p-5 transition-all block group"
      style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex flex-col h-full">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-bold shrink-0" style={{ background: 'var(--color-muted)', color: 'var(--color-primary)', border: '1px solid var(--color-border)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              {company.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-bold truncate" style={{ color: 'var(--color-primary)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                {company.name}
              </p>
              <p className="text-[12px] truncate" style={{ color: 'var(--color-muted-fg)', fontFamily: 'Inter, sans-serif' }}>
                {company.domain || company.websiteUrl || 'No domain'}
              </p>
            </div>
          </div>
          <OpportunityClassificationBadge type={activeStatus} />
        </div>

        <p className="text-[12.5px] mb-4 leading-relaxed flex-1" style={{ color: 'var(--color-muted-fg)', fontFamily: 'Inter, sans-serif' }}>
          {snippet}
        </p>

        <div className="flex items-center justify-between mt-auto pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <span className="text-[11.5px]" style={{ color: 'var(--color-muted-fg)', fontFamily: 'Inter, sans-serif' }}>
            {research?.run?.updatedAt ? `Updated ${new Date(research.run.updatedAt).toLocaleDateString()}` : `Added ${new Date(company.createdAt).toLocaleDateString()}`}
          </span>
          <span className="text-[12px] font-medium flex items-center gap-1 group-hover:underline" style={{ color: 'var(--color-accent)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            View opportunity <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}
