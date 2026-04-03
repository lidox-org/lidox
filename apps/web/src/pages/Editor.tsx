import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import UnderlineExt from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import {
  ArrowLeft,
  Share2,
  Clock,
  Loader2,
  Cloud,
  CloudOff,
  Menu,
} from 'lucide-react';

import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  getOrCreateDoc,
  getOrCreateProvider,
  destroyProvider,
} from '../lib/websocket';

import { EditorToolbar } from '../editor/EditorToolbar';
import { AiToolbar } from '../editor/AiToolbar';
import { AiProposal } from '../editor/AiProposal';
import { PresenceCursors } from '../editor/PresenceCursors';
import { ShareDialog } from '../editor/ShareDialog';
import { VersionHistory } from '../editor/VersionHistory';

const CURSOR_COLORS = [
  '#EF4444',
  '#F59E0B',
  '#10B981',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
];

interface AiProposalData {
  taskId: string;
  taskType: string;
  original: string;
  proposed: string;
}

export function Editor() {
  const { id: documentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);

  const [docTitle, setDocTitle] = useState('Untitled Document');
  const [titleEditing, setTitleEditing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [aiProposal, setAiProposal] = useState<AiProposalData | null>(null);
  const [saving, setSaving] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const saveTitleTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const ydoc = documentId ? getOrCreateDoc(documentId) : null;
  const provider = documentId ? getOrCreateProvider(documentId) : null;

  // Set awareness user info
  useEffect(() => {
    if (!provider || !user) return;

    const color = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];

    provider.awareness?.setLocalStateField('user', {
      id: user.id,
      name: user.name,
      color,
      avatarUrl: user.avatarUrl,
    });
  }, [provider, user]);

  // Track connection status via HocuspocusProvider events
  useEffect(() => {
    if (!provider) return;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    provider.on('connect', onConnect);
    provider.on('disconnect', onDisconnect);

    // Set initial state
    setConnected(provider.isConnected ?? false);

    return () => {
      provider.off('connect', onConnect);
      provider.off('disconnect', onDisconnect);
    };
  }, [provider]);

  // Fetch document metadata
  useEffect(() => {
    if (!documentId) return;

    const fetchDoc = async () => {
      try {
        const doc = await api<{ id: string; title: string }>(`/documents/${documentId}`);
        setDocTitle(doc.title);
      } catch {
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };

    fetchDoc();
  }, [documentId, navigate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (documentId) {
        destroyProvider(documentId);
      }
    };
  }, [documentId]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          history: false,
        }),
        Placeholder.configure({
          placeholder: 'Start writing...',
        }),
        Highlight.configure({
          multicolor: true,
        }),
        UnderlineExt,
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: 'text-accent underline cursor-pointer',
          },
        }),
        TextAlign.configure({
          types: ['heading', 'paragraph'],
        }),
        ...(ydoc
          ? [
              Collaboration.configure({
                document: ydoc,
              }),
              CollaborationCursor.configure({
                provider,
                user: {
                  name: user?.name || 'Anonymous',
                  color:
                    CURSOR_COLORS[
                      Math.floor(Math.random() * CURSOR_COLORS.length)
                    ],
                },
              }),
            ]
          : []),
      ],
      editorProps: {
        attributes: {
          class: 'focus:outline-none',
        },
      },
    },
    [ydoc],
  );

  const saveTitle = useCallback(
    async (newTitle: string) => {
      if (!documentId || !newTitle.trim()) return;
      setSaving(true);
      try {
        await api(`/documents/${documentId}`, {
          method: 'PATCH',
          body: JSON.stringify({ title: newTitle.trim() }),
        });
      } catch {
        // ignore
      } finally {
        setSaving(false);
      }
    },
    [documentId],
  );

  const handleTitleChange = (value: string) => {
    setDocTitle(value);
    if (saveTitleTimeoutRef.current) clearTimeout(saveTitleTimeoutRef.current);
    saveTitleTimeoutRef.current = setTimeout(() => saveTitle(value), 800);
  };

  const handleTitleBlur = () => {
    setTitleEditing(false);
    if (saveTitleTimeoutRef.current) clearTimeout(saveTitleTimeoutRef.current);
    saveTitle(docTitle);
  };

  const handleAiResult = (
    taskId: string,
    original: string,
    result: string,
    taskType: string,
  ) => {
    setAiProposal({ taskId, taskType, original, proposed: result });
  };

  const handleAcceptProposal = (text: string) => {
    if (!editor || !aiProposal) return;

    const { from, to } = editor.state.selection;
    if (from !== to) {
      editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, text).run();
    }
    setAiProposal(null);
  };

  const handleRejectProposal = () => {
    setAiProposal(null);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="text-sm text-muted">Loading document...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* Top bar */}
      <header className="flex h-14 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="rounded-lg p-2 text-muted hover:bg-surface hover:text-ink transition-default"
            title="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-xs font-bold text-white">
              L
            </div>

            {titleEditing ? (
              <input
                ref={titleInputRef}
                type="text"
                value={docTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTitleBlur();
                }}
                className="w-64 rounded-md border border-accent bg-white px-2 py-1 text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent/20"
                autoFocus
              />
            ) : (
              <button
                onClick={() => setTitleEditing(true)}
                className="max-w-xs truncate rounded-md px-2 py-1 text-sm font-medium text-ink hover:bg-surface transition-default"
                title="Click to rename"
              >
                {docTitle}
              </button>
            )}

            {saving && (
              <span className="text-xs text-muted">Saving...</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            {connected ? (
              <Cloud className="h-4 w-4 text-green-500" />
            ) : (
              <CloudOff className="h-4 w-4 text-red-400" />
            )}
            <span className="text-xs text-muted">
              {connected ? 'Connected' : 'Offline'}
            </span>
          </div>

          <div className="mx-2 h-5 w-px bg-border" />

          {/* Presence */}
          <PresenceCursors provider={provider} currentUserId={user?.id} />

          <div className="mx-1 h-5 w-px bg-border" />

          {/* Version history toggle */}
          <button
            onClick={() => setHistoryOpen(!historyOpen)}
            className={`rounded-lg p-2 transition-default ${
              historyOpen
                ? 'bg-accentLight text-accent'
                : 'text-muted hover:bg-surface hover:text-ink'
            }`}
            title="Version history"
          >
            <Clock className="h-4 w-4" />
          </button>

          {/* Share button */}
          <button
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-default"
          >
            <Share2 className="h-3.5 w-3.5" />
            Share
          </button>

          {/* Mobile menu placeholder */}
          <button className="rounded-lg p-2 text-muted hover:bg-surface lg:hidden transition-default">
            <Menu className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor column */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="border-b border-border px-4 py-2">
            <EditorToolbar editor={editor} />
          </div>

          {/* Editor area */}
          <div className="relative flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-6 py-8 lg:px-12">
              <EditorContent editor={editor} />

              {/* AI floating toolbar */}
              {documentId && (
                <AiToolbar
                  editor={editor}
                  documentId={documentId}
                  onAiResult={handleAiResult}
                />
              )}
            </div>

            {/* AI Proposal panel */}
            {aiProposal && (
              <div className="sticky bottom-0 mx-auto max-w-3xl px-6 pb-4">
                <AiProposal
                  taskId={aiProposal.taskId}
                  taskType={aiProposal.taskType}
                  original={aiProposal.original}
                  proposed={aiProposal.proposed}
                  onAccept={handleAcceptProposal}
                  onReject={handleRejectProposal}
                  onDismiss={() => setAiProposal(null)}
                />
              </div>
            )}
          </div>
        </div>

        {/* Version history sidebar */}
        {documentId && (
          <VersionHistory
            documentId={documentId}
            isOpen={historyOpen}
            onClose={() => setHistoryOpen(false)}
          />
        )}
      </div>

      {/* Share dialog */}
      {documentId && (
        <ShareDialog
          documentId={documentId}
          isOpen={shareOpen}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}
