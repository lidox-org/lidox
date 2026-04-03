import { useState, useEffect, useCallback, type FormEvent } from 'react';
import {
  X,
  Mail,
  Loader2,
  UserPlus,
  Users,
  Trash2,
  Crown,
  Copy,
  Check,
} from 'lucide-react';
import { api } from '../lib/api';

interface Permission {
  id: string;
  userId: string | null;
  role: string;
  user?: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  } | null;
}

interface Props {
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ShareDialog({ documentId, isOpen, onClose }: Props) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'commenter' | 'viewer'>('editor');
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Permission[]>(`/documents/${documentId}/permissions`);
      setPermissions(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (isOpen) {
      fetchPermissions();
    }
  }, [isOpen, fetchPermissions]);

  const handleShare = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setSharing(true);
    setError(null);

    try {
      await api(`/documents/${documentId}/share`, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), role }),
      });
      setEmail('');
      fetchPermissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share');
    } finally {
      setSharing(false);
    }
  };

  const handleRemove = async (permId: string) => {
    try {
      await api(`/documents/${documentId}/permissions/${permId}`, {
        method: 'DELETE',
      });
      setPermissions((prev) => prev.filter((p) => p.id !== permId));
    } catch {
      // ignore
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const getRoleBadgeClass = (r: string) => {
    switch (r) {
      case 'owner':
        return 'bg-amber-50 text-amber-700';
      case 'editor':
        return 'bg-blue-50 text-blue-700';
      case 'commenter':
        return 'bg-green-50 text-green-700';
      case 'viewer':
        return 'bg-gray-100 text-gray-600';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold text-ink">Share Document</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-surface hover:text-ink transition-default"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Invite form */}
        <form onSubmit={handleShare} className="border-b border-border p-6">
          {error && (
            <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email address"
                required
                className="w-full rounded-lg border border-border bg-surface py-2.5 pl-10 pr-3 text-sm text-ink placeholder:text-gray-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 transition-default"
              />
            </div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 transition-default"
            >
              <option value="editor">Editor</option>
              <option value="commenter">Commenter</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              type="submit"
              disabled={sharing}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-default"
            >
              {sharing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
            </button>
          </div>
        </form>

        {/* People list */}
        <div className="max-h-64 overflow-y-auto px-6 py-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
            People with access
          </p>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
            </div>
          ) : permissions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">
              Only you have access
            </p>
          ) : (
            <div className="space-y-2">
              {permissions.map((perm) => (
                <div
                  key={perm.id}
                  className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-surface transition-default"
                >
                  <div className="flex items-center gap-3">
                    {perm.user?.avatarUrl ? (
                      <img
                        src={perm.user.avatarUrl}
                        alt={perm.user.name}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
                        {perm.user?.name ? getInitials(perm.user.name) : '?'}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {perm.user?.name || 'Unknown user'}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {perm.user?.email || ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${getRoleBadgeClass(perm.role)}`}
                    >
                      {perm.role === 'owner' && <Crown className="h-3 w-3" />}
                      {perm.role.charAt(0).toUpperCase() + perm.role.slice(1)}
                    </span>
                    {perm.role !== 'owner' && (
                      <button
                        onClick={() => handleRemove(perm.id)}
                        className="rounded-md p-1 text-muted hover:bg-red-50 hover:text-red-600 transition-default"
                        title="Remove access"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Copy link */}
        <div className="border-t border-border px-6 py-4">
          <button
            onClick={handleCopyLink}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted hover:bg-surface hover:text-ink transition-default"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-green-600">Link copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy link
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
