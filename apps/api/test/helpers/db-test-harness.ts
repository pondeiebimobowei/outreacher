import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

jest.unmock('@repo/db');
import { PrismaClient } from '@repo/db';

let prismaTestClient: PrismaClient | null = null;
let testPgPool: pg.Pool | null = null;

export function validateTestDatabaseUrl(): string {
  const testUrl = process.env.TEST_DATABASE_URL;
  const mainUrl = process.env.DATABASE_URL;

  if (!testUrl || testUrl.trim() === '') {
    throw new Error(
      'DATABASE SAFETY FAILURE: TEST_DATABASE_URL environment variable is not defined. Tests must be executed with a dedicated test database.',
    );
  }

  if (
    mainUrl &&
    testUrl.trim() === mainUrl.trim() &&
    (mainUrl.includes('dev') || mainUrl.includes('prod'))
  ) {
    throw new Error(
      'DATABASE SAFETY FAILURE: TEST_DATABASE_URL matches development or production DATABASE_URL. Integration tests will not run against the development or production database.',
    );
  }

  try {
    const urlObj = new URL(testUrl);
    const dbName = urlObj.pathname.substring(1);
    if (!dbName.includes('test')) {
      throw new Error(
        `DATABASE SAFETY FAILURE: TEST_DATABASE_URL database name "${dbName}" does not contain "test". Dedicated test database name required.`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('DATABASE SAFETY')) {
      throw err;
    }
    throw new Error(
      `DATABASE SAFETY FAILURE: Invalid TEST_DATABASE_URL format: ${String(err)}`,
    );
  }

  return testUrl;
}

export function getTestPrismaClient(): PrismaClient {
  if (!prismaTestClient) {
    const testUrl = validateTestDatabaseUrl();
    process.env.DATABASE_URL = testUrl;
    testPgPool = new pg.Pool({ connectionString: testUrl });
    const adapter = new PrismaPg(testPgPool);
    prismaTestClient = new PrismaClient({ adapter });
  }
  return prismaTestClient;
}

export const APPLICATION_TABLES = [
  'users',
  'auth_identities',
  'workspaces',
  'workspace_members',
  'career_profiles',
  'companies',
  'research_runs',
  'opportunities',
  'contacts',
  'evidence',
  'campaigns',
  'campaign_contacts',
  'email_sends',
  'email_events',
  'suppressions',
  'outcomes',
  'email_templates',
  'jobs',
  'inbound_replies',
  'integrations',
  'sender_accounts',
  'campaign_sender_accounts',
];

export async function cleanTestDatabase(): Promise<void> {
  getTestPrismaClient();
  if (!testPgPool) {
    throw new Error('Test PG pool not initialized');
  }

  const truncateStatements = APPLICATION_TABLES.map((tbl) => `"${tbl}"`).join(
    ', ',
  );

  await testPgPool.query(
    `TRUNCATE TABLE ${truncateStatements} RESTART IDENTITY CASCADE;`,
  );
}

export async function setupTestDatabase(): Promise<PrismaClient> {
  const client = getTestPrismaClient();
  await client.$connect();
  await cleanTestDatabase();
  return client;
}

export async function teardownTestDatabase(): Promise<void> {
  if (prismaTestClient) {
    await prismaTestClient.$disconnect();
    prismaTestClient = null;
  }
  if (testPgPool) {
    await testPgPool.end();
    testPgPool = null;
  }
}
