// Utility helpers for the Opportunities domain that encapsulate production-defined semantics.
// They are pure functions and therefore easy to unit‑test.

import { OpportunityDto } from '../../api/research';
import { ClassificationType } from './components/OpportunityClassificationBadge';

// Deprecated selection helper removed per backend contract – multiple opportunities are displayed directly.


/**
 * Derive the effective classification for a company based solely on the
 * production `OpportunityDto`. If no opportunity is present the result is
 * UNCLASSIFIED.
 */
const CLASSIFICATIONS = ['CONFIRMED', 'PROACTIVE', 'UNCLASSIFIED'] as const;

type Classification = typeof CLASSIFICATIONS[number];

function isClassification(value: unknown): value is Classification {
  return (CLASSIFICATIONS as readonly string[]).includes(value as string);
}

export function getEffectiveClassification(
  opportunity?: OpportunityDto
): ClassificationType {
  if (opportunity && opportunity.opportunityType && isClassification(opportunity.opportunityType)) {
    return opportunity.opportunityType;
  }
  return 'UNCLASSIFIED';
}
