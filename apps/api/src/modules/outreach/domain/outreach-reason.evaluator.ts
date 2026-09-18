import { OpportunityType } from '@repo/db';
import { OutreachContext } from './outreach-context.interface';

export interface OutreachReasonResult {
  reasonText: string;
  opportunityType: OpportunityType;
  supportingEvidenceIds: string[];
}

export class OutreachReasonEvaluator {
  public evaluate(context: OutreachContext): OutreachReasonResult {
    const { contact, company, opportunity, careerProfile, evidence } = context;
    const supportingEvidenceIds: string[] = [];

    // Collect relevant evidence items
    const factEvidence = evidence.filter((e) => e.classification === 'FACT');
    factEvidence.forEach((e) => supportingEvidenceIds.push(e.id));

    let reasonText = '';

    const targetRole =
      opportunity.roleTitle || careerProfile.targetRoles[0] || 'Target Role';
    const contactTitle = contact.title || 'team member';

    if (opportunity.type === 'CONFIRMED') {
      const openingDesc = opportunity.roleDescription
        ? ` (${opportunity.roleDescription.slice(0, 100)})`
        : '';
      reasonText = `Contacting ${contact.name} (${contactTitle}) regarding confirmed open role ${targetRole} at ${company.name}${openingDesc}. Outreach is grounded in verified opening evidence.`;
    } else if (opportunity.type === 'PROACTIVE') {
      const industryText = company.industry ? ` in ${company.industry}` : '';
      reasonText = `Proactive outreach to ${contact.name} (${contactTitle}) at ${company.name}${industryText} based on strategic technical alignment with candidate background in ${targetRole}. No open job posting is claimed.`;
    } else {
      // UNCLASSIFIED
      reasonText = `Exploring general engineering fit with ${contact.name} (${contactTitle}) at ${company.name}. Outreach is grounded strictly in company profile and candidate background in ${targetRole} without hiring assertions.`;
    }

    return {
      reasonText,
      opportunityType: opportunity.type,
      supportingEvidenceIds,
    };
  }
}
