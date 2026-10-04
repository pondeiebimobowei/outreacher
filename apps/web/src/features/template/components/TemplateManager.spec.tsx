import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TemplateManager } from './TemplateManager';
import * as templatesApi from '../../../api/templates';
import { ApiError } from '../../../api/client';

jest.mock('../../../api/templates', () => ({
  ...jest.requireActual('../../../api/templates'),
  fetchTemplates: jest.fn(),
  fetchTemplateById: jest.fn(),
  createTemplate: jest.fn(),
  updateTemplate: jest.fn(),
  setTemplateSteps: jest.fn(),
  deleteTemplate: jest.fn(),
  previewTemplate: jest.fn(),
}));

const mockTemplates: templatesApi.EmailTemplateSummaryDto[] = [
  {
    id: 'tmpl-1',
    workspaceId: 'ws-1',
    name: 'Executive Introduction',
    isArchived: false,
    stepCount: 2,
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-20T12:00:00.000Z',
  },
  {
    id: 'tmpl-2',
    workspaceId: 'ws-1',
    name: 'Engineering Inbound',
    isArchived: false,
    stepCount: 1,
    createdAt: '2026-09-21T10:00:00.000Z',
    updatedAt: '2026-09-21T12:00:00.000Z',
  },
];

const mockArchivedTemplates: templatesApi.EmailTemplateSummaryDto[] = [
  ...mockTemplates,
  {
    id: 'tmpl-archived',
    workspaceId: 'ws-1',
    name: 'Old Deprecated Campaign Template',
    isArchived: true,
    stepCount: 3,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-15T12:00:00.000Z',
  },
];

