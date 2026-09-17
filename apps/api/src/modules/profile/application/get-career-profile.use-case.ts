import { Inject, Injectable } from '@nestjs/common';
import { CareerProfileDomain } from '../domain/career-profile.domain';
import {
  CAREER_PROFILE_REPOSITORY,
  type ICareerProfileRepository,
} from '../domain/career-profile.repository.interface';

@Injectable()
export class GetCareerProfileUseCase {
  constructor(
    @Inject(CAREER_PROFILE_REPOSITORY)
    private readonly profileRepository: ICareerProfileRepository,
  ) {}

  async execute(workspaceId: string): Promise<CareerProfileDomain> {
    return this.profileRepository.getOrInitializeProfile(workspaceId);
  }
}
