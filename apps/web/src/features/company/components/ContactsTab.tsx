import { useQuery } from '@tanstack/react-query';
import { CompanyDto } from '../../../api/companies';
import { fetchCompanyContacts } from '../../../api/contacts';
import { Users } from 'lucide-react';

export function ContactsTab({
  company,
}: {
  company: CompanyDto;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['company-contacts', company.id],
    queryFn: () => fetchCompanyContacts(company.id),
  });

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-slate-500 animate-pulse">Loading contacts...</div>;
  }

  if (isError) {
    return <div className="p-8 text-center text-sm text-rose-500">Failed to load contacts.</div>;
  }

  const contacts = data?.contacts || [];

  if (contacts.length === 0) {
    return (
      <div className="bg-white p-12 rounded-xl border border-slate-200 shadow-sm text-center">
        <Users className="mx-auto h-12 w-12 text-slate-300 mb-4" />
        <h3 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>No Contacts Yet</h3>
        <p className="text-slate-500 text-sm max-w-sm mx-auto">
          We haven't discovered any contacts at {company.name}. Try running contact discovery.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {contacts.map((contact) => (
        <div key={contact.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{contact.name || 'Unknown Contact'}</h3>
            <p className="text-xs text-slate-500">{contact.title}</p>
          </div>
          {contact.email && (
            <p className="text-xs font-mono text-slate-600 bg-slate-50 p-1 rounded mt-2">{contact.email}</p>
          )}
          {contact.sourceUrl && (
            <a href={contact.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1">
              LinkedIn Profile
            </a>
          )}
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <span>Relevance: {contact.relevance || 'N/A'}</span>
            <span className={contact.isSelected ? 'text-emerald-600' : ''}>{(contact.isSelected ? "SELECTED" : "")}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
