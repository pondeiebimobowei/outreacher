import { Inject, Injectable } from '@nestjs/common';
import { Campaign } from '@repo/db';
import { CampaignWithSenders } from '../domain/campaign.repository.interface';
import { normalizeCampaignName } from '@repo/shared';
import {
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import {
  CAMPAIGN_REPOSITORY_TOKEN,
  CampaignDuplicateNameError,
  type ICampaignRepository,
} from '../domain/campaign.repository.interface';
import { CampaignDuplicateNameException } from '../domain/campaign-duplicate-name.exception';
import {
  COMPANY_REPOSITORY_TOKEN,
  type ICompanyRepository,
} from '../../company/domain/company.repository.interface';
import { CreateCampaignDto } from '../dto/create-campaign.dto';

@Injectable()
export class CreateCampaignUseCase {
  constructor(
    @Inject(CAMPAIGN_REPOSITORY_TOKEN)
    private readonly campaignRepository: ICampaignRepository,
    @Inject(COMPANY_REPOSITORY_TOKEN)
    private readonly companyRepository: ICompanyRepository,
  ) {}

  async execute(
    workspaceId: string,
    dto: CreateCampaignDto,
  ): Promise<CampaignWithSenders> {
    // Validate companyId belongs to the server-authoritative workspaceId
    const company = await this.companyRepository.findById(
      workspaceId,
      dto.companyId,
    );
    if (!company) {
      throw new AppNotFoundException('Company');
    }

    const normalizedName = normalizeCampaignName(dto.name);
    if (!normalizedName) {
      throw new AppValidationException(
        'Campaign name cannot be empty or consist solely of whitespace/dashes.',
      );
    }

    // Preflight lookup
    const existing = await this.campaignRepository.findByNormalizedName(
      workspaceId,
      dto.companyId,
      normalizedName,
    );
    if (existing) {
      throw new CampaignDuplicateNameException(existing.id);
    }

    try {
      return await this.campaignRepository.create({
        workspaceId,
        companyId: dto.companyId,
        name: dto.name.trim(),
        normalizedName,
        sendingIdentity: dto.sendingIdentity?.trim() ?? null,
        followUpDelayBusinessDays: dto.followUpDelayBusinessDays,
      });
    } catch (error: any) {
      if (error instanceof CampaignDuplicateNameError) {
        // Race recovery: re-read existing campaign by (workspaceId, companyId, normalizedName)
        const raceRow = await this.campaignRepository.findByNormalizedName(
          workspaceId,
          dto.companyId,
          normalizedName,
        );
        if (raceRow) {
          throw new CampaignDuplicateNameException(raceRow.id);
        }
      }
      throw error;
    }
  }
}
