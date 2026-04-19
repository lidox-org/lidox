import type { Editor } from '@tiptap/react';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Wand2,
  FileText,
  Languages,
  SpellCheck,
  BarChart3,
  HelpCircle,
  Loader2,
  Sparkles,
  AlertCircle,
  Square,
  X,
} from 'lucide-react';
import type { AiTaskType, DocumentRole } from '@lidox/types';
import type * as Y from 'yjs';
import { api, fetchWithAuthRetry } from '../lib/api';
import {
  encodeStateVector,
  htmlToText,
  serializeCurrentSelection,
  type SerializedSelectionRange,
} from './aiSelection';

export interface AiRetryRequest {
  id: number;
  task: AiTaskType;
  selection: SerializedSelectionRange;
}

export interface AiNotice {
  kind: 'cancelled' | 'error';
  title: string;
  message: string;
  retry?: {
    task: AiTaskType;
    selection: SerializedSelectionRange;
  };
}

interface Props {
  editor: Editor | null;
  documentId: string;
  documentRole: DocumentRole | null;
  aiEnabled: boolean;
  ydoc: Y.Doc | null;
  onAiProposalChange: (proposal: {
    taskId: string;
    taskType: AiTaskType;
    originalText: string;
    originalHtml: string;
    proposedText: string;
    proposedHtml: string;
    anchorFrom: number;
    anchorTo: number;
    sourceStateVector?: string;
    readOnly: boolean;
    streaming: boolean;
    stale: boolean;
  } | null) => void;
  onHistoryChange?: () => void;
  onAiNoticeChange?: (notice: AiNotice | null) => void;
  retryRequest?: AiRetryRequest | null;
}

const AI_ACTIONS: {
  task: AiTaskType;
  label: string;
  icon: React.ReactNode;
  minRole: 'editor' | 'commenter';
}[] = [
  {
    task: 'rewrite',
    label: 'Rewrite',
    icon: <Wand2 className="h-3.5 w-3.5" />,
    minRole: 'editor',
  },
  {
    task: 'summarize',
    label: 'Summarize',
    icon: <FileText className="h-3.5 w-3.5" />,
    minRole: 'editor',
  },
  {
    task: 'translate',
    label: 'Translate',
    icon: <Languages className="h-3.5 w-3.5" />,
    minRole: 'editor',
  },
  {
    task: 'grammar',
    label: 'Grammar Fix',
    icon: <SpellCheck className="h-3.5 w-3.5" />,
    minRole: 'editor',
  },
  {
    task: 'restructure',
    label: 'Restructure',
    icon: <Wand2 className="h-3.5 w-3.5" />,
    minRole: 'editor',
  },
  {
    task: 'analyze',
    label: 'Analyze',
    icon: <BarChart3 className="h-3.5 w-3.5" />,
    minRole: 'commenter',
  },
  {
    task: 'explain',
    label: 'Explain',
    icon: <HelpCircle className="h-3.5 w-3.5" />,
    minRole: 'commenter',
  },
];

