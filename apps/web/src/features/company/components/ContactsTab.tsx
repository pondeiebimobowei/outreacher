import { CompanyDto } from '../../../api/companies';
import { ContactDiscoveryWorkspace } from '../../../components/contact-discovery/contact-discovery-workspace';

export function ContactsTab({
  company,
}: {
  company: CompanyDto;
}) {
  return <ContactDiscoveryWorkspace companyId={company.id} companyName={company.name} />;
}
