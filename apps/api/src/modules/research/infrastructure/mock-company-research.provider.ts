import { Injectable } from '@nestjs/common';
import {
  CompanyResearchInput,
  CompanyResearchProvider,
  CompanyResearchResult,
} from '../domain/research.provider.interface';

@Injectable()
export class MockCompanyResearchProvider implements CompanyResearchProvider {
  async researchCompany(
    input: CompanyResearchInput,
  ): Promise<CompanyResearchResult> {
    const nodeEnv = process.env.NODE_ENV;
    if (nodeEnv === 'production') {
      throw new Error(
        'MockCompanyResearchProvider cannot be executed in production environment.',
      );
    }

    const defaultUrl = input.websiteUrl || 'https://careers.example.com';

    return {
      summary: `Research analysis for ${input.companyName}: Strong engineering expansion in backend services.`,
      findings: [
        {
          title: 'Engineering Expansion',
          detail: `${input.companyName} is hiring backend engineers to scale platform services.`,
          whyItMatters: 'Strengthens alignment for senior backend outreach.',
          sourceUrl: defaultUrl,
        },
      ],
      sources: [
        {
          name: `${input.companyName} Careers Page`,
          url: defaultUrl,
          tier: 'TIER_1',
        },
      ],
      opportunities: [
        {
          roleTitle: 'Senior Backend Engineer',
          openingSourceUrl: `${defaultUrl}/jobs/backend`,
          roleUrl: `${defaultUrl}/jobs/backend`,
          roleLocation: 'Remote / US',
          roleDescription: 'Building distributed Go and NestJS services.',
          opportunityType: 'CONFIRMED',
        },
      ],
      evidence: [
        {
          claim: `${input.companyName} is hiring backend engineers.`,
          classification: 'FACT',
          sourceName: `${input.companyName} Careers`,
          sourceUrl: defaultUrl,
          sourceExcerpt: 'Currently open roles for Senior Backend Engineer.',
          confidence: 'HIGH',
        },
      ],
      unknowns: ['Exact backend team size and compensation band.'],
      status: 'COMPLETED',
    };
  }
}
