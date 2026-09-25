import { Inject, Injectable } from '@nestjs/common';
import {
  CareerProfileDomain,
  CareerProfileChanges,
} from '../domain/career-profile.domain';
import {
  CAREER_PROFILE_REPOSITORY,
  type ICareerProfileRepository,
} from '../domain/career-profile.repository.interface';
import { UpdateCareerProfileDto } from '../dto/update-career-profile.dto';

@Injectable()
export class UpdateCareerProfileUseCase {
  constructor(
    @Inject(CAREER_PROFILE_REPOSITORY)
    private readonly profileRepository: ICareerProfileRepository,
  ) {}

  async execute(
    workspaceId: string,
    dto: UpdateCareerProfileDto,
  ): Promise<CareerProfileDomain> {
    const changes: CareerProfileChanges = {};

    if (dto.headline !== undefined) changes.headline = dto.headline;
    if (dto.summary !== undefined) changes.summary = dto.summary;
    if (dto.experienceSummary !== undefined)
      changes.experienceSummary = dto.experienceSummary;
    if (dto.targetRoles !== undefined) changes.targetRoles = dto.targetRoles;
    if (dto.targetIndustries !== undefined)
      changes.targetIndustries = dto.targetIndustries;
    if (dto.targetLocations !== undefined)
      changes.targetLocations = dto.targetLocations;
    if (dto.skills !== undefined) changes.skills = dto.skills;
    if (dto.portfolioUrl !== undefined) changes.portfolioUrl = dto.portfolioUrl;
    if (dto.githubUrl !== undefined) changes.githubUrl = dto.githubUrl;
    if (dto.linkedinUrl !== undefined) changes.linkedinUrl = dto.linkedinUrl;
    if (dto.websiteUrl !== undefined) changes.websiteUrl = dto.websiteUrl;
    if (dto.currentRole !== undefined) changes.currentRole = dto.currentRole;
    if (dto.yearsExperience !== undefined)
      changes.yearsExperience = dto.yearsExperience;
    if (dto.careerGoals !== undefined) changes.careerGoals = dto.careerGoals;
    if (dto.backgroundAndPositioning !== undefined)
      changes.backgroundAndPositioning = dto.backgroundAndPositioning;

    return this.profileRepository.updateProfile(workspaceId, changes);
  }
}
