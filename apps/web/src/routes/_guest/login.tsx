import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/_guest/login')({
  component: LoginPlaceholderComponent,
});

function LoginPlaceholderComponent() {
  return (
    <div>
      <h2 className="text-xl font-bold text-slate-900">Sign In</h2>
      <p className="mt-1 text-sm text-slate-500">Unauthenticated route boundary placeholder.</p>
      <div className="mt-6 border-t border-slate-100 pt-4">
        <Link to="/" className="text-sm font-medium text-slate-900 hover:underline">
          &larr; Back to application shell
        </Link>
      </div>
    </div>
  );
}
