import { CompanyDto } from '../../../api/companies';
import { MessageSquare } from 'lucide-react';

export function ConversationTab({
  company,
}: {
  company: CompanyDto;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-16 px-8">
      {/* Icon */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center"
        style={{ background: 'var(--color-muted)', color: 'var(--color-muted-fg)' }}
      >
        <MessageSquare size={22} strokeWidth={1.6} />
      </div>

      {/* Text */}
      <div className="text-center max-w-md">
        <p
          className="text-[17px] font-bold mb-2"
          style={{ color: 'var(--color-primary)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          No conversations yet for {company.name}
        </p>
        <p
          className="text-[13.5px] leading-relaxed"
          style={{ color: 'var(--color-muted-fg)', fontFamily: 'Inter, sans-serif' }}
        >
          Conversations will appear here once outreach is sent and replies are received.
          The production backend does not yet track message threads natively — this view
          will be fully connected in a future release.
        </p>
      </div>

      {/* Next step suggestion */}
      <div
        className="w-full max-w-md rounded-xl px-5 py-4 flex items-start gap-3"
        style={{ background: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: '#EEF2FF', color: '#4F46E5' }}
        >
          <MessageSquare size={14} />
        </div>
        <div>
          <p
            className="text-[13px] font-semibold mb-0.5"
            style={{ color: 'var(--color-primary)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            To start a conversation
          </p>
          <p
            className="text-[12.5px] leading-relaxed"
            style={{ color: 'var(--color-muted-fg)', fontFamily: 'Inter, sans-serif' }}
          >
            Go to Outreach → review the draft → send the email. Replies from contacts will appear here.
          </p>
        </div>
      </div>
    </div>
  );
}
