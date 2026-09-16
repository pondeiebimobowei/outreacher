import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export interface DatabaseHealthResult {
  status: 'UP' | 'DOWN';
  message?: string;
}

@Injectable()
export class DatabaseHealthService {
  private readonly logger = new Logger(DatabaseHealthService.name);

  constructor(private readonly prismaService: PrismaService) {}

  async checkHealth(): Promise<DatabaseHealthResult> {
    try {
      const isHealthy = await this.prismaService.ping();
      if (isHealthy) {
        return { status: 'UP' };
      }
      this.logger.error(
        'Database health ping failed: query returned unhealthy state',
      );
      return {
        status: 'DOWN',
        message: 'Database unavailable',
      };
    } catch (error) {
      this.logger.error(
        'Database health check probe threw an exception',
        error instanceof Error ? error.stack : String(error),
      );
      return {
        status: 'DOWN',
        message: 'Database unavailable',
      };
    }
  }
}
