import {
  AppConflictException,
  AppForbiddenException,
  AppNotFoundException,
  AppValidationException,
} from '../../../common/errors/application.exception';
import { TemplateEngineService } from '../domain/template-engine.service';
import { CreateTemplateUseCase } from './create-template.use-case';
import { UpdateTemplateUseCase } from './update-template.use-case';
import { DeleteTemplateUseCase } from './delete-template.use-case';
import { GetTemplateUseCase } from './get-template.use-case';
import { ListTemplatesUseCase } from './list-templates.use-case';
import { PreviewTemplateUseCase } from './preview-template.use-case';

describe('Template Use Cases', () => {
  let templateEngine: TemplateEngineService;
  let prisma: any;

  beforeEach(() => {
    templateEngine = new TemplateEngineService();
    prisma = {
      $transaction: jest.fn().mockImplementation(async (cb) => cb(prisma)),
      emailTemplate: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      emailTemplateStep: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(),
      },
      campaign: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      outreach: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      senderAccount: {
        findUnique: jest.fn(),
      },
      personCompanyAssociation: {
        findFirst: jest.fn(),
      },
      opportunity: {
        findFirst: jest.fn(),
      },
    };
  });

  describe('CreateTemplateUseCase', () => {
    it('throws when name or steps missing', async () => {
      const useCase = new CreateTemplateUseCase(prisma, templateEngine);
      await expect(
        useCase.execute('ws-1', { name: '', steps: [] }),
      ).rejects.toThrow(AppValidationException);
    });

    it('throws when template with duplicate name exists in workspace', async () => {
      const useCase = new CreateTemplateUseCase(prisma, templateEngine);
      prisma.emailTemplate.findFirst.mockResolvedValue({ id: 'tmpl-1', name: 'Standard' });
      await expect(
        useCase.execute('ws-1', {
          name: 'Standard',
          steps: [{ sequence: 0, subjectTemplate: 'Sub', bodyTemplate: 'Body' }],
        }),
      ).rejects.toThrow(AppConflictException);
    });

    it('creates template and steps successfully', async () => {
      const useCase = new CreateTemplateUseCase(prisma, templateEngine);
      prisma.emailTemplate.findFirst.mockResolvedValue(null);
      prisma.emailTemplate.create.mockResolvedValue({
        id: 'tmpl-1',
        workspaceId: 'ws-1',
        name: 'Standard',
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.emailTemplateStep.findMany.mockResolvedValue([
        {
          id: 'step-1',
          templateId: 'tmpl-1',
          sequence: 0,
          subjectTemplate: 'Sub',
          bodyTemplate: 'Body',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const res = await useCase.execute('ws-1', {
        name: 'Standard',
        steps: [{ sequence: 0, subjectTemplate: 'Sub', bodyTemplate: 'Body' }],
      });
      expect(res.id).toBe('tmpl-1');
      expect(res.steps).toHaveLength(1);
    });
  });

  describe('UpdateTemplateUseCase', () => {
    it('throws when template not found', async () => {
      const useCase = new UpdateTemplateUseCase(prisma);
      prisma.emailTemplate.findFirst.mockResolvedValue(null);
      await expect(useCase.execute('ws-1', 'tmpl-1', { name: 'New' })).rejects.toThrow(
        AppNotFoundException,
      );
    });

    it('throws conflict if duplicate name exists', async () => {
      const useCase = new UpdateTemplateUseCase(prisma);
      prisma.emailTemplate.findFirst
        .mockResolvedValueOnce({ id: 'tmpl-1', name: 'Old' })
        .mockResolvedValueOnce({ id: 'tmpl-2', name: 'New' });
      await expect(useCase.execute('ws-1', 'tmpl-1', { name: 'New' })).rejects.toThrow(
        AppConflictException,
      );
    });

    it('updates name and returns dto', async () => {
      const useCase = new UpdateTemplateUseCase(prisma);
      prisma.emailTemplate.findFirst
        .mockResolvedValueOnce({ id: 'tmpl-1', name: 'Old' })
        .mockResolvedValueOnce(null);
      prisma.emailTemplate.update.mockResolvedValue({
        id: 'tmpl-1',
        workspaceId: 'ws-1',
        name: 'New',
        isArchived: false,
        steps: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const res = await useCase.execute('ws-1', 'tmpl-1', { name: 'New' });
      expect(res.name).toBe('New');
    });
  });

  describe('DeleteTemplateUseCase', () => {
    it('throws conflict if referenced by Campaign', async () => {
      const useCase = new DeleteTemplateUseCase(prisma);
      prisma.emailTemplate.findFirst.mockResolvedValue({ id: 'tmpl-1' });
      prisma.campaign.findFirst.mockResolvedValue({ id: 'camp-1' });
      prisma.outreach.findFirst.mockResolvedValue(null);

      await expect(useCase.execute('ws-1', 'tmpl-1')).rejects.toThrow(AppConflictException);
    });

    it('throws conflict if referenced by Outreach', async () => {
      const useCase = new DeleteTemplateUseCase(prisma);
      prisma.emailTemplate.findFirst.mockResolvedValue({ id: 'tmpl-1' });
      prisma.campaign.findFirst.mockResolvedValue(null);
      prisma.outreach.findFirst.mockResolvedValue({ id: 'out-1' });

      await expect(useCase.execute('ws-1', 'tmpl-1')).rejects.toThrow(AppConflictException);
    });

    it('deletes successfully when not referenced', async () => {
      const useCase = new DeleteTemplateUseCase(prisma);
      prisma.emailTemplate.findFirst.mockResolvedValue({ id: 'tmpl-1' });
      prisma.campaign.findFirst.mockResolvedValue(null);
      prisma.outreach.findFirst.mockResolvedValue(null);

      await useCase.execute('ws-1', 'tmpl-1');
      expect(prisma.emailTemplate.delete).toHaveBeenCalledWith({ where: { id: 'tmpl-1' } });
    });
  });

  describe('ListTemplatesUseCase', () => {
    it('filters out archived templates by default', async () => {
      const useCase = new ListTemplatesUseCase(prisma);
      prisma.emailTemplate.findMany.mockResolvedValue([
        {
          id: 'tmpl-1',
          workspaceId: 'ws-1',
          name: 'Active Template',
          isArchived: false,
          _count: { steps: 2 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const res = await useCase.execute('ws-1', false);
      expect(prisma.emailTemplate.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1', isArchived: false },
        include: { _count: { select: { steps: true } } },
        orderBy: { createdAt: 'desc' },
      });
      expect(res).toHaveLength(1);
      expect(res[0].stepCount).toBe(2);
    });
  });

  describe('PreviewTemplateUseCase', () => {
    it('throws when template uses {{sender.name}} but senderAccountId is omitted', async () => {
      const useCase = new PreviewTemplateUseCase(prisma, templateEngine);
      prisma.emailTemplate.findFirst.mockResolvedValue({
        id: 'tmpl-1',
        workspaceId: 'ws-1',
        steps: [
          {
            sequence: 0,
            subjectTemplate: 'Hi {{contact.firstName}}',
            bodyTemplate: 'From {{sender.name}}',
          },
        ],
      });

      await expect(
        useCase.execute('ws-1', 'tmpl-1', {
          personCompanyAssociationId: 'pca-1',
        }),
      ).rejects.toThrow(AppValidationException);
    });

    it('throws AppForbiddenException when senderAccount belongs to another workspace', async () => {
      const useCase = new PreviewTemplateUseCase(prisma, templateEngine);
      prisma.emailTemplate.findFirst.mockResolvedValue({
        id: 'tmpl-1',
        workspaceId: 'ws-1',
        steps: [
          {
            sequence: 0,
            subjectTemplate: 'Hi {{contact.firstName}}',
            bodyTemplate: 'From {{sender.name}}',
          },
        ],
      });
      prisma.senderAccount.findUnique.mockResolvedValue({
        id: 'sender-1',
        workspaceId: 'other-ws',
      });

      await expect(
        useCase.execute('ws-1', 'tmpl-1', {
          personCompanyAssociationId: 'pca-1',
          senderAccountId: 'sender-1',
        }),
      ).rejects.toThrow(AppForbiddenException);
    });

    it('renders preview with correct context mappings', async () => {
      const useCase = new PreviewTemplateUseCase(prisma, templateEngine);
      prisma.emailTemplate.findFirst.mockResolvedValue({
        id: 'tmpl-1',
        workspaceId: 'ws-1',
        steps: [
          {
            sequence: 0,
            subjectTemplate: 'Hello {{contact.firstName}} at {{company.name}}',
            bodyTemplate: 'Best, {{sender.name}}',
          },
        ],
      });
      prisma.senderAccount.findUnique.mockResolvedValue({
        id: 'sender-1',
        workspaceId: 'ws-1',
        fromName: 'Alice Sender',
      });
      prisma.personCompanyAssociation.findFirst.mockResolvedValue({
        id: 'pca-1',
        workspaceId: 'ws-1',
        role: 'VP Sales',
        person: { firstName: 'Bob', lastName: 'Smith' },
        company: { name: 'Acme Corp', websiteUrl: 'https://acme.com' },
      });

      const res = await useCase.execute('ws-1', 'tmpl-1', {
        personCompanyAssociationId: 'pca-1',
        senderAccountId: 'sender-1',
      });

      expect(res.steps).toHaveLength(1);
      expect(res.steps[0].subject).toBe('Hello Bob at Acme Corp');
      expect(res.steps[0].body).toBe('Best, Alice Sender');
    });
  });
});
