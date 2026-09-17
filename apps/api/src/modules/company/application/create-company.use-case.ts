import { Inject, Injectable } from '@nestjs/common';
import { Company } from '@repo/db';
import {
  CompanyDuplicateNameError,
  normalizeCompanyDomain,
  normalizeCompanyName,
  normalizeCompanyWebsiteUrl,
} from '../domain/company.domain';
import { CompanyDuplicateNameException } from '../domain/company-duplicate-name.exception';
import {
  COMPANY_REPOSITORY_TOKEN,
  type ICompanyRepository,
} from '../domain/company.repository.interface';
import { CreateCompanyDto } from '../dto/create-company.dto';

@Injectable()
export class CreateCompanyUseCase {
  constructor(
    @Inject(COMPANY_REPOSITORY_TOKEN)
    private readonly companyRepository: ICompanyRepository,
  ) {}

  async execute(workspaceId: string, dto: CreateCompanyDto): Promise<Company> {
    const normalizedName = normalizeCompanyName(dto.name);
    const normalizedWebsiteUrl = normalizeCompanyWebsiteUrl(dto.websiteUrl);
    const normalizedDomain = normalizeCompanyDomain(dto.websiteUrl);

    // Preflight lookup for duplicate
    const existing = await this.companyRepository.findByNormalizedName(
      workspaceId,
      normalizedName,
    );
    if (existing) {
      throw new CompanyDuplicateNameException(existing.id);
    }

    try {
      return await this.companyRepository.create({
        workspaceId,
        name: dto.name.trim(),
        normalizedName,
        websiteUrl: normalizedWebsiteUrl,
        domain: normalizedDomain,
        description: dto.description?.trim() ?? null,
        industry: dto.industry?.trim() ?? null,
        location: dto.location?.trim() ?? null,
        linkedinUrl: dto.linkedinUrl?.trim() ?? null,
      });
    } catch (error) {
      if (error instanceof CompanyDuplicateNameError) {
        // Race recovery: re-read existing company by (workspaceId, normalizedName) to obtain existingCompanyId
        const raceExisting = await this.companyRepository.findByNormalizedName(
          workspaceId,
          normalizedName,
        );
        if (raceExisting) {
          throw new CompanyDuplicateNameException(raceExisting.id);
        }
      }
      throw error;
    }
  }
}
