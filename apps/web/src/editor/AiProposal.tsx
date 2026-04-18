import { useState, useMemo, useEffect } from 'react';
import {
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RotateCcw,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

interface Props {
  taskId: string;
  taskType: string;
  original: string;
  proposed: string;
  streaming?: boolean;
  stale?: boolean;
  onAccept: (text: string, action: 'accept' | 'partial') => void;
  onReject: () => void;
  onDismiss: () => void;
}

interface DiffSegment {
  id: number;
  type: 'unchanged' | 'removed' | 'added';
  text: string;
  accepted: boolean;
}

function computeDiffSegments(original: string, proposed: string): DiffSegment[] {
  const originalSentences = original.match(/[^.!?]+[.!?]?\s*/g) || [original];
  const proposedSentences = proposed.match(/[^.!?]+[.!?]?\s*/g) || [proposed];

  const segments: DiffSegment[] = [];
  let id = 0;

  const maxLen = Math.max(originalSentences.length, proposedSentences.length);

  for (let i = 0; i < maxLen; i++) {
    const orig = originalSentences[i]?.trim() || '';
    const prop = proposedSentences[i]?.trim() || '';

    if (orig === prop && orig) {
      segments.push({ id: id++, type: 'unchanged', text: orig, accepted: true });
    } else {
      if (orig) {
        segments.push({ id: id++, type: 'removed', text: orig, accepted: false });
      }
      if (prop) {
        segments.push({ id: id++, type: 'added', text: prop, accepted: true });
      }
    }
  }

  return segments;
}

const TASK_LABELS: Record<string, string> = {
  rewrite: 'Rewrite',
  summarize: 'Summary',
  translate: 'Translation',
  grammar: 'Grammar Fix',
  analyze: 'Analysis',
  explain: 'Explanation',
};

export function AiProposal({
  taskType,
  original,
  proposed,
  streaming = false,
  stale = false,
  onAccept,
  onReject,
  onDismiss,
}: Props) {
  const initialSegments = useMemo(
    () => computeDiffSegments(original, proposed),
    [original, proposed],
  );

  const [segments, setSegments] = useState(initialSegments);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    setSegments(initialSegments);
  }, [initialSegments]);

  const isReadTask = taskType === 'analyze' || taskType === 'explain';

  const toggleSegment = (segId: number) => {
    setSegments((prev) =>
      prev.map((seg) =>
        seg.id === segId && seg.type !== 'unchanged'
          ? { ...seg, accepted: !seg.accepted }
          : seg,
      ),
    );
  };

  const handleAcceptAll = () => {
    if (isReadTask) {
      onAccept(proposed, 'accept');
      return;
    }

    const result = segments
      .filter((seg) => seg.accepted)
      .map((seg) => seg.text)
      .join(' ');

    const action = segments.some(
      (seg, index) => seg.accepted !== initialSegments[index]?.accepted,
    )
      ? 'partial'
      : 'accept';

    onAccept(result, action);
  };

  const handleRejectAll = () => {
    onReject();
  };

  const resetToggles = () => {
    setSegments(initialSegments);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold text-ink">
            AI {TASK_LABELS[taskType] || 'Suggestion'}
          </span>
          <span className="rounded-full bg-accentLight px-2 py-0.5 text-[10px] font-medium text-accent">
            {streaming ? 'Streaming' : stale ? 'Stale' : 'Review'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="rounded-md p-1 text-muted hover:bg-white hover:text-ink transition-default"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={onDismiss}
            className="rounded-md p-1 text-muted hover:bg-white hover:text-ink transition-default"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <>
          {stale && (
            <div className="flex items-center gap-2 border-b border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              The source text changed while this proposal was in flight. Regenerate it instead of applying it.
            </div>
          )}

          {/* Diff content */}
          <div className="max-h-64 overflow-y-auto p-4">
            {streaming ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-accent">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  AI is generating a suggestion...
                </div>
                <div className="text-sm leading-relaxed text-ink">
                  {proposed || 'Waiting for the first chunk...'}
                </div>
              </div>
            ) : isReadTask ? (
              <div className="text-sm leading-relaxed text-ink">
                {proposed}
              </div>
            ) : (
              <div className="space-y-0.5 text-sm leading-relaxed">
                {segments.map((seg) => {
                  if (seg.type === 'unchanged') {
                    return (
                      <span key={seg.id} className="text-ink">
                        {seg.text}{' '}
                      </span>
                    );
                  }

                  if (seg.type === 'removed') {
                    return (
                      <span
                        key={seg.id}
                        onClick={() => toggleSegment(seg.id)}
                        className={`ai-diff-sentence cursor-pointer ${
                          seg.accepted
                            ? 'ai-diff-removed'
                            : 'ai-diff-removed rejected'
                        }`}
                        title="Click to toggle"
                      >
                        {seg.text}{' '}
                      </span>
                    );
                  }

                  return (
                    <span
                      key={seg.id}
                      onClick={() => toggleSegment(seg.id)}
                      className={`ai-diff-sentence cursor-pointer ${
                        seg.accepted ? 'ai-diff-added' : 'ai-diff-added rejected'
                      }`}
                      title="Click to toggle"
                    >
                      {seg.text}{' '}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            {!isReadTask && (
              <button
                onClick={resetToggles}
                disabled={streaming}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface hover:text-ink transition-default"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            )}
            {isReadTask && <div />}

            <div className="flex items-center gap-2">
              <button
                onClick={handleRejectAll}
                disabled={streaming}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface hover:text-ink transition-default"
              >
                <X className="h-3 w-3" />
                {streaming ? 'Waiting...' : isReadTask ? 'Close' : 'Reject All'}
              </button>
              <button
                onClick={handleAcceptAll}
                disabled={streaming || stale}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-default"
              >
                <Check className="h-3 w-3" />
                {streaming ? 'Generating...' : stale ? 'Regenerate Needed' : isReadTask ? 'Done' : 'Accept'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
