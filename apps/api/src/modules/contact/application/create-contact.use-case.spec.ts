import { Test, TestingModule } from '@nestjs/testing';
import {
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { PrismaService } from '../../../database/prisma.service';
import { CONTACT_REPOSITORY_TOKEN } from '../domain/contact.repository.interface';
import { CreateContactUseCase } from './create-contact.use-case';

describe('CreateContactUseCase', () => {
  let useCase: CreateContactUseCase;
  let prismaMock: any;
  let repositoryMock: any;

  beforeEach(async () => {
    prismaMock = {
      company: {
        findFirst: jest.fn(),
      },
      person: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    repositoryMock = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateContactUseCase,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CONTACT_REPOSITORY_TOKEN, useValue: repositoryMock },
      ],
    }).compile();

    useCase = module.get<CreateContactUseCase>(CreateContactUseCase);
  });

  it('creates a new manual contact with email and source USER_PROVIDED', async () => {
    prismaMock.company.findFirst.mockResolvedValue({
      id: 'comp-1',
      workspaceId: 'ws-1',
    });
    prismaMock.person.findFirst.mockResolvedValue(null);
    prismaMock.person.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'cont-1', ...data }),
    );

    const result = await useCase.execute('ws-1', 'comp-1', {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'JANE.DOE@ACME.COM',
      title: 'Head of Engineering',
      personKind: 'PERSON',
      sourceUrl: 'https://acme.com/team',
    });

    expect(prismaMock.company.findFirst).toHaveBeenCalledWith({
      where: { id: 'comp-1', workspaceId: 'ws-1' },
    });
    expect(prismaMock.person.create).toHaveBeenCalledWith({
      data: {
        workspaceId: 'ws-1',
        personCompanyAssociations: { create: { companyId: 'comp-1', workspaceId: 'ws-1' } },
        personKind: 'PERSON',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane.doe@acme.com',
        title: 'Head of Engineering',
        source: 'USER_PROVIDED',
        sourceUrl: 'https://acme.com/team',
        confidence: null,
      },
    });
    expect(result.id).toBe('cont-1');
    expect(result.source).toBe('USER_PROVIDED');
    expect(result.confidence).toBeNull();
  });

  it('creates a new manual contact without email (email: null)', async () => {
    prismaMock.company.findFirst.mockResolvedValue({
      id: 'comp-1',
      workspaceId: 'ws-1',
    });
    prismaMock.person.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'cont-2', ...data }),
    );

    const result = await useCase.execute('ws-1', 'comp-1', {
      firstName: 'Alex',
      lastName: 'Rivera',
      title: 'VP Engineering',
    });

    expect(prismaMock.person.create).toHaveBeenCalledWith({
      data: {
        workspaceId: 'ws-1',
        personCompanyAssociations: { create: { companyId: 'comp-1', workspaceId: 'ws-1' } },
        personKind: 'PERSON',
        firstName: 'Alex',
        lastName: 'Rivera',
        email: null,
        title: 'VP Engineering',
        source: 'USER_PROVIDED',
        sourceUrl: null,
        confidence: null,
      },
    });
    expect(result.email).toBeNull();
  });

  it('updates an existing contact when matching email is provided', async () => {
    prismaMock.company.findFirst.mockResolvedValue({
      id: 'comp-1',
      workspaceId: 'ws-1',
    });
    prismaMock.person.findFirst.mockResolvedValue({
      id: 'cont-existing',
      workspaceId: 'ws-1',
      personCompanyAssociations: { create: { companyId: 'comp-1', workspaceId: 'ws-1' } },
      email: 'jane@acme.com',
    });
    prismaMock.person.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'cont-existing', email: 'jane@acme.com', ...data }),
    );

    const result = await useCase.execute('ws-1', 'comp-1', {
      firstName: 'Jane',
      lastName: 'Doe Updated',
      email: 'jane@acme.com',
      title: 'CTO',
    });

    expect(prismaMock.person.update).toHaveBeenCalledWith({
      where: { id: 'cont-existing' },
      data: {
        firstName: 'Jane',
        lastName: 'Doe Updated',
        title: 'CTO',
        personKind: 'PERSON',
        source: 'USER_PROVIDED',
        sourceUrl: null,
      },
    });
    expect(result.firstName).toBe('Jane');
  });

  it('creates new contact without deduplication when no email is provided', async () => {
    prismaMock.company.findFirst.mockResolvedValue({
      id: 'comp-1',
      workspaceId: 'ws-1',
    });
    prismaMock.person.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'cont-new', ...data }),
    );

    await useCase.execute('ws-1', 'comp-1', {
      firstName: 'Same',
      lastName: 'Name',
      title: 'Same Title',
    });

    // Verify contact.findFirst was NOT called when email is missing
    expect(prismaMock.person.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.person.create).toHaveBeenCalledTimes(1);
  });

  it('throws AppNotFoundException if company is not in workspace', async () => {
    prismaMock.company.findFirst.mockResolvedValue(null);

    await expect(
      useCase.execute('ws-1', 'comp-999', {
        firstName: 'John',
        lastName: 'Doe',
      }),
    ).rejects.toThrow(AppNotFoundException);
  });

  it('throws AppValidationException for invalid email format', async () => {
    prismaMock.company.findFirst.mockResolvedValue({
      id: 'comp-1',
      workspaceId: 'ws-1',
    });

    await expect(
      useCase.execute('ws-1', 'comp-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'invalid-email',
      }),
    ).rejects.toThrow(AppValidationException);
  });

  it('throws AppValidationException for invalid sourceUrl protocol', async () => {
    prismaMock.company.findFirst.mockResolvedValue({
      id: 'comp-1',
      workspaceId: 'ws-1',
    });

    await expect(
      useCase.execute('ws-1', 'comp-1', {
        firstName: 'John',
        lastName: 'Doe',
        sourceUrl: 'ftp://example.com',
      }),
    ).rejects.toThrow(AppValidationException);
  });
});
