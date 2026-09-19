import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/errors/application.exception';

export class CampaignDuplicateNameException extends AppException {
  public readonly existingCampaignId: string;

  constructor(existingCampaignId: string) {
    super(
      'A campaign with this name already exists for this company.',
      HttpStatus.CONFLICT,
      'CAMPAIGN_ALREADY_EXISTS',
      { existingCampaignId },
    );
    this.existingCampaignId = existingCampaignId;
  }

  override getResponse() {
    return {
      statusCode: HttpStatus.CONFLICT,
      code: 'CAMPAIGN_ALREADY_EXISTS',
      message: 'A campaign with this name already exists for this company.',
      existingCampaignId: this.existingCampaignId,
      details: { existingCampaignId: this.existingCampaignId },
    };
  }
}
