import { useState, type FormEvent } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export function Register() {
  const user = useAuth((s) => s.user);
  const isLoading = useAuth((s) => s.isLoading);
  const register = useAuth((s) => s.register);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setSubmitting(true);
    try {
      await register(email, password, name);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-lg font-bold text-white shadow-lg shadow-accent/25">
            L
          </div>
          <h1 className="text-2xl font-bold text-ink">Create your account</h1>
          <p className="mt-1 text-sm text-muted">Get started with Lidox for free</p>
        </div>

        {/* Form card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border bg-white p-6 shadow-sm"
        >
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="mb-1.5 block text-sm font-medium text-ink"
              >
                Full name
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-gray-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 transition-default"
                autoComplete="name"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-ink"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-gray-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 transition-default"
                autoComplete="email"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-ink"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 pr-10 text-sm text-ink placeholder:text-gray-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 transition-default"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-default"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-muted">
                Must be at least 8 characters
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:ring-offset-2 disabled:opacity-60 transition-default"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Creating account...' : 'Create account'}
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium text-accent hover:text-indigo-700 transition-default"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
