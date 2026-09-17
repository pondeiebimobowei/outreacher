import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '@repo/db';
import pg from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: pg.Pool;
  private readonly clientInstance: PrismaClient;

  constructor(configService: ConfigService) {
    const connectionString = configService.getOrThrow<string>('DATABASE_URL');

    const pool = new pg.Pool({ connectionString });
    const adapter = new PrismaPg(pool);

    super({ adapter });
    this.pool = pool;
    this.clientInstance = new PrismaClient({ adapter });

    return new Proxy(this, {
      get(target, prop, receiver) {
        if (
          Object.prototype.hasOwnProperty.call(target, prop) ||
          prop === 'onModuleInit' ||
          prop === 'onModuleDestroy' ||
          prop === 'ping' ||
          prop === '$connect' ||
          prop === '$disconnect'
        ) {
          return Reflect.get(target, prop, target);
        }
        const clientVal = (target.clientInstance as any)[prop];
        return typeof clientVal === 'function'
          ? clientVal.bind(target.clientInstance)
          : clientVal;
      },
    });
  }

  async $connect(): Promise<void> {
    await this.clientInstance.$connect();
  }

  async $disconnect(): Promise<void> {
    await this.clientInstance.$disconnect();
  }

  $queryRaw<T = unknown>(
    query: any,
    ...values: any[]
  ): Prisma.PrismaPromise<T> {
    return (this.clientInstance as any).$queryRaw(query, ...values);
  }

  $executeRaw(query: any, ...values: any[]): Prisma.PrismaPromise<number> {
    return (this.clientInstance as any).$executeRaw(query, ...values);
  }

  $transaction(arg: any, options?: any): Promise<any> {
    return (this.clientInstance as any).$transaction(arg, options);
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
      throw error;
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