export function AiToolbar({
  editor,
  documentId,
  documentRole,
  aiEnabled,
  ydoc,
  onAiProposalChange,
  onHistoryChange,
  onAiNoticeChange,
  retryRequest,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [loading, setLoading] = useState<AiTaskType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const selectedRangeRef = useRef<SerializedSelectionRange | null>(null);
  const activeSelectionRef = useRef<SerializedSelectionRange | null>(null);
  const activeTaskRef = useRef<AiTaskType | null>(null);
  const handledRetryRequestRef = useRef<number | null>(null);
  const rafRef = useRef<number>();
  const availableActions = AI_ACTIONS.filter((action) =>
    isActionAvailable(action.minRole, documentRole, aiEnabled),
  );

  const computePosition = useCallback(() => {
    if (!editor) return;
    if (availableActions.length === 0) {
      setVisible(false);
      return;
    }

    const selection = serializeCurrentSelection(editor);
    if (!selection) {
      setVisible(false);
      return;
    }

    if (selection.text.trim().length < 3) {
      setVisible(false);
      return;
    }

    selectedRangeRef.current = selection;

    // Use RAF so DOM selection is up-to-date
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const domSel = window.getSelection();
      if (!domSel || domSel.rangeCount === 0) return;

      const range = domSel.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      if (rect.width === 0 && rect.height === 0) return;

      // Place toolbar above selection; clamp so it doesn't go off-screen
      const TOOLBAR_HEIGHT = 44;
      const MARGIN = 8;
      let top = rect.top - TOOLBAR_HEIGHT - MARGIN;
      if (top < MARGIN) top = rect.bottom + MARGIN; // flip below if no room above

      const left = Math.max(
        80,
        Math.min(rect.left + rect.width / 2, window.innerWidth - 80),
      );

      setPosition({ top, left });
      setVisible(true);
    });
  }, [availableActions.length, editor]);

  useEffect(() => {
    if (!editor) return;

    const onSelectionUpdate = () => {
      // Don't hide while loading
      if (loading) return;
      computePosition();
    };

    const onBlur = () => {
      // Keep visible if toolbar itself is focused (user clicking a button)
      setTimeout(() => {
        if (loading) return;
        if (toolbarRef.current && toolbarRef.current.contains(document.activeElement)) return;
        setVisible(false);
      }, 150);
    };

    editor.on('selectionUpdate', onSelectionUpdate);
    editor.on('blur', onBlur);

    return () => {
      editor.off('selectionUpdate', onSelectionUpdate);
      editor.off('blur', onBlur);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [editor, computePosition, loading]);

  const handleAction = async (task: AiTaskType) => {
    const selection = selectedRangeRef.current;
    await runAction(task, selection);
  };

  const runAction = async (
    task: AiTaskType,
    selection: SerializedSelectionRange | null,
  ) => {
    if (!selection || !selection.text.trim()) return;

    selectedRangeRef.current = selection;
    activeSelectionRef.current = selection;
    activeTaskRef.current = task;
    setLoading(task);
    setError(null);
    onAiNoticeChange?.(null);

    const sourceStateVector = encodeStateVector(ydoc);
    const readOnly = isReadTask(task);

    try {
      const response = await api<{ taskId: string }>(`/documents/${documentId}/ai/invoke`, {
        method: 'POST',
        body: JSON.stringify({
          task,
          selection: selection.text,
          selectionHtml: isWriteTask(task) ? selection.html : undefined,
          stateVector: sourceStateVector,
        }),
      });
      onHistoryChange?.();
      setActiveTaskId(response.taskId);
      onAiProposalChange({
        taskId: response.taskId,
        taskType: task,
        originalText: selection.text,
        originalHtml: selection.html,
        proposedText: '',
        proposedHtml: '',
        anchorFrom: selection.from,
        anchorTo: selection.to,
        sourceStateVector,
        readOnly,
        streaming: true,
        stale: false,
      });

      const result = await streamTask(
        response.taskId,
        selection,
        task,
        sourceStateVector,
      );
      const proposedText = toPreviewText(task, result);
      onAiProposalChange({
        taskId: response.taskId,
        taskType: task,
        originalText: selection.text,
        originalHtml: selection.html,
        proposedText,
        proposedHtml: isWriteTask(task) ? result : '',
        anchorFrom: selection.from,
        anchorTo: selection.to,
        sourceStateVector,
        readOnly,
        streaming: false,
        stale: false,
      });
      onHistoryChange?.();
      setVisible(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI failed';
      setError(msg);
      onAiProposalChange(null);
      onHistoryChange?.();
      onAiNoticeChange?.(
        buildAiNotice({
          message: msg,
          task,
          selection,
        }),
      );
    } finally {
      setLoading(null);
      setActiveTaskId(null);
    }
  };

  const handleCancel = async () => {
    if (!activeTaskId) return;

    try {
      await api(`/documents/${documentId}/ai/tasks/${activeTaskId}/cancel`, {
        method: 'POST',
      });
      setError('AI generation cancelled');
      onAiProposalChange(null);
      onHistoryChange?.();
      if (activeTaskRef.current && activeSelectionRef.current) {
        onAiNoticeChange?.({
          kind: 'cancelled',
          title: 'AI generation cancelled',
          message:
            'The in-progress suggestion was discarded. You can retry the same request.',
          retry: {
            task: activeTaskRef.current,
            selection: activeSelectionRef.current,
          },
        });
      }
      setVisible(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel AI';
      setError(msg);
    } finally {
      setLoading(null);
      setActiveTaskId(null);
    }
  };

  const streamTask = async (
    taskId: string,
    original: SerializedSelectionRange,
    taskType: AiTaskType,
    sourceStateVector?: string,
  ): Promise<string> => {
    const headers = new Headers({
      Accept: 'text/event-stream',
    });

    const response = await fetchWithAuthRetry(
      `/api/documents/${documentId}/ai/tasks/${taskId}/stream`,
      {
        method: 'GET',
        headers,
      },
      { redirectOnFailure: true },
    );

    if (!response.ok || !response.body) {
      throw new Error(`AI stream failed: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex >= 0) {
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        separatorIndex = buffer.indexOf('\n\n');

        const parsedEvent = parseSseEvent(rawEvent);
        if (!parsedEvent?.data) continue;

        const event = JSON.parse(parsedEvent.data) as {
          type: string;
          chunk?: string;
          result?: string;
          error?: string;
        };

        if (event.type === 'chunk' && event.chunk) {
          result += event.chunk;
          onAiProposalChange({
            taskId,
            taskType,
            originalText: original.text,
            originalHtml: original.html,
            proposedText: toPreviewText(taskType, result),
            proposedHtml: isWriteTask(taskType) ? result : '',
            anchorFrom: original.from,
            anchorTo: original.to,
            sourceStateVector,
            readOnly: isReadTask(taskType),
            streaming: true,
            stale: false,
          });
          continue;
        }

        if (event.type === 'complete') {
          return event.result ?? result;
        }

        if (event.type === 'failed') {
          throw new Error(event.error || 'AI generation failed');
        }

        if (event.type === 'cancelled') {
          throw new Error('AI generation cancelled');
        }
      }
    }

    return result;
  };

  useEffect(() => {
    if (!retryRequest) return;
    if (retryRequest.id === handledRetryRequestRef.current) return;

    handledRetryRequestRef.current = retryRequest.id;
    selectedRangeRef.current = retryRequest.selection;
    activeSelectionRef.current = retryRequest.selection;
    activeTaskRef.current = retryRequest.task;
    void runAction(retryRequest.task, retryRequest.selection);
  }, [retryRequest]);

  if (!visible || availableActions.length === 0) return null;

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 -translate-x-1/2"
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => e.preventDefault()} // prevent editor blur when clicking toolbar
    >
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-0.5 rounded-xl border border-border bg-white px-1.5 py-1 shadow-lg">
          <div className="mr-1 flex items-center gap-1 border-r border-border pr-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span className="text-[11px] font-semibold text-accent">AI</span>
          </div>

          {availableActions.map(({ task, label, icon }) => (
            <button
              key={task}
              onClick={() => handleAction(task)}
              disabled={loading !== null}
              title={label}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-default ${
                loading === task
                  ? 'bg-accentLight text-accent'
                  : 'text-muted hover:bg-surface hover:text-ink'
              } disabled:opacity-50`}
            >
              {loading === task ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
              {label}
            </button>
          ))}

          {loading && activeTaskId && (
            <button
              onClick={handleCancel}
              title="Cancel"
              className="ml-1 flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surface hover:text-ink transition-default"
            >
              <Square className="h-3.5 w-3.5" />
              Cancel
            </button>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs text-red-600 shadow-md">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="rounded p-0.5 text-red-400 hover:bg-red-50 hover:text-red-600 transition-default"
              title="Dismiss AI message"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function parseSseEvent(rawEvent: string): { event?: string; data?: string } | null {
  const lines = rawEvent
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const eventLine = lines.find((line) => line.startsWith('event:'));
  const dataLines = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim());

  return {
    event: eventLine ? eventLine.slice(6).trim() : undefined,
    data: dataLines.join('\n'),
  };
}

function isActionAvailable(
  minRole: 'editor' | 'commenter',
  documentRole: DocumentRole | null,
  aiEnabled: boolean,
): boolean {
  if (!aiEnabled || !documentRole || documentRole === 'viewer') {
    return false;
  }

  if (minRole === 'commenter') {
    return documentRole === 'owner' || documentRole === 'editor' || documentRole === 'commenter';
  }

  return documentRole === 'owner' || documentRole === 'editor';
}

function isReadTask(task: AiTaskType): boolean {
  return task === 'analyze' || task === 'explain';
}

function isWriteTask(task: AiTaskType): boolean {
  return !isReadTask(task);
}

function toPreviewText(task: AiTaskType, content: string): string {
  if (isReadTask(task)) {
    return content;
  }

  return htmlToText(content);
}

function buildAiNotice(input: {
  message: string;
  task: AiTaskType;
  selection: SerializedSelectionRange;
}): AiNotice {
  return {
    kind: 'error',
    title: 'AI generation failed',
    message: `${input.message}. The partial output was discarded before it was applied.`,
    retry: {
      task: input.task,
      selection: input.selection,
    },
  };
}
