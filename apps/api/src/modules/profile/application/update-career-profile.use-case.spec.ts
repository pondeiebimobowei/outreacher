import { Test, TestingModule } from '@nestjs/testing';
import { CareerProfileDomain } from '../domain/career-profile.domain';
import {
  CAREER_PROFILE_REPOSITORY,
  ICareerProfileRepository,
} from '../domain/career-profile.repository.interface';
import { UpdateCareerProfileDto } from '../dto/update-career-profile.dto';
import { UpdateCareerProfileUseCase } from './update-career-profile.use-case';

describe('UpdateCareerProfileUseCase', () => {
  let useCase: UpdateCareerProfileUseCase;
  let mockRepository: jest.Mocked<ICareerProfileRepository>;

  const mockDomainProfile: CareerProfileDomain = {
    id: 'profile-123',
    workspaceId: 'workspace-123',
    headline: 'Senior Staff Engineer',
    summary: 'Building distributed systems',
    experienceSummary: '10 years in backend systems',
    targetRoles: ['Staff Engineer'],
    targetIndustries: ['Fintech'],
    targetLocations: ['Remote'],
    skills: ['TypeScript'],
    portfolioUrl: null,
    githubUrl: null,
    linkedinUrl: null,
    websiteUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockRepository = {
      getOrInitializeProfile: jest.fn(),
      updateProfile: jest.fn().mockResolvedValue(mockDomainProfile),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateCareerProfileUseCase,
        {
          provide: CAREER_PROFILE_REPOSITORY,
          useValue: mockRepository,
        },
      ],
    }).compile();

    useCase = module.get<UpdateCareerProfileUseCase>(
      UpdateCareerProfileUseCase,
    );
  });

  it('should map DTO properties to explicit CareerProfileChanges allowlist', async () => {
    const dto: UpdateCareerProfileDto = {
      headline: 'Senior Staff Engineer',
      skills: ['TypeScript'],
    };

    const result = await useCase.execute('workspace-123', dto);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockRepository.updateProfile).toHaveBeenCalledWith('workspace-123', {
      headline: 'Senior Staff Engineer',
      skills: ['TypeScript'],
    });
    expect(result).toEqual(mockDomainProfile);
  });

  it('should pass explicit null for cleared fields', async () => {
    const dto: UpdateCareerProfileDto = {
      githubUrl: null,
    };

    await useCase.execute('workspace-123', dto);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockRepository.updateProfile).toHaveBeenCalledWith('workspace-123', {
      githubUrl: null,
    });
  });

  it('should pass empty changes object on empty DTO body', async () => {
    const dto: UpdateCareerProfileDto = {};

    await useCase.execute('workspace-123', dto);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockRepository.updateProfile).toHaveBeenCalledWith(
      'workspace-123',
      {},
    );
  });
});
