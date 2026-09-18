import { Injectable, Logger } from '@nestjs/common';
import {
  ContactDiscoveryInput,
  ContactDiscoveryProvider,
  ContactDiscoveryResult,
  DiscoveredContactCandidate,
} from '../domain/contact.provider.interface';

@Injectable()
export class MockContactDiscoveryProvider implements ContactDiscoveryProvider {
  private readonly logger = new Logger(MockContactDiscoveryProvider.name);

  async discoverContacts(
    input: ContactDiscoveryInput,
  ): Promise<ContactDiscoveryResult> {
    // Hard Execution Constraint: Never allow mock provider in production
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.ALLOW_MOCK_PROVIDERS !== 'true'
    ) {
      this.logger.error(
        'Attempted to invoke MockContactDiscoveryProvider in production environment.',
      );
      throw new Error(
        'Mock discovery provider is strictly prohibited in production.',
      );
    }

    this.logger.log(
      `Executing MockContactDiscoveryProvider for company: ${input.companyName} (${input.companyId})`,
    );

    const targetRole = input.targetRoles?.[0] || 'Software Engineer';
    const domain = input.domain || 'example.com';
    const websiteUrl = input.websiteUrl || `https://${domain}`;

    const candidates: DiscoveredContactCandidate[] = [
      {
        name: 'Jane Doe',
        title: 'VP of Engineering',
        email: `jane.doe@${domain}`,
        contactKind: 'PERSON',
        source: 'COMPANY_WEBSITE',
        sourceUrl: `${websiteUrl}/team`,
        confidence: 'HIGH',
      },
      {
        name: 'Alex Rivera',
        title: `Head of ${targetRole} Engineering`,
        email: null, // Identity known, email unavailable (Zero Fabrication requirement)
        contactKind: 'PERSON',
        source: 'TEAM_PAGE',
        sourceUrl: `${websiteUrl}/about`,
        confidence: 'MEDIUM',
      },
      {
        name: 'Sarah Chen',
        title: 'Talent Acquisition Lead',
        email: `sarah.chen@${domain}`,
        contactKind: 'PERSON',
        source: 'PUBLIC_PROFILE',
        sourceUrl: `https://linkedin.com/in/sarahchen-${input.companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        confidence: 'HIGH',
      },
      {
        name: 'Engineering Careers Team',
        title: 'Recruiting Role Address',
        email: `careers@${domain}`,
        contactKind: 'ROLE_ADDRESS',
        source: 'CAREERS_PAGE',
        sourceUrl: `${websiteUrl}/careers`,
        confidence: 'HIGH',
      },
    ];

    return {
      companyId: input.companyId,
      workspaceId: input.workspaceId,
      discoveredAt: new Date(),
      candidates,
      mock: true,
    };
  }
}
