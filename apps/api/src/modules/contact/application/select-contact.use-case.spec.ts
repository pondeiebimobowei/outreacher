import { Test, TestingModule } from '@nestjs/testing';
import {
  AppForbiddenException,
  AppNotFoundException,
} from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';
import { CONTACT_REPOSITORY_TOKEN } from '../domain/contact.repository.interface';
import { SelectContactUseCase } from './select-contact.use-case';

describe('SelectContactUseCase', () => {
  let useCase: SelectContactUseCase;
  let prisma: any;
  let repository: any;

  beforeEach(async () => {
    prisma = {
      company: { findFirst: jest.fn() },
      contact: { findFirst: jest.fn() },
    };
    repository = {
      setCompanyContactSelection: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SelectContactUseCase,
        { provide: PrismaService, useValue: prisma },
        { provide: CONTACT_REPOSITORY_TOKEN, useValue: repository },
      ],
    }).compile();

    useCase = module.get<SelectContactUseCase>(SelectContactUseCase);
  });

  it('rejects if target company does not exist in workspace', async () => {
    prisma.company.findFirst.mockResolvedValue(null);

    await expect(useCase.execute('ws-1', 'comp-1', 'cont-1')).rejects.toThrow(
      AppNotFoundException,
    );
  });

  it('rejects if contact does not exist in workspace', async () => {
    prisma.company.findFirst.mockResolvedValue({
      id: 'comp-1',
      workspaceId: 'ws-1',
    });
    prisma.contact.findFirst.mockResolvedValue(null);

    await expect(useCase.execute('ws-1', 'comp-1', 'cont-99')).rejects.toThrow(
      AppNotFoundException,
    );
  });

  it('rejects cross-entity selection when contact belongs to a different company', async () => {
    prisma.company.findFirst.mockResolvedValue({
      id: 'comp-1',
      workspaceId: 'ws-1',
    });
    prisma.contact.findFirst.mockResolvedValue({
      id: 'cont-1',
      workspaceId: 'ws-1',
      companyId: 'comp-OTHER', // Different company!
    });

    await expect(useCase.execute('ws-1', 'comp-1', 'cont-1')).rejects.toThrow(
      AppForbiddenException,
    );
  });

  it('successfully upserts selection when contact belongs to target company and workspace', async () => {
    prisma.company.findFirst.mockResolvedValue({
      id: 'comp-1',
      workspaceId: 'ws-1',
    });
    prisma.contact.findFirst.mockResolvedValue({
      id: 'cont-1',
      workspaceId: 'ws-1',
      companyId: 'comp-1',
    });
    repository.setCompanyContactSelection.mockResolvedValue({
      id: 'sel-1',
      workspaceId: 'ws-1',
      companyId: 'comp-1',
      contactId: 'cont-1',
    });

    const result = await useCase.execute('ws-1', 'comp-1', 'cont-1');
    expect(result.contactId).toBe('cont-1');
    expect(repository.setCompanyContactSelection).toHaveBeenCalledWith(
      'ws-1',
      'comp-1',
      'cont-1',
    );
  });
});
