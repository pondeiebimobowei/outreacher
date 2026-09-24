import { CompanyResearchDetailsDto } from '../../../api/research';
import { EvidenceCard } from './EvidenceCard';
import { ClassificationType, OPP_STATUS_CFG } from './OpportunityClassificationBadge';

export function OpportunityDetail({ research }: { research?: CompanyResearchDetailsDto }) {
  const latestOpp = research?.opportunities?.[0];
  const activeStatus: ClassificationType = latestOpp 
    ? (latestOpp.opportunityType as ClassificationType) 
    : research?.status === 'COMPLETED' ? 'PROACTIVE' : 'UNCLASSIFIED';

  const cfg = OPP_STATUS_CFG[activeStatus] || OPP_STATUS_CFG.UNCLASSIFIED;

  const stateExplanation = activeStatus === 'CONFIRMED'
    ? 'An active, relevant opening was found. This is a direct reason to pursue a conversation.'
    : activeStatus === 'PROACTIVE'
      ? 'No confirmed opening found. Company signals provide a credible basis for reaching out before a listing exists.'
      : 'Research did not return sufficient evidence to classify this opportunity responsibly.';

  const hasResearch = research?.status && research.status !== 'NOT_STARTED';

  if (!hasResearch && !latestOpp && (!research?.evidence || research.evidence.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-24 px-8 border rounded-xl bg-white" style={{ borderColor: 'var(--color-border)' }}>
        <p className="text-[17px] font-bold text-gray-900" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          Research has not been completed
        </p>
        <p className="text-[14px] text-gray-500 max-w-md text-center" style={{ fontFamily: 'Inter, sans-serif' }}>
          Opportunity classification requires research evidence. Start research on this company to gather evidence before classifying the opportunity.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* State explanation */}
      <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
        <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ background: cfg.dot }} />
        <p className="text-[13.5px] leading-relaxed" style={{ color: cfg.color, fontFamily: 'Inter, sans-serif' }}>
          {stateExplanation}
        </p>
      </div>

      <div className="flex flex-col xl:flex-row gap-5">
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          {/* Opening Details */}
          {latestOpp && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)', background: 'var(--color-card)' }}>
              <div className="px-5 py-3.5" style={{ background: 'var(--color-muted)', borderBottom: '1px solid var(--color-border)' }}>
                <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-muted-fg)', fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '0.07em' }}>
                  Opening
                </p>
              </div>
              <div className="p-5">
                <p className="text-[17px] font-bold mb-1" style={{ color: 'var(--color-primary)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  {latestOpp.roleTitle}
                </p>
                <p className="text-[13.5px] mb-3" style={{ color: 'var(--color-muted-fg)', fontFamily: 'Inter, sans-serif' }}>
                  {latestOpp.roleLocation || 'Remote'}
                </p>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide mb-0.5" style={{ color: 'var(--color-muted-fg)', fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '0.06em' }}>Status</p>
                    <p className="text-[13px]" style={{ color: 'var(--color-primary)', fontFamily: 'Inter, sans-serif' }}>
                      {latestOpp.status}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide mb-0.5" style={{ color: 'var(--color-muted-fg)', fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '0.06em' }}>Source</p>
                    <p className="text-[13px]" style={{ color: 'var(--color-accent)', fontFamily: 'Inter, sans-serif' }}>
                      {latestOpp.openingSourceUrl ? (
                        <a href={latestOpp.openingSourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          View Listing
                        </a>
                      ) : 'Careers page'}
                    </p>
                  </div>
                </div>
                {latestOpp.roleDescription && (
                  <div className="mt-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-muted-fg)', fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '0.06em' }}>
                      Description
                    </p>
                    <p className="text-[13px] leading-relaxed text-gray-700">
                      {latestOpp.roleDescription}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Evidence */}
          {research?.evidence && research.evidence.length > 0 && (
            <EvidenceCard evidence={research.evidence} />
          )}

        </div>

        {/* Sidebar / Next Steps */}
        <div className="w-full xl:w-80 flex flex-col gap-5 shrink-0">
          <div className="rounded-xl p-5" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--color-muted-fg)', fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '0.07em' }}>
              What to do next
            </p>
            <p className="text-[13.5px] mb-4 text-gray-700" style={{ fontFamily: 'Inter, sans-serif' }}>
              {activeStatus === 'CONFIRMED'
                ? 'Review the opening details, then proceed to contact discovery to find the right person to reach.'
                : activeStatus === 'PROACTIVE'
                  ? 'Review the evidence, then proceed to contact discovery.'
                  : 'Complete research before taking further action.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
