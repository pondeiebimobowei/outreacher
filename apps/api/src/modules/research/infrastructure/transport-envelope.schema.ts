import { z } from 'zod';

export const ResearchFindingEnvelopeSchema = z.object({
  title: z.string(),
  detail: z.string(),
  whyItMatters: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
  claimId: z.string().optional().nullable(),
  evidenceRefs: z.array(z.string()).optional(),
});

export const ResearchSourceEnvelopeSchema = z.object({
  name: z.string(),
  url: z.string(),
  tier: z.enum(['TIER_1', 'TIER_2', 'TIER_3']),
});

export const ResearchOpportunityEnvelopeSchema = z.object({
  roleTitle: z.string(),
  openingSourceUrl: z.string().optional().nullable(),
  roleUrl: z.string().optional().nullable(),
  roleLocation: z.string().optional().nullable(),
  roleDescription: z.string().optional().nullable(),
  opportunityType: z.enum(['CONFIRMED', 'PROACTIVE', 'UNCLASSIFIED']),
});

export const ResearchEvidenceEnvelopeSchema = z.object({
  claim: z.string(),
  classification: z.enum(['FACT', 'INFERENCE', 'UNKNOWN']),
  sourceName: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
  sourceExcerpt: z.string().optional().nullable(),
  confidence: z.string().optional().nullable(),
  claimId: z.string().optional().nullable(),
  evidenceRef: z.string().optional().nullable(),
});

export const ResearchResultEnvelopeSchema = z.object({
  summary: z.string(),
  findings: z.array(ResearchFindingEnvelopeSchema),
  sources: z.array(ResearchSourceEnvelopeSchema),
  opportunities: z.array(ResearchOpportunityEnvelopeSchema),
  evidence: z.array(ResearchEvidenceEnvelopeSchema),
  unknowns: z.array(z.string()),
  status: z.enum(['COMPLETED', 'PARTIAL', 'FAILED']),
});

export const ResearchIdentityEnvelopeSchema = z.object({
  confidence: z.enum(['CONFIDENT', 'AMBIGUOUS', 'UNRESOLVED']),
  domain: z.string().optional().nullable(),
  website_url: z.string().optional().nullable(),
  reasoning: z.string().optional().nullable(),
});

export const ResearchErrorEnvelopeSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
});

export const ResearchMetadataEnvelopeSchema = z.object({
  duration_ms: z.number(),
  completed_at: z.string(),
  cached: z.boolean().optional(),
});

export const TransportEnvelopeV1Schema = z.object({
  contract_version: z.literal('1.0'),
  engine_version: z.string(),
  request_id: z.string(),
  research_run_id: z.string(),
  status: z.enum(['COMPLETED', 'PARTIAL', 'IDENTITY_HALTED', 'FAILED']),
  identity: ResearchIdentityEnvelopeSchema.optional().nullable(),
  result: ResearchResultEnvelopeSchema.optional().nullable(),
  error: ResearchErrorEnvelopeSchema.optional().nullable(),
  metadata: ResearchMetadataEnvelopeSchema.optional().nullable(),
});

export type TransportEnvelopeV1 = z.infer<typeof TransportEnvelopeV1Schema>;
