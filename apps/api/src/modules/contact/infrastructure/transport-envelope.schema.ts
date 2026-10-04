import { z } from 'zod';

export const RoleFamilySchema = z.enum([
  'LEADERSHIP',
  'ENGINEERING',
  'PRODUCT',
  'RECRUITING',
  'GENERAL',
]);

export const ProviderFailureCodeSchema = z.enum([
  'DISCOVERY_OPERATIONAL_FAILURE',
  'DISCOVERY_TIMEOUT',
  'UPSTREAM_SEARCH_FAILED',
  'ACQUISITION_RATE_LIMITED',
]);

export const ContactDiscoveryFailureSchema = z
  .object({
    code: ProviderFailureCodeSchema,
    retryable: z.boolean(),
    message: z.string().min(1),
  })
  .strict();

export const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const UuidV4Schema = z
  .string()
  .regex(UUID_V4_REGEX, 'Must be valid UUID v4');

export const HttpUrlSchema = z
  .string()
  .url()
  .refine((url) => /^https?:\/\//i.test(url), {
    message: 'Must be an HTTP or HTTPS URL',
  });

export const ContactEvidenceSpanSchema = z
  .object({
    claim: z.string().min(1),
    source_name: z.string().min(1),
    source_url: HttpUrlSchema,
    source_excerpt: z.string().min(1),
    classification: z.literal('FACT'),
    confidence: z.enum(['HIGH', 'MEDIUM']),
  })
  .strict();

export const ContactIdentitySchema = z
  .object({
    verified_domain: z.string(),
    primary_relationship: z.enum([
      'PRIMARY',
      'RELATED',
      'LEGACY',
      'UNRELATED',
      'UNKNOWN',
    ]),
    confidence: z.enum(['CONFIDENT', 'AMBIGUOUS', 'UNRESOLVED']),
  })
  .strict();

export const PersonContactCandidateSchema = z
  .object({
    person_kind: z.literal('PERSON'),
    first_name: z.string().min(1),
    last_name: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    email: z.string().email().nullable().optional(),
    confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    role_family: RoleFamilySchema.nullable().optional(),
    source: z.string().min(1),
    source_url: HttpUrlSchema,
    evidence: z.array(ContactEvidenceSpanSchema).min(1),
  })
  .strict();

export const RoleAddressContactCandidateSchema = z
  .object({
    person_kind: z.literal('ROLE_ADDRESS'),
    first_name: z.null(),
    last_name: z.null(),
    title: z.string().nullable().optional(),
    email: z.string().email(),
    confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    role_family: RoleFamilySchema.nullable().optional(),
    source: z.string().min(1),
    source_url: HttpUrlSchema,
    evidence: z.array(ContactEvidenceSpanSchema).min(1),
  })
  .strict();

export const DiscoveredContactCandidateSchema = z.discriminatedUnion(
  'person_kind',
  [PersonContactCandidateSchema, RoleAddressContactCandidateSchema],
);

export const ContactDiscoveryResponseSchema = z
  .object({
    contract_version: z.literal('1.0'),
    discovery_run_id: UuidV4Schema,
    status: z.enum(['COMPLETED', 'IDENTITY_HALTED', 'FAILED']),
    identity: ContactIdentitySchema,
    contacts: z.array(DiscoveredContactCandidateSchema),
    failure: ContactDiscoveryFailureSchema.optional(),
    unknowns: z.array(z.string()),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.status === 'COMPLETED') {
      if (data.identity.primary_relationship !== 'PRIMARY') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Status COMPLETED requires PRIMARY relationship',
        });
      }
      if (data.identity.confidence !== 'CONFIDENT') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Status COMPLETED requires CONFIDENT identity',
        });
      }
      if (data.failure !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Status COMPLETED must not contain a failure object',
        });
      }
    }
    if (data.status === 'IDENTITY_HALTED') {
      if (
        data.identity.primary_relationship === 'PRIMARY' &&
        data.identity.confidence === 'CONFIDENT'
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Status IDENTITY_HALTED requires non-(PRIMARY and CONFIDENT) identity',
        });
      }
      if (data.contacts.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Status IDENTITY_HALTED requires contacts to be empty',
        });
      }
      if (data.failure !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Status IDENTITY_HALTED must not contain a failure object',
        });
      }
    }
    if (data.status === 'FAILED') {
      if (data.contacts.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Status FAILED must not contain contacts',
        });
      }
      if (data.failure === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Status FAILED requires a typed failure object',
        });
      }
      // Identity fields represent last known state and may legitimately be PRIMARY + CONFIDENT
    }
  });

export type ContactDiscoveryResponseDto = z.infer<
  typeof ContactDiscoveryResponseSchema
>;
