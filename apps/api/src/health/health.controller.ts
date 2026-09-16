import { Controller, Get } from '@nestjs/common';
import {
  DatabaseHealthResult,
  DatabaseHealthService,
} from '../database/database-health.service';

export interface HealthCheckResponse {
  status: 'ok';
  timestamp: string;
  uptime: number;
  services: {
    database: DatabaseHealthResult;
  };
}

@Controller('health')
export class HealthController {
  constructor(private readonly databaseHealthService: DatabaseHealthService) {}

  @Get()
  async getHealth(): Promise<HealthCheckResponse> {
    const databaseHealth = await this.databaseHealthService.checkHealth();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: databaseHealth,
      },
    };
  }
}
