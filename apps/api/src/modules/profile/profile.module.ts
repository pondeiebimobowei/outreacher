import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { GetCareerProfileUseCase } from './application/get-career-profile.use-case';
import { UpdateCareerProfileUseCase } from './application/update-career-profile.use-case';
import { CAREER_PROFILE_REPOSITORY } from './domain/career-profile.repository.interface';
import { PrismaCareerProfileRepository } from './infrastructure/prisma-career-profile.repository';
import { ProfileController } from './profile.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ProfileController],
  providers: [
    GetCareerProfileUseCase,
    UpdateCareerProfileUseCase,
    {
      provide: CAREER_PROFILE_REPOSITORY,
      useClass: PrismaCareerProfileRepository,
    },
  ],
  exports: [GetCareerProfileUseCase, UpdateCareerProfileUseCase],
})
export class ProfileModule {}
