import { Link } from 'react-router-dom';
import { ArrowLeft, FileQuestion } from 'lucide-react';

export function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-4">
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-accentLight">
          <FileQuestion className="h-10 w-10 text-accent" />
        </div>
        <h1 className="text-4xl font-bold text-ink">404</h1>
        <p className="mt-2 text-lg text-muted">Page not found</p>
        <p className="mt-1 text-sm text-muted">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          to="/dashboard"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition-default"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
