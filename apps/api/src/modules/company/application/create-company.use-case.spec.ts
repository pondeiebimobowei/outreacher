/* eslint-disable @typescript-eslint/unbound-method */
import { AppValidationException } from '../../../common/errors/application.exception';
import { CreateCompanyUseCase } from './create-company.use-case';
import { CompanyDuplicateNameException } from '../domain/company-duplicate-name.exception';
import { CompanyDuplicateNameError } from '../domain/company.domain';
import { ICompanyRepository } from '../domain/company.repository.interface';

describe('CreateCompanyUseCase', () => {
  let useCase: CreateCompanyUseCase;
  let repository: jest.Mocked<ICompanyRepository>;

  const workspaceId = 'ws-123';

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByNormalizedName: jest.fn(),
      findManyByWorkspace: jest.fn(),
      update: jest.fn(),
    };
    useCase = new CreateCompanyUseCase(repository);
  });

  it('creates a company successfully with normalized name and domain', async () => {
    repository.findByNormalizedName.mockResolvedValue(null);
    repository.create.mockImplementation(async (data) => ({
      id: 'comp-1',
      workspaceId: data.workspaceId,
      name: data.name,
      normalizedName: data.normalizedName,
      websiteUrl: data.websiteUrl ?? null,
      domain: data.domain ?? null,
      description: data.description ?? null,
      industry: data.industry ?? null,
      location: data.location ?? null,
      linkedinUrl: data.linkedinUrl ?? null,
      status: 'ACTIVE' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await useCase.execute(workspaceId, {
      name: 'Acme Corporation',
      websiteUrl: 'https://www.acme.com',
      industry: 'Tech',
    });

    expect(result.id).toBe('comp-1');
    expect(result.normalizedName).toBe('acme');
    expect(result.domain).toBe('acme.com');
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        name: 'Acme Corporation',
        normalizedName: 'acme',
        domain: 'acme.com',
      }),
    );
  });

  it('throws CompanyDuplicateNameException with existingCompanyId when preflight lookup finds duplicate', async () => {
    repository.findByNormalizedName.mockResolvedValue({
      id: 'existing-comp-id',
      workspaceId,
      name: 'Acme Inc',
      normalizedName: 'acme',
      websiteUrl: null,
      domain: null,
      description: null,
      industry: null,
      location: null,
      linkedinUrl: null,
      status: 'ACTIVE' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    try {
      await useCase.execute(workspaceId, { name: 'Acme Corp' });
      fail('Should have thrown CompanyDuplicateNameException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(CompanyDuplicateNameException);
      expect(err.existingCompanyId).toBe('existing-comp-id');
      expect(err.getResponse()).toEqual(
        expect.objectContaining({
          statusCode: 409,
          code: 'COMPANY_DUPLICATE_NAME',
          existingCompanyId: 'existing-comp-id',
        }),
      );
    }
  });

  it('handles DB P2002 race recovery by re-reading existing company ID', async () => {
    repository.findByNormalizedName
      .mockResolvedValueOnce(null) // Preflight passes
      .mockResolvedValueOnce({
        id: 'race-comp-id',
        workspaceId,
        name: 'Acme Inc',
        normalizedName: 'acme',
        websiteUrl: null,
        domain: null,
        description: null,
        industry: null,
        location: null,
        linkedinUrl: null,
        status: 'ACTIVE' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      }); // Race recovery findByNormalizedName find

    repository.create.mockRejectedValue(
      new CompanyDuplicateNameError(workspaceId, 'acme'),
    );

    try {
      await useCase.execute(workspaceId, { name: 'Acme Inc' });
      fail('Should have thrown CompanyDuplicateNameException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(CompanyDuplicateNameException);
      expect(err.existingCompanyId).toBe('race-comp-id');
    }
  });

  it('throws AppValidationException if company name normalizes to empty string', async () => {
    await expect(useCase.execute(workspaceId, { name: 'Inc' })).rejects.toThrow(
      AppValidationException,
    );
  });
});