describe('TemplateManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (templatesApi.fetchTemplates as jest.Mock).mockResolvedValue(mockTemplates);
  });

  it('renders template list consuming EmailTemplateSummaryDto and displays stepCount', async () => {
    render(<TemplateManager />);

    expect(await screen.findByText('Executive Introduction')).toBeInTheDocument();
    expect(screen.getByText('Engineering Inbound')).toBeInTheDocument();
    expect(screen.getByText('2 steps')).toBeInTheDocument();
    expect(screen.getByText('1 step')).toBeInTheDocument();
    expect(templatesApi.fetchTemplates).toHaveBeenCalledWith({ includeArchived: false });
  });

  it('fetches templates with includeArchived=true when archive toggle is enabled', async () => {
    (templatesApi.fetchTemplates as jest.Mock).mockImplementation((params) => {
      if (params?.includeArchived) {
        return Promise.resolve(mockArchivedTemplates);
      }
      return Promise.resolve(mockTemplates);
    });

    render(<TemplateManager />);

    await screen.findByText('Executive Introduction');

    const toggle = screen.getByRole('checkbox', { name: /Show archived/i });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(templatesApi.fetchTemplates).toHaveBeenCalledWith({ includeArchived: true });
    });

    expect(await screen.findByText('Old Deprecated Campaign Template')).toBeInTheDocument();
  });

  it('opens TemplateEditorModal and creates template with ordered steps (step 0, 1, 2) and placeholder chips', async () => {
    (templatesApi.createTemplate as jest.Mock).mockResolvedValue({
      id: 'tmpl-3',
      workspaceId: 'ws-1',
      name: 'Founder Outreach',
      isArchived: false,
      steps: [
        {
          id: 'step-0',
          templateId: 'tmpl-3',
          sequence: 0,
          subjectTemplate: 'Hello {{contact.firstName}}',
          bodyTemplate: 'Hi {{contact.firstName}}, loved {{company.name}}',
          createdAt: '2026-10-04T00:00:00.000Z',
          updatedAt: '2026-10-04T00:00:00.000Z',
        },
      ],
      createdAt: '2026-10-04T00:00:00.000Z',
      updatedAt: '2026-10-04T00:00:00.000Z',
    });

    render(<TemplateManager />);

    await screen.findByText('Executive Introduction');

    const newBtn = screen.getByRole('button', { name: /New template/i });
    fireEvent.click(newBtn);

    expect(screen.getByRole('dialog', { name: /Create Email Template/i })).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/Template Name/i);
    fireEvent.change(nameInput, { target: { value: 'Founder Outreach' } });

    // Step 0 subject and body
    const subjectInput = screen.getByLabelText(/Step 0 Subject/i);
    fireEvent.change(subjectInput, { target: { value: 'Hello ' } });

    // Click placeholder chip
    const placeholderChip = screen.getByRole('button', { name: '{{contact.firstName}}' });
    fireEvent.click(placeholderChip);

    const bodyInput = screen.getByLabelText(/Step 0 Body/i);
    fireEvent.change(bodyInput, { target: { value: 'Hi there from our team' } });

    const saveBtn = screen.getByRole('button', { name: /Save Template/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(templatesApi.createTemplate).toHaveBeenCalledWith({
        name: 'Founder Outreach',
        steps: [
          expect.objectContaining({
            sequence: 0,
            subjectTemplate: expect.stringContaining('{{contact.firstName}}'),
            bodyTemplate: 'Hi there from our team',
          }),
        ],
      });
    });
  });

  it('displays warning badge when {{sender.name}} placeholder is used', async () => {
    render(<TemplateManager />);

    await screen.findByText('Executive Introduction');

    fireEvent.click(screen.getByRole('button', { name: /New template/i }));

    const subjectInput = screen.getByLabelText(/Step 0 Subject/i);
    fireEvent.change(subjectInput, { target: { value: 'Best, {{sender.name}}' } });

    expect(
      screen.getByText(/Cannot be used in campaigns \(senders dynamically chosen at send time\)/i),
    ).toBeInTheDocument();
  });

  it('handles archive action on template row', async () => {
    (templatesApi.updateTemplate as jest.Mock).mockResolvedValue({
      ...mockTemplates[0],
      isArchived: true,
    });

    render(<TemplateManager />);

    await screen.findByText('Executive Introduction');

    const archiveBtn = screen.getAllByRole('button', { name: /Archive/i })[0];
    fireEvent.click(archiveBtn);

    await waitFor(() => {
      expect(templatesApi.updateTemplate).toHaveBeenCalledWith('tmpl-1', {
        isArchived: true,
      });
    });
  });

  it('displays toast or alert on 409 Conflict when removing or mutating steps', async () => {
    const detailTmpl: templatesApi.EmailTemplateDto = {
      id: 'tmpl-1',
      workspaceId: 'ws-1',
      name: 'Executive Introduction',
      isArchived: false,
      steps: [
        {
          id: 's-0',
          templateId: 'tmpl-1',
          sequence: 0,
          subjectTemplate: 'Sub 0',
          bodyTemplate: 'Body 0',
          createdAt: '2026-09-20T10:00:00.000Z',
          updatedAt: '2026-09-20T12:00:00.000Z',
        },
        {
          id: 's-1',
          templateId: 'tmpl-1',
          sequence: 1,
          subjectTemplate: 'Sub 1',
          bodyTemplate: 'Body 1',
          createdAt: '2026-09-20T10:00:00.000Z',
          updatedAt: '2026-09-20T12:00:00.000Z',
        },
      ],
      createdAt: '2026-09-20T10:00:00.000Z',
      updatedAt: '2026-09-20T12:00:00.000Z',
    };

    (templatesApi.fetchTemplateById as jest.Mock).mockResolvedValue(detailTmpl);
    (templatesApi.setTemplateSteps as jest.Mock).mockRejectedValue(
      new ApiError(409, {
        message: 'Cannot delete step: Step 1 is required by active campaign "Q3 Sales"',
      }),
    );

    render(<TemplateManager />);

    await screen.findByText('Executive Introduction');

    const editBtn = screen.getAllByRole('button', { name: /Edit/i })[0];
    fireEvent.click(editBtn);

    await screen.findByRole('dialog', { name: /Edit Email Template/i });

    // Remove step 1
    const removeStepBtn = screen.getByRole('button', { name: /Remove Step 1/i });
    fireEvent.click(removeStepBtn);

    const saveBtn = screen.getByRole('button', { name: /Save Template/i });
    fireEvent.click(saveBtn);

    expect(
      await screen.findByText(/Cannot delete step: Step 1 is required by active campaign "Q3 Sales"/i),
    ).toBeInTheDocument();
  });
});
