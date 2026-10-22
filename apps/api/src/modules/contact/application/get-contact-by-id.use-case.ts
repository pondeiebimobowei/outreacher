import { Inject, Injectable } from '@nestjs/common';
import { Person } from '@repo/db';
import { AppNotFoundException } from '../../../common/errors/application.exception';
import {
  CONTACT_REPOSITORY_TOKEN,
  type IContactRepository,
} from '../domain/contact.repository.interface';

@Injectable()
export class GetContactByIdUseCase {
  constructor(
    @Inject(CONTACT_REPOSITORY_TOKEN)
    private readonly contactRepository: IContactRepository,
  ) {}

  async execute(workspaceId: string, personId: string): Promise<Person> {
    const contact = await this.contactRepository.findContactById(
      workspaceId,
      personId,
    );
    if (!contact) {
      throw new AppNotFoundException(
        `Person ${personId} not found in workspace.`,
      );
    }
    return contact;
  }
}
