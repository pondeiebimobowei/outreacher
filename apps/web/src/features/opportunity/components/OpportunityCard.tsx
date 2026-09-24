import { Link } from '@tanstack/react-router';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRightIcon } from '@hugeicons/core-free-icons';;
import { CompanyDto } from '../../../api/companies';
import { OpportunityDto } from '../../../api/research';
import { OpportunityClassificationBadge } from './OpportunityClassificationBadge';
import { getEffectiveClassification } from '../utils';
import { OpportunityLifecycleBadge } from './OpportunityLifecycleBadge';

type Props = {
  company: CompanyDto;
  opportunity: OpportunityDto;
};

export function OpportunityCard({ company, opportunity }: Props) {
  const activeStatus = getEffectiveClassification(opportunity);

  const snippet = opportunity.roleTitle ?? 'Opportunity details';

  return (
    <Link
      to={`/companies/$id`}
      params={{ id: company.id }}
      className="w-full text-left rounded-none-none p-5  block group"
      style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex flex-col h-full">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-none-none flex items-center justify-center text-[12px] font-bold shrink-0"
              style={{ background: 'var(--color-muted)', color: 'var(--color-primary)', border: '1px solid var(--color-border)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {company.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-bold truncate" style={{ color: 'var(--color-primary)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                {company.name}
              </p>
              <p className="text-[12px] truncate" style={{ color: 'var(--color-muted-fg)', fontFamily: 'sans-serif' }}>
                {company.domain || company.websiteUrl || 'No domain'}
              </p>
            </div>
          </div>
          <OpportunityClassificationBadge type={activeStatus} />
          {            <OpportunityLifecycleBadge status={opportunity.status} />}
        </div>

        <p className="text-[12.5px] mb-4 leading-relaxed flex-1" style={{ color: 'var(--color-muted-fg)', fontFamily: 'sans-serif' }}>
          {snippet}
        </p>

        <div className="flex items-center justify-between mt-auto pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <span className="text-[11.5px]" style={{ color: 'var(--color-muted-fg)', fontFamily: 'sans-serif' }}>
            Updated {new Date(opportunity.updatedAt ?? opportunity.createdAt).toLocaleDateString()}
          </span>
          <span className="text-[12px] font-medium flex items-center gap-1 group-hover:underline" style={{ color: 'var(--color-accent)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            View opportunity <HugeiconsIcon icon={ArrowRightIcon} className="w-3 h-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}
