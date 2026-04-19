import type { AiInteractionHistoryItem } from '@lidox/types';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api';

interface Props {
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  refreshKey?: number;
}

const TASK_LABELS: Record<AiInteractionHistoryItem['taskType'], string> = {
  rewrite: 'Rewrite',
  summarize: 'Summarize',
  translate: 'Translate',
  grammar: 'Grammar Fix',
  restructure: 'Restructure',
  analyze: 'Analyze',
  explain: 'Explain',
};

export function AiHistoryPanel({
  documentId,
  isOpen,
  onClose,
  refreshKey = 0,
}: Props) {
  const [items, setItems] = useState<AiInteractionHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await api<AiInteractionHistoryItem[]>(
        `/documents/${documentId}/ai/history`,
      );
      setItems(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load AI history',
      );
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (!isOpen) return;
    fetchHistory();
  }, [fetchHistory, isOpen, refreshKey]);

  if (!isOpen) return null;

  return (
    <aside className="flex h-full w-[26rem] flex-col border-l border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <div>
            <h3 className="text-sm font-semibold text-ink">AI History</h3>
            <p className="text-[11px] text-muted">
              Recent suggestions and reviews for this document
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => fetchHistory()}
            className="rounded-md p-1 text-muted hover:bg-surface hover:text-ink transition-default"
            title="Refresh AI history"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-surface hover:text-ink transition-default"
            title="Close AI history"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
          </div>
        ) : error ? (
          <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <div className="flex items-start gap-2 text-sm text-red-700">
              <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <p className="font-medium">Could not load AI history</p>
                <p className="mt-1 text-xs">{error}</p>
              </div>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <Sparkles className="mb-3 h-8 w-8 text-gray-300" />
            <p className="text-sm font-medium text-ink">
              No AI interactions yet
            </p>
            <p className="mt-1 text-xs text-muted">
              Run a suggestion or analysis to build the document history.
            </p>
          </div>
        ) : (
          <div className="space-y-3 p-3">
            {items.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-border bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink">
                        {TASK_LABELS[item.taskType]}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getStatusBadgeClass(item.status)}`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted">
                      {formatDate(item.createdAt)}
                    </p>
                  </div>

                  <div className="text-right text-[11px] text-muted">
                    <p>{item.modelUsed}</p>
                    <p>{formatCost(item.costCents)}</p>
                  </div>
                </div>

                {item.staleAtReview && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <p>
                      This proposal became stale before review because the source
                      text changed.
                    </p>
                  </div>
                )}

                <div className="mt-3 space-y-3">
                  {item.sourceText && (
                    <HistoryBlock
                      label="Original"
                      content={item.sourceText}
                    />
                  )}

                  {item.proposalText && (
                    <HistoryBlock
                      label={
                        item.taskType === 'analyze' || item.taskType === 'explain'
                          ? 'AI result'
                          : 'Suggestion'
                      }
                      content={item.proposalText}
                    />
                  )}

                  {item.appliedText && (
                    <HistoryBlock
                      label="Applied"
                      content={item.appliedText}
                      tone="success"
                    />
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function HistoryBlock(props: {
  label: string;
  content: string;
  tone?: 'default' | 'success';
}) {
  return (
    <section>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
        {props.label}
      </p>
      <div
        className={`rounded-xl px-3 py-2 text-sm leading-6 ${
          props.tone === 'success'
            ? 'bg-emerald-50 text-emerald-900'
            : 'bg-surface text-ink'
        }`}
      >
        {props.content}
      </div>
    </section>
  );
}

function getStatusBadgeClass(status: AiInteractionHistoryItem['status']): string {
  switch (status) {
    case 'accepted':
      return 'bg-emerald-50 text-emerald-700';
    case 'partial':
      return 'bg-amber-50 text-amber-700';
    case 'rejected':
      return 'bg-rose-50 text-rose-700';
    case 'failed':
    case 'cancelled':
    case 'expired':
      return 'bg-slate-100 text-slate-700';
    case 'pending':
      return 'bg-blue-50 text-blue-700';
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatCost(costCents: number): string {
  if (costCents === 0) return 'No tracked cost';
  return `$${(costCents / 100).toFixed(2)}`;
}
