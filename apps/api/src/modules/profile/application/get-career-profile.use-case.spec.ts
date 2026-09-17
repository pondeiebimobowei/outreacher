import { Test, TestingModule } from '@nestjs/testing';
import { CareerProfileDomain } from '../domain/career-profile.domain';
import {
  CAREER_PROFILE_REPOSITORY,
  ICareerProfileRepository,
} from '../domain/career-profile.repository.interface';
import { GetCareerProfileUseCase } from './get-career-profile.use-case';

describe('GetCareerProfileUseCase', () => {
  let useCase: GetCareerProfileUseCase;
  let mockRepository: jest.Mocked<ICareerProfileRepository>;

  const mockDomainProfile: CareerProfileDomain = {
    id: 'profile-123',
    workspaceId: 'workspace-123',
    headline: 'Senior Staff Engineer',
    summary: 'Building distributed systems',
    experienceSummary: '10 years in backend systems',
    targetRoles: ['Staff Engineer', 'Principal Engineer'],
    targetIndustries: ['Developer Tools', 'Fintech'],
    targetLocations: ['Remote', 'San Francisco, CA'],
    skills: ['TypeScript', 'Node.js', 'PostgreSQL'],
    portfolioUrl: 'https://example.com',
    githubUrl: 'https://github.com/example',
    linkedinUrl: 'https://linkedin.com/in/example',
    websiteUrl: 'https://website.example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockRepository = {
      getOrInitializeProfile: jest.fn().mockResolvedValue(mockDomainProfile),
      updateProfile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetCareerProfileUseCase,
        {
          provide: CAREER_PROFILE_REPOSITORY,
          useValue: mockRepository,
        },
      ],
    }).compile();

    useCase = module.get<GetCareerProfileUseCase>(GetCareerProfileUseCase);
  });

  it('should delegate to repository.getOrInitializeProfile with workspaceId', async () => {
    const result = await useCase.execute('workspace-123');

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockRepository.getOrInitializeProfile).toHaveBeenCalledWith(
      'workspace-123',
    );
    expect(result).toEqual(mockDomainProfile);
  });
});
