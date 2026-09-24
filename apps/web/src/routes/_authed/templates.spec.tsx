/**
 * Templates route — coming-soon surface tests
 *
 * Templates is an honest roadmap surface with no backend API.
 * Tests verify correct headings, accessibility, "Coming soon" badge presence,
 * and the explicit distinction between planned features and live functionality.
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Route as TemplatesRoute } from './templates';

// ─── Router mock ──────────────────────────────────────────────────────────────

jest.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
}));

// ─── Render helper ────────────────────────────────────────────────────────────

function renderTemplates() {
  // Route config shape: { component: ComponentFn }
  const config = TemplatesRoute as unknown as {
    component: React.ComponentType;
  };
  const Component = config.component;
  render(<Component />);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Templates route — /templates', () => {
  it('renders h1 "Email templates" page heading', () => {
    renderTemplates();
    expect(
      screen.getByRole('heading', { level: 1, name: /email templates/i }),
    ).toBeInTheDocument();
  });

  it('renders h2 "Template library" section heading', () => {
    renderTemplates();
    expect(
      screen.getByRole('heading', { level: 2, name: /template library/i }),
    ).toBeInTheDocument();
  });

  it('displays a "Coming soon" status badge', () => {
    renderTemplates();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it('shows roadmap copy that makes the surface honest (not functional)', () => {
    renderTemplates();
    expect(screen.getByText(/on the roadmap/i)).toBeInTheDocument();
  });

  it('labels the planned categories section correctly', () => {
    renderTemplates();
    expect(
      screen.getByText(/planned template categories/i),
    ).toBeInTheDocument();
  });

  it('labels the planned personalisation variables section correctly', () => {
    renderTemplates();
    expect(
      screen.getByText(/planned personalisation variables/i),
    ).toBeInTheDocument();
  });

  it('renders all 5 planned category pills', () => {
    renderTemplates();
    const expectedCategories = [
      'Networking',
      'Referral',
      'Hiring Manager',
      'Recruiter',
      'Follow-up',
    ];
    for (const cat of expectedCategories) {
      expect(screen.getByText(cat)).toBeInTheDocument();
    }
  });

  it('renders all 3 planned personalisation variable tags', () => {
    renderTemplates();
    // getByText treats {{ }} as a literal text match against rendered content
    expect(screen.getByText('{{firstName}}')).toBeInTheDocument();
    expect(screen.getByText('{{company}}')).toBeInTheDocument();
    expect(screen.getByText('{{role}}')).toBeInTheDocument();
  });

  it('renders no interactive template-action buttons — surface is read-only', () => {
    renderTemplates();
    // Coming-soon surface must not contain create/edit/save/archive buttons
    const buttons = screen.queryAllByRole('button');
    const templateActionLabels = buttons
      .map((b) => b.textContent?.toLowerCase() ?? '')
      .filter(
        (label) =>
          label.includes('create') ||
          label.includes('edit') ||
          label.includes('save') ||
          label.includes('archive'),
      );
    expect(templateActionLabels).toHaveLength(0);
  });
});
