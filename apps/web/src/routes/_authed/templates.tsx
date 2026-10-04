import { createFileRoute } from '@tanstack/react-router';
import { TemplateManager } from '../../features/template/components/TemplateManager';

export const Route = createFileRoute('/_authed/templates')({
  component: TemplatesRouteComponent,
});

function TemplatesRouteComponent() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
      <TemplateManager />
    </div>
  );
}
