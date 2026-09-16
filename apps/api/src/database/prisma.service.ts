import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@repo/db';
import pg from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: pg.Pool;

  constructor(configService: ConfigService) {
    const connectionString = configService.get<string>(
      'DATABASE_URL',
      'postgresql://postgres:postgres@localhost:5432/outreacher_dev?schema=public',
    );

    const pool = new pg.Pool({ connectionString });

    const adapter = new PrismaPg(pool);

    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Successfully connected to PostgreSQL database');
    } catch (error) {
      this.logger.error(
        'Failed to connect to PostgreSQL database during startup',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
      await this.pool.end();
      this.logger.log('Disconnected from PostgreSQL database');
    } catch (error) {
      this.logger.error(
        'Error disconnecting from PostgreSQL database',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
