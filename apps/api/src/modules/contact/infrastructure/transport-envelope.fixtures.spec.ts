import * as fs from 'fs';
import * as path from 'path';
import { ZodError } from 'zod';
import { ContactDiscoveryResponseSchema } from './transport-envelope.schema';

const FIXTURES_DIR = path.resolve(
  __dirname,
  '../../../../../../packages/shared/fixtures/contact-discovery-v1',
);

function loadFixture(filename: string): unknown {
  const filePath = path.join(FIXTURES_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fixture file not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

describe('Transport Contract v1.0 Fixtures Validation (Zod)', () => {
  describe('Compliant Fixtures', () => {
    it('validates valid_success.json fixture', () => {
      const data = loadFixture('valid_success.json');
      const parsed = ContactDiscoveryResponseSchema.parse(data);

      expect(parsed.contract_version).toBe('1.0');
      expect(parsed.discovery_run_id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(parsed.status).toBe('COMPLETED');
      expect(parsed.identity.verified_domain).toBe('example.com');
      expect(parsed.identity.primary_relationship).toBe('PRIMARY');
      expect(parsed.identity.confidence).toBe('CONFIDENT');
      expect(parsed.contacts).toHaveLength(2);

      const [c0, c1] = parsed.contacts;
      expect(c0.person_kind).toBe('PERSON');
      expect(c0.first_name).toBe('Jane');
      expect(c0.last_name).toBe('Doe');
      expect(c0.email).toBe('jane@example.com');
      expect(c0.role_family).toBe('ENGINEERING');
      expect(c0.evidence).toHaveLength(1);

      expect(c1.person_kind).toBe('ROLE_ADDRESS');
      expect(c1.first_name).toBeNull();
      expect(c1.email).toBe('careers@example.com');
      expect(c1.role_family).toBe('RECRUITING');

      expect(parsed.failure).toBeUndefined();
      expect(parsed.unknowns).toEqual([]);
    });

    it('validates identity_halted.json fixture', () => {
      const data = loadFixture('identity_halted.json');
      const parsed = ContactDiscoveryResponseSchema.parse(data);

      expect(parsed.contract_version).toBe('1.0');
      expect(parsed.discovery_run_id).toBe('550e8400-e29b-41d4-a716-446655440001');
      expect(parsed.status).toBe('IDENTITY_HALTED');
      expect(parsed.identity.verified_domain).toBe('crown.com');
      expect(parsed.identity.primary_relationship).toBe('RELATED');
      expect(parsed.identity.confidence).toBe('AMBIGUOUS');
      expect(parsed.contacts).toEqual([]);
      expect(parsed.failure).toBeUndefined();
      expect(parsed.unknowns).toContain('identity_related_ambiguous');
    });

    it('validates typed_acquisition_failure.json fixture', () => {
      const data = loadFixture('typed_acquisition_failure.json');
      const parsed = ContactDiscoveryResponseSchema.parse(data);

      expect(parsed.contract_version).toBe('1.0');
      expect(parsed.discovery_run_id).toBe('550e8400-e29b-41d4-a716-446655440002');
      expect(parsed.status).toBe('FAILED');
      expect(parsed.contacts).toEqual([]);
      expect(parsed.failure).toBeDefined();
      expect(parsed.failure!.code).toBe('DISCOVERY_TIMEOUT');
      expect(parsed.failure!.retryable).toBe(true);
      expect(parsed.failure!.message).toContain('Upstream crawl timed out');
    });
  });

  describe('Non-Compliant Fixtures (Must Throw ZodError)', () => {
    it('rejects invalid_contract_version.json (version 2.0)', () => {
      const data = loadFixture('invalid_contract_version.json');
      expect(() => ContactDiscoveryResponseSchema.parse(data)).toThrow(ZodError);
    });

    it('rejects invalid_discovery_run_id.json (UUID v1)', () => {
      const data = loadFixture('invalid_discovery_run_id.json');
      expect(() => ContactDiscoveryResponseSchema.parse(data)).toThrow(ZodError);
    });

    it('rejects unknown_role_family.json (NINJA_WIZARD)', () => {
      const data = loadFixture('unknown_role_family.json');
      expect(() => ContactDiscoveryResponseSchema.parse(data)).toThrow(ZodError);
    });

    it('rejects missing_required_fields.json', () => {
      const data = loadFixture('missing_required_fields.json');
      expect(() => ContactDiscoveryResponseSchema.parse(data)).toThrow(ZodError);
    });

    it('rejects unexpected_fields.json (speculative_forbidden_field)', () => {
      const data = loadFixture('unexpected_fields.json');
      expect(() => ContactDiscoveryResponseSchema.parse(data)).toThrow(ZodError);
    });

    it('rejects malformed_nested_payload.json (javascript: URL)', () => {
      const data = loadFixture('malformed_nested_payload.json');
      expect(() => ContactDiscoveryResponseSchema.parse(data)).toThrow(ZodError);
    });
  });
});
