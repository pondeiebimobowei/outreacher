import { Inject, Injectable } from '@nestjs/common';
import { Contact } from '@repo/db';
import { AppNotFoundException } from '../../../common/errors/application.exception';
import {
  CONTACT_REPOSITORY_TOKEN,
  IContactRepository,
} from '../domain/contact.repository.interface';

@Injectable()
export class GetContactByIdUseCase {
  constructor(
    @Inject(CONTACT_REPOSITORY_TOKEN)
    private readonly contactRepository: IContactRepository,
  ) {}

  async execute(workspaceId: string, contactId: string): Promise<Contact> {
    const contact = await this.contactRepository.findContactById(workspaceId, contactId);
    if (!contact) {
      throw new AppNotFoundException(`Contact ${contactId} not found in workspace.`);
    }
    return contact;
  }
}
