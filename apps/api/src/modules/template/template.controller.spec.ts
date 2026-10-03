import { TemplateController } from './template.controller';

describe('TemplateController', () => {
  let controller: TemplateController;
  let createTemplateUseCase: any;
  let listTemplatesUseCase: any;
  let getTemplateUseCase: any;
  let updateTemplateUseCase: any;
  let setTemplateStepsUseCase: any;
  let deleteTemplateUseCase: any;
  let previewTemplateUseCase: any;

  beforeEach(() => {
    createTemplateUseCase = { execute: jest.fn() };
    listTemplatesUseCase = { execute: jest.fn() };
    getTemplateUseCase = { execute: jest.fn() };
    updateTemplateUseCase = { execute: jest.fn() };
    setTemplateStepsUseCase = { execute: jest.fn() };
    deleteTemplateUseCase = { execute: jest.fn() };
    previewTemplateUseCase = { execute: jest.fn() };

    controller = new TemplateController(
      createTemplateUseCase,
      listTemplatesUseCase,
      getTemplateUseCase,
      updateTemplateUseCase,
      setTemplateStepsUseCase,
      deleteTemplateUseCase,
      previewTemplateUseCase,
    );
  });

  it('should list template summaries with includeArchived query parameter', async () => {
    const req = { workspace: { id: 'ws-1' } } as any;
    listTemplatesUseCase.execute.mockResolvedValue([
      {
        id: 'tmpl-1',
        workspaceId: 'ws-1',
        name: 'Template 1',
        isArchived: false,
        stepCount: 2,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ]);

    const result = await controller.listTemplates(req, 'true');
    expect(listTemplatesUseCase.execute).toHaveBeenCalledWith('ws-1', true);
    expect(result).toHaveLength(1);
    expect(result[0].stepCount).toBe(2);
  });

  it('should get template details with full steps array', async () => {
    const req = { workspace: { id: 'ws-1' } } as any;
    getTemplateUseCase.execute.mockResolvedValue({
      id: 'tmpl-1',
      workspaceId: 'ws-1',
      name: 'Template 1',
      isArchived: false,
      steps: [
        {
          id: 'step-1',
          templateId: 'tmpl-1',
          sequence: 0,
          subjectTemplate: 'Sub',
          bodyTemplate: 'Body',
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
        },
      ],
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    });

    const result = await controller.getTemplate(req, 'tmpl-1');
    expect(getTemplateUseCase.execute).toHaveBeenCalledWith('ws-1', 'tmpl-1');
    expect(result.steps).toHaveLength(1);
  });

  it('should create template', async () => {
    const req = { workspace: { id: 'ws-1' } } as any;
    const dto = {
      name: 'New Template',
      steps: [{ sequence: 0, subjectTemplate: 'Sub', bodyTemplate: 'Body' }],
    };
    createTemplateUseCase.execute.mockResolvedValue({ id: 'tmpl-1', ...dto });

    const result = await controller.createTemplate(req, dto);
    expect(createTemplateUseCase.execute).toHaveBeenCalledWith('ws-1', dto);
    expect(result.id).toBe('tmpl-1');
  });

  it('should update template', async () => {
    const req = { workspace: { id: 'ws-1' } } as any;
    const dto = { name: 'Renamed' };
    updateTemplateUseCase.execute.mockResolvedValue({ id: 'tmpl-1', name: 'Renamed' });

    const result = await controller.updateTemplate(req, 'tmpl-1', dto);
    expect(updateTemplateUseCase.execute).toHaveBeenCalledWith('ws-1', 'tmpl-1', dto);
    expect(result.name).toBe('Renamed');
  });

  it('should delete template', async () => {
    const req = { workspace: { id: 'ws-1' } } as any;
    deleteTemplateUseCase.execute.mockResolvedValue(undefined);

    await controller.deleteTemplate(req, 'tmpl-1');
    expect(deleteTemplateUseCase.execute).toHaveBeenCalledWith('ws-1', 'tmpl-1');
  });

  it('should set template steps', async () => {
    const req = { workspace: { id: 'ws-1' } } as any;
    const dto = {
      steps: [
        { sequence: 0, subjectTemplate: 'S0', bodyTemplate: 'B0' },
        { sequence: 1, subjectTemplate: 'S1', bodyTemplate: 'B1' },
      ],
    };
    setTemplateStepsUseCase.execute.mockResolvedValue({ id: 'tmpl-1', steps: dto.steps });

    const result = await controller.setTemplateSteps(req, 'tmpl-1', dto);
    expect(setTemplateStepsUseCase.execute).toHaveBeenCalledWith('ws-1', 'tmpl-1', dto);
    expect(result.steps).toHaveLength(2);
  });

  it('should preview template', async () => {
    const req = { workspace: { id: 'ws-1' } } as any;
    const dto = { personCompanyAssociationId: 'pca-1' };
    previewTemplateUseCase.execute.mockResolvedValue({
      steps: [{ sequence: 0, subject: 'Rendered Sub', body: 'Rendered Body' }],
    });

    const result = await controller.previewTemplate(req, 'tmpl-1', dto);
    expect(previewTemplateUseCase.execute).toHaveBeenCalledWith('ws-1', 'tmpl-1', dto);
    expect(result.steps[0].subject).toBe('Rendered Sub');
  });
});
