/* eslint-disable @typescript-eslint/unbound-method */
import {
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { UpdateCompanyUseCase } from './update-company.use-case';
import { CompanyDuplicateNameException } from '../domain/company-duplicate-name.exception';
import { ICompanyRepository } from '../domain/company.repository.interface';

describe('UpdateCompanyUseCase', () => {
  let useCase: UpdateCompanyUseCase;
  let repository: jest.Mocked<ICompanyRepository>;

  const workspaceId = 'ws-123';
  const companyId = 'comp-1';

  const mockExistingCompany = {
    id: companyId,
    workspaceId,
    name: 'Acme Corporation',
    normalizedName: 'acme',
    websiteUrl: 'https://acme.com/',
    domain: 'acme.com',
    description: 'Old desc',
    industry: 'Old industry',
    location: 'Old loc',
    linkedinUrl: null,
    status: 'ACTIVE' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByNormalizedName: jest.fn(),
      findManyByWorkspace: jest.fn(),
      update: jest.fn(),
    };
    useCase = new UpdateCompanyUseCase(repository);
  });

  it('throws AppNotFoundException if company is not found in workspace', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute(workspaceId, 'non-existent', { name: 'New Name' }),
    ).rejects.toThrow(AppNotFoundException);
  });

  it('preserves websiteUrl and domain when websiteUrl is omitted in PATCH', async () => {
    repository.findById.mockResolvedValue(mockExistingCompany);
    repository.update.mockImplementation(async (_wsId, _id, data) => ({
      ...mockExistingCompany,
      ...data,
    }));

    await useCase.execute(workspaceId, companyId, {
      description: 'Updated desc',
    });

    expect(repository.update).toHaveBeenCalledWith(
      workspaceId,
      companyId,
      expect.not.objectContaining({ websiteUrl: expect.anything() }),
    );
  });

  it('clears websiteUrl and domain to null when websiteUrl is null or empty string', async () => {
    repository.findById.mockResolvedValue(mockExistingCompany);
    repository.update.mockImplementation(async (_wsId, _id, data) => ({
      ...mockExistingCompany,
      ...data,
    }));

    await useCase.execute(workspaceId, companyId, { websiteUrl: null });

    expect(repository.update).toHaveBeenCalledWith(
      workspaceId,
      companyId,
      expect.objectContaining({
        websiteUrl: null,
        domain: null,
      }),
    );
  });

  it('updates and normalizes websiteUrl and domain when valid URL is provided', async () => {
    repository.findById.mockResolvedValue(mockExistingCompany);
    repository.update.mockImplementation(async (_wsId, _id, data) => ({
      ...mockExistingCompany,
      ...data,
    }));

    await useCase.execute(workspaceId, companyId, {
      websiteUrl: 'www.new-domain.org',
    });

    expect(repository.update).toHaveBeenCalledWith(
      workspaceId,
      companyId,
      expect.objectContaining({
        websiteUrl: 'https://www.new-domain.org/',
        domain: 'new-domain.org',
      }),
    );
  });

  it('throws AppValidationException when invalid non-empty websiteUrl is provided', async () => {
    repository.findById.mockResolvedValue(mockExistingCompany);

    await expect(
      useCase.execute(workspaceId, companyId, { websiteUrl: 'invalid-url' }),
    ).rejects.toThrow(AppValidationException);
  });

  it('re-normalizes name on update and checks for duplicate name conflict', async () => {
    repository.findById.mockResolvedValue(mockExistingCompany);
    repository.findByNormalizedName.mockResolvedValue({
      id: 'other-comp-id',
      workspaceId,
      name: 'Beta Corp',
      normalizedName: 'beta',
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
      await useCase.execute(workspaceId, companyId, { name: 'Beta Inc' });
      fail('Should have thrown CompanyDuplicateNameException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(CompanyDuplicateNameException);
      expect(err.existingCompanyId).toBe('other-comp-id');
    }
  });
});
