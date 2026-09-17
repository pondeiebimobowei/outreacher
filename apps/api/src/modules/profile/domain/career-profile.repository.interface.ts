import {
  CareerProfileDomain,
  CareerProfileChanges,
} from './career-profile.domain';

export const CAREER_PROFILE_REPOSITORY = Symbol('ICareerProfileRepository');

export interface ICareerProfileRepository {
  getOrInitializeProfile(workspaceId: string): Promise<CareerProfileDomain>;
  updateProfile(
    workspaceId: string,
    changes: CareerProfileChanges,
  ): Promise<CareerProfileDomain>;
}
