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
} from 'lucide-react';
import { api, getAccessToken } from '../lib/api';

interface Props {
  editor: Editor | null;
  documentId: string;
  onAiProposalChange: (proposal: {
    taskId: string;
    taskType: string;
    original: string;
    proposed: string;
    streaming: boolean;
    stale: boolean;
  } | null) => void;
}

type AiTask = 'rewrite' | 'summarize' | 'translate' | 'grammar' | 'analyze' | 'explain';

const AI_ACTIONS: { task: AiTask; label: string; icon: React.ReactNode }[] = [
  { task: 'rewrite', label: 'Rewrite', icon: <Wand2 className="h-3.5 w-3.5" /> },
  { task: 'summarize', label: 'Summarize', icon: <FileText className="h-3.5 w-3.5" /> },
  { task: 'translate', label: 'Translate', icon: <Languages className="h-3.5 w-3.5" /> },
  { task: 'grammar', label: 'Grammar Fix', icon: <SpellCheck className="h-3.5 w-3.5" /> },
  { task: 'analyze', label: 'Analyze', icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { task: 'explain', label: 'Explain', icon: <HelpCircle className="h-3.5 w-3.5" /> },
];

export function AiToolbar({ editor, documentId, onAiProposalChange }: Props) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [loading, setLoading] = useState<AiTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const selectedTextRef = useRef('');
  const rafRef = useRef<number>();

  const computePosition = useCallback(() => {
    if (!editor) return;

    const { from, to, empty } = editor.state.selection;
    if (empty) {
      setVisible(false);
      return;
    }

    const text = editor.state.doc.textBetween(from, to, ' ');
    if (text.trim().length < 3) {
      setVisible(false);
      return;
    }

    selectedTextRef.current = text;

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
  }, [editor]);

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

  const handleAction = async (task: AiTask) => {
    const selection = selectedTextRef.current;
    if (!selection.trim()) return;

    setLoading(task);
    setError(null);

    try {
      const response = await api<{ taskId: string }>(`/documents/${documentId}/ai/invoke`, {
        method: 'POST',
        body: JSON.stringify({ task, selection }),
      });
      setActiveTaskId(response.taskId);
      onAiProposalChange({
        taskId: response.taskId,
        taskType: task,
        original: selection,
        proposed: '',
        streaming: true,
        stale: false,
      });

      const result = await streamTask(response.taskId, selection, task);
      onAiProposalChange({
        taskId: response.taskId,
        taskType: task,
        original: selection,
        proposed: result,
        streaming: false,
        stale: false,
      });
      setVisible(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI failed';
      setError(msg);
      onAiProposalChange(null);
      // Auto-clear error after 3s
      setTimeout(() => setError(null), 3000);
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
    original: string,
    taskType: AiTask,
  ): Promise<string> => {
    const headers = new Headers({
      Accept: 'text/event-stream',
    });
    const accessToken = getAccessToken();
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    const response = await fetch(
      `/api/documents/${documentId}/ai/tasks/${taskId}/stream`,
      {
        method: 'GET',
        headers,
        credentials: 'include',
      },
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
            original,
            proposed: result,
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

  if (!visible) return null;

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

          {AI_ACTIONS.map(({ task, label, icon }) => (
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
            {error}
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
