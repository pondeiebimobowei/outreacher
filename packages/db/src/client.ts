import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import pg from 'pg';

export function createPrismaClient(connectionString = process.env.DATABASE_URL): {
  prisma: PrismaClient;
  pool: pg.Pool;
} {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to create PrismaClient');
  }
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  return { prisma, pool };
}
