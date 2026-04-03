import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export function ProtectedRoute({ children }: Props) {
  const user = useAuth((s) => s.user);
  const isLoading = useAuth((s) => s.isLoading);

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          <p className="text-sm text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
