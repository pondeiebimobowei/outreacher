import { Controller, Get } from '@nestjs/common';

export interface HealthCheckResponse {
  status: 'ok';
  timestamp: string;
  uptime: number;
}

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthCheckResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
