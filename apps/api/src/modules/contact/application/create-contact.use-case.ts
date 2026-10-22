import { Inject, Injectable, Logger } from '@nestjs/common';
import { Person } from '@repo/db';
import {
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';
import { ContactValidator } from '../domain/contact-validator';
import {
  CONTACT_REPOSITORY_TOKEN,
  type IContactRepository,
} from '../domain/contact.repository.interface';
import { CreateContactRequestDto } from '../dto/create-contact-request.dto';

@Injectable()
export class CreateContactUseCase {
  private readonly logger = new Logger(CreateContactUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTACT_REPOSITORY_TOKEN)
    private readonly contactRepository: IContactRepository,
  ) {}

  async execute(
    workspaceId: string,
    companyId: string,
    dto: CreateContactRequestDto,
  ): Promise<Person> {
    // 1. Verify Company Ownership in Workspace
    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        workspaceId,
      },
    });

    if (!company) {
      throw new AppNotFoundException(
        `Company ${companyId} not found in workspace.`,
      );
    }

    // 2. Validate & Normalize Inputs
    const firstName = dto.firstName?.trim();
    const lastName = dto.lastName?.trim();
    if (!firstName || !lastName) {
      throw new AppValidationException('Person name is required.');
    }

    let normalizedEmail: string | null = null;
    if (
      dto.email !== undefined &&
      dto.email !== null &&
      dto.email.trim() !== ''
    ) {
      normalizedEmail = ContactValidator.normalizeEmail(dto.email);
      if (!normalizedEmail) {
        throw new AppValidationException('Invalid email address format.');
      }
    }

    let validatedSourceUrl: string | null = null;
    if (
      dto.sourceUrl !== undefined &&
      dto.sourceUrl !== null &&
      dto.sourceUrl.trim() !== ''
    ) {
      validatedSourceUrl = ContactValidator.validateSourceUrl(dto.sourceUrl);
      if (!validatedSourceUrl) {
        throw new AppValidationException(
          'Invalid reference URL format. Must start with http:// or https://.',
        );
      }
    }

    const personKind =
      dto.personKind === 'ROLE_ADDRESS' ? 'ROLE_ADDRESS' : 'PERSON';
    const trimmedTitle = dto.title?.trim() || null;

    // 3. Persist Person (Upsert on Email, Always Create on No-Email)
    let contact: Person;
    if (normalizedEmail) {
      const existing = await this.prisma.person.findFirst({
        where: {
          workspaceId,
          email: normalizedEmail,
        },
      });

      if (existing) {
        contact = await this.prisma.person.update({
          where: { id: existing.id },
          data: {
            firstName,
            lastName,
            title: trimmedTitle,
            personKind,
            source: 'USER_PROVIDED',
            sourceUrl: validatedSourceUrl,
          },
        });
        this.logger.log(
          `Updated existing contact ${contact.id} by email ${normalizedEmail}`,
        );
      } else {
        contact = await this.prisma.person.create({
          data: {
            workspaceId,
            personKind,
            firstName,
            lastName,
            email: normalizedEmail,
            title: trimmedTitle,
            source: 'USER_PROVIDED',
            sourceUrl: validatedSourceUrl,
            confidence: null,
          },
        });
        this.logger.log(
          `Created new manual contact ${contact.id} with email ${normalizedEmail}`,
        );
      }
    } else {
      // No email: ALWAYS create new contact record without deduplication on name+title
      contact = await this.prisma.person.create({
        data: {
          workspaceId,
          personKind,
          firstName,
          lastName,
          email: null,
          title: trimmedTitle,
          source: 'USER_PROVIDED',
          sourceUrl: validatedSourceUrl,
          confidence: null,
        },
      });
      this.logger.log(`Created new manual contact ${contact.id} without email`);
    }

    return contact;
  }
}
