import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { Route as TemplatesRoute } from './templates';
import * as templatesApi from '../../api/templates';

jest.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
}));

jest.mock('../../api/templates', () => ({
  ...jest.requireActual('../../api/templates'),
  fetchTemplates: jest.fn(),
  fetchTemplateById: jest.fn(),
  createTemplate: jest.fn(),
  updateTemplate: jest.fn(),
  setTemplateSteps: jest.fn(),
  deleteTemplate: jest.fn(),
}));

describe('Templates route — /templates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (templatesApi.fetchTemplates as jest.Mock).mockResolvedValue([
      {
        id: 'tpl-1',
        workspaceId: 'ws-1',
        name: 'Executive Networking Sequence',
        stepCount: 3,
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-02T10:00:00Z',
        deletedAt: null,
      },
    ]);
  });

  function renderTemplates() {
    const config = TemplatesRoute as unknown as {
      component: React.ComponentType;
    };
    const Component = config.component;
    render(<Component />);
  }

  it('renders page heading and subtitle', async () => {
    renderTemplates();
    expect(
      screen.getByRole('heading', { level: 1, name: /email templates/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/create reusable outreach messages and ordered follow-up sequences/i),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(templatesApi.fetchTemplates).toHaveBeenCalled();
    });
  });

  it('mounts TemplateManager and fetches templates from API', async () => {
    renderTemplates();

    await waitFor(() => {
      expect(templatesApi.fetchTemplates).toHaveBeenCalledWith({ includeArchived: false });
    });

    expect(await screen.findByText('Executive Networking Sequence')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new template/i })).toBeInTheDocument();
    expect(screen.getByText('3 steps')).toBeInTheDocument();
  });
});
