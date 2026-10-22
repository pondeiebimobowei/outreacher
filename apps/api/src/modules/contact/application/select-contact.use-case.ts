import { Inject, Injectable, Logger } from '@nestjs/common';
import { CompanyContactSelection } from '@repo/db';
import {
  AppForbiddenException,
  AppNotFoundException,
} from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  CONTACT_REPOSITORY_TOKEN,
  type IContactRepository,
} from '../domain/contact.repository.interface';

@Injectable()
export class SelectContactUseCase {
  private readonly logger = new Logger(SelectContactUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTACT_REPOSITORY_TOKEN)
    private readonly contactRepository: IContactRepository,
  ) {}

  async execute(
    workspaceId: string,
    companyId: string,
            personId: string,
            companyAssociationId: string,
  ): Promise<CompanyContactSelection> {
    // 1. Verify company existence and workspace ownership
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, workspaceId },
    });

    if (!company) {
      throw new AppNotFoundException(
        `Company ${companyId} not found in workspace.`,
      );
    }

    // 2. Cross-Entity & Tenant Integrity Check: Person MUST belong to target company AND workspace
    const contact = await this.prisma.person.findFirst({
      where: { id: personId, workspaceId },
    });

    if (!contact) {
      throw new AppNotFoundException(
        `Person ${personId} not found in workspace.`,
      );
    }

    const association = await this.prisma.personCompanyAssociation.findFirst({
      where: { personId, companyId }
    });
    if (!association) {
      this.logger.warn(
        `Cross-entity selection rejected: Person ${personId} does not belong to company ${companyId}`,
      );
      throw new AppForbiddenException(
        `Person ${personId} does not belong to target company ${companyId}.`,
      );
    }

    // 3. Perform Atomic Selection Upsert
    const selection = await this.contactRepository.setCompanyContactSelection(
      workspaceId,
      companyId,
      personId,
      companyAssociationId,
    );

    this.logger.log(
      `Selected contact ${personId} for company ${companyId} in workspace ${workspaceId}`,
    );
    return selection;
  }
}
