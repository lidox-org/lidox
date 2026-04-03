import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  Plus,
  FileText,
  MoreHorizontal,
  Trash2,
  Loader2,
  Search,
  Clock,
} from 'lucide-react';

interface DocumentItem {
  id: string;
  title: string;
  ownerId: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export function Dashboard() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const data = await api<DocumentItem[]>('/documents');
      setDocuments(data);
    } catch {
      // fail silently on initial load
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const doc = await api<DocumentItem>('/documents', {
        method: 'POST',
        body: JSON.stringify({ title: 'Untitled Document' }),
      });
      navigate(`/doc/${doc.id}`);
    } catch {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setMenuOpen(null);
    try {
      await api(`/documents/${id}`, { method: 'DELETE' });
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch {
      // ignore
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  const filtered = documents.filter((d) =>
    d.title.toLowerCase().includes(search.toLowerCase()),
  );

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  return (
    <div className="p-6 lg:p-10">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">My Documents</h1>
          <p className="mt-1 text-sm text-muted">
            {documents.length === 0
              ? 'Create your first document to get started'
              : `${documents.length} document${documents.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60 transition-default"
        >
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          New Document
        </button>
      </div>

      {/* Search */}
      {documents.length > 0 && (
        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents..."
            className="w-full rounded-lg border border-border bg-white py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-gray-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 transition-default"
          />
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
            <p className="text-sm text-muted">Loading documents...</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && documents.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-20">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accentLight">
            <FileText className="h-8 w-8 text-accent" />
          </div>
          <h2 className="text-lg font-semibold text-ink">No documents yet</h2>
          <p className="mt-1 text-sm text-muted">
            Create your first document and start writing
          </p>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60 transition-default"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Create Document
          </button>
        </div>
      )}

      {/* No search results */}
      {!loading && documents.length > 0 && filtered.length === 0 && (
        <div className="flex flex-col items-center py-16">
          <Search className="mb-3 h-8 w-8 text-muted" />
          <p className="text-sm text-muted">
            No documents matching &ldquo;{search}&rdquo;
          </p>
        </div>
      )}

      {/* Document grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((doc) => (
            <div
              key={doc.id}
              onClick={() => navigate(`/doc/${doc.id}`)}
              className="group relative cursor-pointer rounded-xl border border-border bg-white p-5 shadow-sm hover:border-accent/30 hover:shadow-md transition-default"
            >
              {/* Thumbnail area */}
              <div className="mb-4 flex h-32 items-center justify-center rounded-lg bg-surface">
                <FileText className="h-10 w-10 text-gray-300" />
              </div>

              {/* Doc info */}
              <h3 className="truncate text-sm font-semibold text-ink group-hover:text-accent transition-default">
                {doc.title}
              </h3>

              <div className="mt-2 flex items-center gap-2">
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="h-5 w-5 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-white">
                    {user?.name ? getInitials(user.name) : '?'}
                  </div>
                )}
                <div className="flex items-center gap-1 text-xs text-muted">
                  <Clock className="h-3 w-3" />
                  {formatDate(doc.updatedAt)}
                </div>
              </div>

              {/* Menu button */}
              <div className="absolute right-3 top-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(menuOpen === doc.id ? null : doc.id);
                  }}
                  className="rounded-md p-1.5 text-muted opacity-0 hover:bg-surface hover:text-ink group-hover:opacity-100 transition-default"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>

                {menuOpen === doc.id && (
                  <div
                    className="absolute right-0 top-8 z-10 w-40 rounded-lg border border-border bg-white py-1 shadow-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-default"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Click outside handler for menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-0" onClick={() => setMenuOpen(null)} />
      )}
    </div>
  );
}
