import { Inject, Injectable } from '@nestjs/common';
import { Campaign } from '@repo/db';
import { AppNotFoundException } from '../../../common/errors/application.exception';
import {
  CAMPAIGN_REPOSITORY_TOKEN,
  type ICampaignRepository,
} from '../domain/campaign.repository.interface';
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
  ): Promise<Campaign> {
    // Validate companyId belongs to the server-authoritative workspaceId
    const company = await this.companyRepository.findById(
      workspaceId,
      dto.companyId,
    );
    if (!company) {
      throw new AppNotFoundException('Company');
    }

    return this.campaignRepository.create({
      workspaceId,
      companyId: dto.companyId,
      name: dto.name.trim(),
      sendingIdentity: dto.sendingIdentity?.trim() ?? null,
      followUpDelayBusinessDays: dto.followUpDelayBusinessDays,
    });
  }
}
