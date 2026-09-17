import { Inject, Injectable } from '@nestjs/common';
import { Company } from '@repo/db';
import { AppNotFoundException } from '../../../common/errors/application.exception';
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
  type UpdateCompanyData,
} from '../domain/company.repository.interface';
import { UpdateCompanyDto } from '../dto/update-company.dto';

@Injectable()
export class UpdateCompanyUseCase {
  constructor(
    @Inject(COMPANY_REPOSITORY_TOKEN)
    private readonly companyRepository: ICompanyRepository,
  ) {}

  async execute(
    workspaceId: string,
    id: string,
    dto: UpdateCompanyDto,
  ): Promise<Company> {
    const existing = await this.companyRepository.findById(workspaceId, id);
    if (!existing) {
      throw new AppNotFoundException('Company');
    }

    const updateData: UpdateCompanyData = {};

    // 1. Handle name & normalizedName update
    if (dto.name !== undefined) {
      const newNormalizedName = normalizeCompanyName(dto.name);
      if (newNormalizedName !== existing.normalizedName) {
        const duplicate = await this.companyRepository.findByNormalizedName(
          workspaceId,
          newNormalizedName,
        );
        if (duplicate && duplicate.id !== id) {
          throw new CompanyDuplicateNameException(duplicate.id);
        }
      }
      updateData.name = dto.name.trim();
      updateData.normalizedName = newNormalizedName;
    }

    // 2. Handle 3-way websiteUrl & domain PATCH semantics
    if (dto.websiteUrl !== undefined) {
      if (dto.websiteUrl === null || dto.websiteUrl.trim() === '') {
        updateData.websiteUrl = null;
        updateData.domain = null;
      } else {
        updateData.websiteUrl = normalizeCompanyWebsiteUrl(dto.websiteUrl);
        updateData.domain = normalizeCompanyDomain(dto.websiteUrl);
      }
    }

    // 3. Handle optional text fields
    if (dto.description !== undefined) {
      updateData.description =
        dto.description === null ? null : dto.description.trim();
    }
    if (dto.industry !== undefined) {
      updateData.industry = dto.industry === null ? null : dto.industry.trim();
    }
    if (dto.location !== undefined) {
      updateData.location = dto.location === null ? null : dto.location.trim();
    }
    if (dto.linkedinUrl !== undefined) {
      updateData.linkedinUrl =
        dto.linkedinUrl === null ? null : dto.linkedinUrl.trim();
    }
    if (dto.status !== undefined) {
      updateData.status = dto.status;
    }

    try {
      const updated = await this.companyRepository.update(
        workspaceId,
        id,
        updateData,
      );
      if (!updated) {
        throw new AppNotFoundException('Company');
      }
      return updated;
    } catch (error) {
      if (error instanceof CompanyDuplicateNameError) {
        const targetNormalizedName =
          updateData.normalizedName ?? existing.normalizedName;
        const duplicate = await this.companyRepository.findByNormalizedName(
          workspaceId,
          targetNormalizedName,
        );
        if (duplicate) {
          throw new CompanyDuplicateNameException(duplicate.id);
        }
      }
      throw error;
    }
  }
}
