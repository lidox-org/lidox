import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import type { AiTaskType, DocumentRole } from '@lidox/types';
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
  Sparkles,
  Undo2,
  Wifi,
  WifiOff,
  Menu,
  Download,
} from 'lucide-react';

import { api, fetchWithAuthRetry } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  getOrCreateDoc,
  getOrCreateProvider,
  destroyProvider,
} from '../lib/websocket';
import { restoreDocumentFromSnapshot } from '../lib/restore';

import { EditorToolbar } from '../editor/EditorToolbar';
import {
  AiToolbar,
  type AiNotice,
  type AiRetryRequest,
} from '../editor/AiToolbar';
import { AiProposal } from '../editor/AiProposal';
import { AiHistoryPanel } from '../editor/AiHistoryPanel';
import { encodeStateVector, serializeRange } from '../editor/aiSelection';
import { normalizeAiReplacementHtml } from '../editor/aiSelection';
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
}

interface PermissionChangeMessage {
  type?: string;
  newRole?: DocumentRole | null;
  revoked?: boolean;
}

export function Editor() {
  const { id: documentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);

  const [docTitle, setDocTitle] = useState('Untitled Document');
  const [documentRole, setDocumentRole] = useState<DocumentRole | null>(null);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [titleEditing, setTitleEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [activeSidebar, setActiveSidebar] = useState<'versions' | 'ai' | null>(
    null,
  );
  const [aiProposal, setAiProposal] = useState<AiProposalData | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiHistoryRefreshKey, setAiHistoryRefreshKey] = useState(0);
  const [aiNotice, setAiNotice] = useState<AiNotice | null>(null);
  const [aiRetryRequest, setAiRetryRequest] = useState<AiRetryRequest | null>(
    null,
  );
  const [undoAiChangeVisible, setUndoAiChangeVisible] = useState(false);
  const [syncConnectionStatus, setSyncConnectionStatus] = useState<
    'connecting' | 'connected' | 'disconnected'
  >('connecting');
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pageNotice, setPageNotice] = useState<{
    tone: 'error' | 'warning';
    message: string;
  } | null>(null);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const saveTitleTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const undoAiTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const ydoc = documentId ? getOrCreateDoc(documentId) : null;
  const provider = documentId ? getOrCreateProvider(documentId) : null;
  const canEditDocument =
    documentRole === 'owner' || documentRole === 'editor';
  const canManagePermissions = documentRole === 'owner';
  const canExportDocument = Boolean(documentRole);
  const syncStatus = getSyncStatus({
    canEditDocument,
    savingTitle: saving,
    hasUnsyncedChanges,
    syncConnectionStatus,
  });

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

  // Track connection and sync status via HocuspocusProvider events.
  useEffect(() => {
    if (!provider) {
      setSyncConnectionStatus('disconnected');
      setHasUnsyncedChanges(false);
      return;
    }

    const onStatus = ({ status }: { status: string }) => {
      if (status === 'connected') {
        setSyncConnectionStatus('connected');
        return;
      }

      if (status === 'connecting') {
        setSyncConnectionStatus('connecting');
        return;
      }

      setSyncConnectionStatus('disconnected');
    };

    const onSynced = ({ state }: { state: boolean }) => {
      if (state) {
        setHasUnsyncedChanges(false);
      }
    };

    const onUnsyncedChanges = (count: number) => {
      setHasUnsyncedChanges(count > 0);
    };

    setSyncConnectionStatus(
      provider.configuration.websocketProvider.status === 'connected'
        ? 'connected'
        : provider.configuration.websocketProvider.status === 'connecting'
          ? 'connecting'
          : 'disconnected',
    );
    setHasUnsyncedChanges(provider.hasUnsyncedChanges ?? false);

    provider.on('status', onStatus);
    provider.on('synced', onSynced);
    provider.on('unsyncedChanges', onUnsyncedChanges);

    return () => {
      provider.off('status', onStatus);
      provider.off('synced', onSynced);
      provider.off('unsyncedChanges', onUnsyncedChanges);
    };
  }, [provider]);

  // Fetch document metadata
  useEffect(() => {
    if (!documentId) return;

    const fetchDoc = async () => {
      try {
        const doc = await api<{
          id: string;
          title: string;
          role: DocumentRole;
          aiEnabled: boolean;
        }>(`/documents/${documentId}`);
        setDocTitle(doc.title);
        setDocumentRole(doc.role);
        setAiEnabled(doc.aiEnabled);
        setPageNotice(null);
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

  useEffect(() => {
    if (!provider || !documentId) {
      return;
    }

    const handleStatelessMessage = ({ payload }: { payload: string }) => {
      let message: PermissionChangeMessage;

      try {
        message = JSON.parse(payload) as PermissionChangeMessage;
      } catch {
        return;
      }

      if (message.type !== 'permission-change') {
        return;
      }

      destroyProvider(documentId);
      navigate('/dashboard', {
        replace: true,
        state: {
          notice: message.revoked
            ? `Your access to “${docTitle}” was revoked and the live session was closed.`
            : `Your access to “${docTitle}” changed. Reopen the document from the dashboard to continue with the new permission.`,
        },
      });
    };

    provider.on('stateless', handleStatelessMessage);
    return () => {
      provider.off('stateless', handleStatelessMessage);
    };
  }, [documentId, docTitle, navigate, provider]);

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
      editable: canEditDocument,
      editorProps: {
        attributes: {
          class: 'focus:outline-none',
        },
      },
    },
    [canEditDocument, provider, user?.name, ydoc],
  );

  useEffect(() => {
    if (!editor) return;

    editor.setEditable(canEditDocument);
  }, [editor, canEditDocument]);

  const saveTitle = useCallback(
    async (newTitle: string) => {
      if (!documentId || !newTitle.trim() || !canEditDocument) return;
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
    [canEditDocument, documentId],
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

  const handleVersionRestore = useCallback(
    async ({
      restoredSnapshot,
    }: {
      versionId: string;
      restoredSnapshot?: string | null;
    }) => {
      if (!ydoc || !restoredSnapshot) {
        return;
      }

      restoreDocumentFromSnapshot(ydoc, restoredSnapshot);
      setAiProposal(null);
      setUndoAiChangeVisible(false);
      setAiNotice(null);
    },
    [ydoc],
  );

  const handleAcceptProposal = async (
    input: {
      text: string;
      html?: string;
      action: 'accept' | 'partial';
    },
  ) => {
    if (!editor || !aiProposal) return;

    const currentSelection = serializeRange(
      editor,
      aiProposal.anchorFrom,
      aiProposal.anchorTo,
    );
    const currentStateVector = encodeStateVector(ydoc);
    const appliedContent = aiProposal.readOnly
      ? input.text
      : (input.html ?? input.text);

    try {
      await api(`/documents/${documentId}/ai/tasks/${aiProposal.taskId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          action: input.action,
          appliedText: aiProposal.readOnly ? aiProposal.proposedText : appliedContent,
          currentSelection: currentSelection?.text,
          currentStateVector,
        }),
      });

      if (!aiProposal.readOnly && currentSelection) {
        const replacementHtml = normalizeAiReplacementHtml({
          originalHtml: currentSelection.html,
          proposedText: input.text,
          proposedHtml: input.html,
        });

        editor
          .chain()
          .focus()
          .insertContentAt(
            {
              from: aiProposal.anchorFrom,
              to: aiProposal.anchorTo,
            },
            replacementHtml,
          )
          .run();

        setUndoAiChangeVisible(true);
        if (undoAiTimeoutRef.current) clearTimeout(undoAiTimeoutRef.current);
        undoAiTimeoutRef.current = setTimeout(
          () => setUndoAiChangeVisible(false),
          8000,
        );
      }

      setAiNotice(null);
      setAiHistoryRefreshKey((current) => current + 1);
      setAiProposal(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Proposal review failed';
      if (message.toLowerCase().includes('stale')) {
        setAiProposal((prev) => (prev ? { ...prev, stale: true, streaming: false } : prev));
        return;
      }
    }
  };

  const handleRejectProposal = async () => {
    if (!aiProposal) return;

    await api(`/documents/${documentId}/ai/tasks/${aiProposal.taskId}/review`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'reject',
      }),
    });

    setAiNotice(null);
    setAiHistoryRefreshKey((current) => current + 1);
    setAiProposal(null);
  };

  const handleUndoAiChange = () => {
    if (!editor || !editor.can().undo()) return;
    editor.chain().focus().undo().run();
    setUndoAiChangeVisible(false);
  };

  const handleExportPdf = useCallback(async () => {
    if (!documentId || !editor || !canExportDocument) {
      return;
    }

    setExportingPdf(true);
    setPageNotice(null);

    try {
      const response = await fetchWithAuthRetry(
        `/documents/${documentId}/export/pdf`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: docTitle,
            text: editor.getText({ blockSeparator: '\n\n' }),
          }),
        },
        { redirectOnFailure: true },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: 'PDF export failed' }));
        throw new Error(body.message ?? 'PDF export failed');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = getDownloadFilename(response.headers.get('content-disposition'), docTitle);
      link.click();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setPageNotice({
        tone: 'error',
        message: err instanceof Error ? err.message : 'PDF export failed.',
      });
    } finally {
      setExportingPdf(false);
    }
  }, [canExportDocument, docTitle, documentId, editor]);

  const handleRetryAiNotice = () => {
    if (!aiNotice?.retry) return;

    setAiProposal(null);
    setAiNotice(null);
    setAiRetryRequest({
      id: Date.now(),
      task: aiNotice.retry.task,
      selection: aiNotice.retry.selection,
    });
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
              <>
                {canEditDocument ? (
                  <button
                    onClick={() => setTitleEditing(true)}
                    className="max-w-xs truncate rounded-md px-2 py-1 text-sm font-medium text-ink hover:bg-surface transition-default"
                    title="Click to rename"
                  >
                    {docTitle}
                  </button>
                ) : (
                  <span className="max-w-xs truncate px-2 py-1 text-sm font-medium text-ink">
                    {docTitle}
                  </span>
                )}
              </>
            )}

            {documentRole && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getRoleBadgeClass(documentRole)}`}
              >
                {documentRole.charAt(0).toUpperCase() + documentRole.slice(1)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1">
            {syncConnectionStatus === 'disconnected' ? (
              <WifiOff className="h-4 w-4 text-amber-600" />
            ) : (
              <Wifi className="h-4 w-4 text-emerald-600" />
            )}
            <span className={`text-xs font-medium ${syncStatus.toneClass}`}>
              {syncStatus.label}
            </span>
          </div>

          <div className="mx-2 h-5 w-px bg-border" />

          {/* Presence */}
          <PresenceCursors provider={provider} currentUserId={user?.id} />

          <div className="mx-1 h-5 w-px bg-border" />

          {/* Version history toggle */}
          <button
            onClick={() =>
              setActiveSidebar((current) =>
                current === 'versions' ? null : 'versions',
              )
            }
            className={`rounded-lg p-2 transition-default ${
              activeSidebar === 'versions'
                ? 'bg-accentLight text-accent'
                : 'text-muted hover:bg-surface hover:text-ink'
            }`}
            title="Version history"
          >
            <Clock className="h-4 w-4" />
          </button>

          <button
            onClick={() =>
              setActiveSidebar((current) => (current === 'ai' ? null : 'ai'))
            }
            className={`rounded-lg p-2 transition-default ${
              activeSidebar === 'ai'
                ? 'bg-accentLight text-accent'
                : 'text-muted hover:bg-surface hover:text-ink'
            }`}
            title="AI history"
          >
            <Sparkles className="h-4 w-4" />
          </button>

          {canExportDocument && (
            <button
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-ink hover:bg-surface disabled:opacity-60 transition-default"
              title="Download a PDF export"
            >
              {exportingPdf ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              PDF
            </button>
          )}

          {canManagePermissions && (
            <button
              onClick={() => setShareOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-default"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>
          )}

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
            <EditorToolbar
              editor={editor}
              disabled={!canEditDocument}
              disabledReason={`${
                documentRole === 'commenter' ? 'Commenter' : 'Viewer'
              } access is read-only in the editor.`}
            />
          </div>

          {syncConnectionStatus === 'disconnected' && canEditDocument && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
              Live sync is disconnected. Local edits are being buffered in this
              browser and will resync when the connection returns.
            </div>
          )}

          {pageNotice && (
            <div
              className={`border-b px-4 py-2 text-sm ${
                pageNotice.tone === 'warning'
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {pageNotice.message}
            </div>
          )}

          {/* Editor area */}
          <div className="relative flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-6 py-8 lg:px-12">
              <EditorContent editor={editor} />

              {/* AI floating toolbar */}
              {documentId && (
                <AiToolbar
                  editor={editor}
                  documentId={documentId}
                  documentRole={documentRole}
                  aiEnabled={aiEnabled}
                  ydoc={ydoc}
                  retryRequest={aiRetryRequest}
                  onHistoryChange={() =>
                    setAiHistoryRefreshKey((current) => current + 1)
                  }
                  onAiNoticeChange={setAiNotice}
                  onAiProposalChange={(proposal) => {
                    if (proposal) {
                      setAiNotice(null);
                    }
                    setAiProposal(proposal);
                  }}
                />
              )}
            </div>

            {(undoAiChangeVisible || aiNotice || aiProposal) && (
              <div className="sticky bottom-0 space-y-3 px-6 pb-4">
                {undoAiChangeVisible && (
                  <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-sm">
                    <div>
                      <p className="font-medium">AI suggestion applied</p>
                      <p className="text-xs text-emerald-700">
                        Undo is available until you continue editing.
                      </p>
                    </div>
                    <button
                      onClick={handleUndoAiChange}
                      className="flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-white transition-default"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      Undo
                    </button>
                  </div>
                )}

                {aiNotice && (
                  <div
                    className={`mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm shadow-sm ${
                      aiNotice.kind === 'cancelled'
                        ? 'border-amber-200 bg-amber-50 text-amber-900'
                        : 'border-red-200 bg-red-50 text-red-900'
                    }`}
                  >
                    <div>
                      <p className="font-medium">{aiNotice.title}</p>
                      <p
                        className={`text-xs ${
                          aiNotice.kind === 'cancelled'
                            ? 'text-amber-800'
                            : 'text-red-700'
                        }`}
                      >
                        {aiNotice.message}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {aiNotice.retry && (
                        <button
                          onClick={handleRetryAiNotice}
                          className="rounded-lg border border-current/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/70 transition-default"
                        >
                          Retry
                        </button>
                      )}
                      <button
                        onClick={() => setAiNotice(null)}
                        className="rounded-lg border border-current/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/70 transition-default"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}

                {aiProposal && (
                  <div className="mx-auto max-w-3xl">
                    <AiProposal
                      taskId={aiProposal.taskId}
                      taskType={aiProposal.taskType}
                      original={aiProposal.originalText}
                      originalHtml={aiProposal.originalHtml}
                      proposed={aiProposal.proposedText}
                      proposedHtml={aiProposal.proposedHtml}
                      readOnly={aiProposal.readOnly}
                      streaming={aiProposal.streaming}
                      stale={aiProposal.stale}
                      onAccept={handleAcceptProposal}
                      onReject={handleRejectProposal}
                      onDismiss={() => setAiProposal(null)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Version history sidebar */}
        {documentId && (
          <>
            <VersionHistory
              documentId={documentId}
              isOpen={activeSidebar === 'versions'}
              onClose={() => setActiveSidebar(null)}
              onRestore={handleVersionRestore}
              canRestore={canEditDocument}
              restoreAvailable={true}
            />
            <AiHistoryPanel
              documentId={documentId}
              isOpen={activeSidebar === 'ai'}
              onClose={() => setActiveSidebar(null)}
              refreshKey={aiHistoryRefreshKey}
            />
          </>
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

function getRoleBadgeClass(role: DocumentRole): string {
  switch (role) {
    case 'owner':
      return 'bg-amber-50 text-amber-700';
    case 'editor':
      return 'bg-blue-50 text-blue-700';
    case 'commenter':
      return 'bg-emerald-50 text-emerald-700';
    case 'viewer':
      return 'bg-slate-100 text-slate-600';
  }
}

function getSyncStatus(input: {
  canEditDocument: boolean;
  savingTitle: boolean;
  hasUnsyncedChanges: boolean;
  syncConnectionStatus: 'connecting' | 'connected' | 'disconnected';
}): { label: string; toneClass: string } {
  if (!input.canEditDocument) {
    return {
      label: 'Read-only',
      toneClass: 'text-slate-600',
    };
  }

  if (input.savingTitle) {
    return {
      label: 'Saving title…',
      toneClass: 'text-accent',
    };
  }

  if (input.syncConnectionStatus === 'disconnected') {
    return {
      label: 'Sync disconnected',
      toneClass: 'text-amber-700',
    };
  }

  if (input.syncConnectionStatus === 'connecting') {
    return {
      label: 'Connecting sync…',
      toneClass: 'text-accent',
    };
  }

  if (input.hasUnsyncedChanges) {
    return {
      label: 'Syncing edits…',
      toneClass: 'text-accent',
    };
  }

  return {
    label: 'All edits synced',
    toneClass: 'text-emerald-700',
  };
}

function getDownloadFilename(
  contentDisposition: string | null,
  title: string,
): string {
  const match = contentDisposition?.match(/filename="([^"]+)"/i);
  if (match?.[1]) {
    return match[1];
  }

  const fallback = title
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return `${fallback || 'lidox-document'}.pdf`;
}
