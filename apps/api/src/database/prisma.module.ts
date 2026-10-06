import { Global, Module } from '@nestjs/common';
import { PrismaClient } from '@repo/db';
import { DatabaseHealthService } from './database-health.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [
    PrismaService,
    DatabaseHealthService,
    {
      provide: PrismaClient,
      useExisting: PrismaService,
    },
  ],
  exports: [PrismaService, DatabaseHealthService, PrismaClient],
})
export class PrismaModule { }
