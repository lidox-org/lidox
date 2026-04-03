import { useState, useEffect, useCallback } from 'react';
import { X, Clock, Loader2, RotateCcw, User } from 'lucide-react';
import { api } from '../lib/api';

interface Version {
  id: string;
  documentId: string;
  crdtClock: number;
  createdBy: string;
  createdAt: string;
  snapshotUrl: string | null;
}

interface Props {
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  onRestore?: (versionId: string) => void;
}

export function VersionHistory({ documentId, isOpen, onClose, onRestore }: Props) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Version[]>(`/documents/${documentId}/versions`);
      setVersions(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (isOpen) {
      fetchVersions();
    }
  }, [isOpen, fetchVersions]);

  const handleRestore = async (versionId: string) => {
    setRestoring(versionId);
    try {
      await api(`/documents/${documentId}/versions/${versionId}/restore`, {
        method: 'POST',
      });
      onRestore?.(versionId);
    } catch {
      // ignore
    } finally {
      setRestoring(null);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getRelativeTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(iso);
  };

  if (!isOpen) return null;

  return (
    <div className="flex h-full w-80 flex-col border-l border-border bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold text-ink">Version History</h3>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted hover:bg-surface hover:text-ink transition-default"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
          </div>
        ) : versions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Clock className="mb-3 h-8 w-8 text-gray-300" />
            <p className="text-sm text-muted">No versions yet</p>
            <p className="mt-1 text-xs text-gray-400">
              Versions are saved automatically
            </p>
          </div>
        ) : (
          <div className="p-3">
            {/* Timeline */}
            <div className="relative space-y-0">
              {versions.map((version, idx) => (
                <div
                  key={version.id}
                  className="group relative flex gap-3 pb-4"
                >
                  {/* Timeline line */}
                  {idx < versions.length - 1 && (
                    <div className="absolute left-[11px] top-6 h-full w-0.5 bg-border" />
                  )}

                  {/* Timeline dot */}
                  <div className="relative z-10 mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 border-border bg-white group-hover:border-accent transition-default">
                    <div className="h-2 w-2 rounded-full bg-border group-hover:bg-accent transition-default" />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1 rounded-lg p-2 hover:bg-surface transition-default">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-ink">
                        Version {version.crdtClock}
                      </p>
                      <button
                        onClick={() => handleRestore(version.id)}
                        disabled={restoring !== null}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted opacity-0 hover:bg-white hover:text-accent group-hover:opacity-100 transition-default disabled:opacity-50"
                        title="Restore this version"
                      >
                        {restoring === version.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3 w-3" />
                        )}
                        Restore
                      </button>
                    </div>

                    <p className="mt-1 text-[11px] text-muted">
                      {getRelativeTime(version.createdAt)}
                    </p>

                    <div className="mt-1.5 flex items-center gap-1 text-[11px] text-gray-400">
                      <User className="h-3 w-3" />
                      <span className="truncate">{version.createdBy}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
