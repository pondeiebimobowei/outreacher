import { Inject, Injectable } from '@nestjs/common';
import { CampaignMember } from '@repo/db';
import { AppNotFoundException } from '../../../common/errors/application.exception';
import {
  CAMPAIGN_REPOSITORY_TOKEN,
  type ICampaignRepository,
} from '../domain/campaign.repository.interface';
import {
  CONTACT_REPOSITORY_TOKEN,
  type IContactRepository,
} from '../../contact/domain/contact.repository.interface';
import { AddCampaignContactsDto } from '../dto/add-campaign-contacts.dto';

export interface AddCampaignContactsResult {
  bound: CampaignMember[];
  ignoredDuplicateCount: number;
}

@Injectable()
export class AddCampaignContactsUseCase {
  constructor(
    @Inject(CAMPAIGN_REPOSITORY_TOKEN)
    private readonly campaignRepository: ICampaignRepository,
    @Inject(CONTACT_REPOSITORY_TOKEN)
    private readonly contactRepository: IContactRepository,
  ) {}

  async execute(
    workspaceId: string,
    campaignId: string,
    dto: AddCampaignContactsDto,
  ): Promise<AddCampaignContactsResult> {
    // 1. Validate the campaign exists and belongs to the server-authoritative workspace
    const campaign = await this.campaignRepository.findById(
      workspaceId,
      campaignId,
    );
    if (!campaign) {
      throw new AppNotFoundException('Campaign');
    }

    // 2. Deduplicate the incoming contactIds (within the request payload itself)
    const uniqueRequestedIds = [...new Set(dto.contactIds)];

    // 3. All-or-nothing validation: resolve all contacts before persisting any
    const resolvedContacts = await Promise.all(
      uniqueRequestedIds.map((personId) =>
        this.contactRepository.findContactById(workspaceId, personId),
      ),
    );

    // Reject the entire request if any contact is not found in the workspace
    for (let i = 0; i < uniqueRequestedIds.length; i++) {
      if (!resolvedContacts[i]) {
        throw new AppNotFoundException('Person');
      }
    }

    // Verify all contacts belong to the same company as the campaign
    // for (const contact of resolvedContacts) {
    //   // contact is non-null here — null case handled above
    //   if (contact.companyId !== campaign.companyId) {
    //     throw new AppNotFoundException('Person');
    //   }
    // }

    // 4. Idempotency: identify which contactIds already have a binding
    const existingBindings =
      await this.campaignRepository.findExistingContactBindings(
        workspaceId,
        campaignId,
        uniqueRequestedIds,
      );

    const newContactIds = uniqueRequestedIds.filter(
      (id) => !existingBindings.has(id),
    );

    // 5. Persist new bindings in one transaction (createMany is atomic)
    let bound: CampaignMember[] = [];
    if (newContactIds.length > 0) {
      bound = await this.campaignRepository.createContactBindings(
        workspaceId,
        campaignId,
        newContactIds,
      );
    }

    return {
      bound,
      ignoredDuplicateCount: uniqueRequestedIds.length - newContactIds.length,
    };
  }
}
