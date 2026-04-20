import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from './Editor';

const mocks = vi.hoisted(() => {
  const chain = {
    focus: vi.fn(),
    deleteRange: vi.fn(),
    insertContentAt: vi.fn(),
    undo: vi.fn(),
    run: vi.fn(),
  };

  chain.focus.mockReturnValue(chain);
  chain.deleteRange.mockReturnValue(chain);
  chain.insertContentAt.mockReturnValue(chain);
  chain.undo.mockReturnValue(chain);

  return {
    navigate: vi.fn(),
    api: vi.fn(),
    fetchWithAuthRetry: vi.fn(),
    destroyProvider: vi.fn(),
    providerHandlers: new Map<string, (...args: any[]) => void>(),
    authUser: {
      id: 'user-1',
      email: 'mo@example.com',
      name: 'Mohamed',
      avatarUrl: null as string | null,
    },
    provider: {
      configuration: {
        websocketProvider: {
          status: 'disconnected',
        },
      },
      awareness: {
        setLocalStateField: vi.fn(),
      },
      hasUnsyncedChanges: false,
      on: vi.fn(),
      off: vi.fn(),
    },
    editor: {
      setEditable: vi.fn(),
      getText: vi.fn(() => 'Working Draft export'),
      can: () => ({
        undo: () => true,
      }),
      chain: () => chain,
      on: vi.fn(),
      off: vi.fn(),
    },
  };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );

  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useParams: () => ({ id: 'doc-1' }),
  };
});

vi.mock('../lib/api', () => ({
  api: (...args: unknown[]) => mocks.api(...args),
  fetchWithAuthRetry: (...args: unknown[]) => mocks.fetchWithAuthRetry(...args),
}));

vi.mock('../lib/auth', () => ({
  useAuth: (
    selector: (state: {
      user: typeof mocks.authUser;
    }) => unknown,
  ) =>
    selector({
      user: mocks.authUser,
    }),
}));

vi.mock('../lib/websocket', () => ({
  getOrCreateDoc: () => ({}),
  getOrCreateProvider: () => mocks.provider,
  destroyProvider: (...args: unknown[]) => mocks.destroyProvider(...args),
}));

vi.mock('@tiptap/react', () => ({
  useEditor: () => mocks.editor,
  EditorContent: () => <div data-testid="editor-content" />,
}));

vi.mock('../editor/EditorToolbar', () => ({
  EditorToolbar: ({
    disabled,
    disabledReason,
  }: {
    disabled?: boolean;
    disabledReason?: string;
  }) => (
    <div data-testid="editor-toolbar">
      {disabled ? disabledReason : 'Toolbar active'}
    </div>
  ),
}));

vi.mock('../editor/AiToolbar', () => ({
  AiToolbar: ({
    onAiNoticeChange,
    retryRequest,
  }: {
    onAiNoticeChange?: (notice: {
      kind: 'error';
      title: string;
      message: string;
      retry: {
        task: 'rewrite';
        selection: {
          from: number;
          to: number;
          text: string;
          html: string;
        };
      };
    }) => void;
    retryRequest?: {
      task: string;
    } | null;
  }) => (
    <div data-testid="ai-toolbar">
      <button
        onClick={() =>
          onAiNoticeChange?.({
            kind: 'error',
            title: 'AI generation failed',
            message:
              'The partial output was discarded before it was applied.',
            retry: {
              task: 'rewrite',
              selection: {
                from: 1,
                to: 5,
                text: 'Draft',
                html: '<p>Draft</p>',
              },
            },
          })
        }
      >
        Report AI Failure
      </button>
      {retryRequest && (
        <div data-testid="ai-retry-request">{retryRequest.task}</div>
      )}
    </div>
  ),
}));

vi.mock('../editor/AiProposal', () => ({
  AiProposal: () => <div data-testid="ai-proposal" />,
}));

vi.mock('../editor/PresenceCursors', () => ({
  PresenceCursors: () => <div data-testid="presence-cursors" />,
}));

vi.mock('../editor/ShareDialog', () => ({
  ShareDialog: () => <div data-testid="share-dialog" />,
}));

vi.mock('../editor/VersionHistory', () => ({
  VersionHistory: () => <div data-testid="version-history" />,
}));

vi.mock('../editor/AiHistoryPanel', () => ({
  AiHistoryPanel: () => <div data-testid="ai-history-panel" />,
}));

describe('Editor', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.api.mockReset();
    mocks.fetchWithAuthRetry.mockReset();
    mocks.destroyProvider.mockReset();
    mocks.providerHandlers.clear();
    mocks.provider.awareness.setLocalStateField.mockReset();
    mocks.provider.on.mockImplementation((event: string, handler: (...args: any[]) => void) => {
      mocks.providerHandlers.set(event, handler);
    });
    mocks.provider.off.mockImplementation((event: string) => {
      mocks.providerHandlers.delete(event);
    });
    mocks.provider.configuration.websocketProvider.status = 'disconnected';
    mocks.provider.hasUnsyncedChanges = false;
    mocks.editor.setEditable.mockReset();
    mocks.editor.getText.mockReset();
    mocks.editor.getText.mockReturnValue('Working Draft export');
  });

  it('renders a viewer-safe read-only UI', async () => {
    mocks.api.mockImplementation(async (path: string) => {
      if (path === '/documents/doc-1') {
        return {
          id: 'doc-1',
          title: 'Roadmap',
          role: 'viewer',
          aiEnabled: true,
        };
      }

      return [];
    });

    render(<Editor />);

    expect(await screen.findByText('Roadmap')).toBeInTheDocument();
    expect(screen.getByText('Viewer')).toBeInTheDocument();
    expect(screen.queryByTitle('Click to rename')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /share/i })).not.toBeInTheDocument();
    expect(screen.getByText('Read-only')).toBeInTheDocument();
    expect(screen.getByTestId('editor-toolbar')).toHaveTextContent(
      'Viewer access is read-only in the editor.',
    );
    expect(mocks.editor.setEditable).toHaveBeenCalledWith(false);
  });

  it('shows honest disconnected-sync messaging for editors', async () => {
    mocks.api.mockImplementation(async (path: string) => {
      if (path === '/documents/doc-1') {
        return {
          id: 'doc-1',
          title: 'Working Draft',
          role: 'editor',
          aiEnabled: true,
        };
      }

      return [];
    });

    render(<Editor />);

    expect(await screen.findByText('Working Draft')).toBeInTheDocument();
    expect(screen.getByText('Sync disconnected')).toBeInTheDocument();
    expect(
      screen.getByText(/local edits are being buffered in this browser/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId('editor-toolbar')).toHaveTextContent(
      'Toolbar active',
    );
    expect(screen.queryByRole('button', { name: /share/i })).not.toBeInTheDocument();
    expect(mocks.editor.setEditable).toHaveBeenCalledWith(true);
  });

  it('shows a persistent AI failure banner with retry support', async () => {
    const user = userEvent.setup();

    mocks.api.mockImplementation(async (path: string) => {
      if (path === '/documents/doc-1') {
        return {
          id: 'doc-1',
          title: 'Working Draft',
          role: 'editor',
          aiEnabled: true,
        };
      }

      return [];
    });

    render(<Editor />);

    expect(await screen.findByText('Working Draft')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /report ai failure/i }),
    );

    expect(screen.getByText('AI generation failed')).toBeInTheDocument();
    expect(
      screen.getByText(/partial output was discarded before it was applied/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^retry$/i }));

    expect(screen.getByTestId('ai-retry-request')).toHaveTextContent(
      'rewrite',
    );
  });

  it('downloads a PDF export from the editor header', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => 'blob:lidox-pdf');
    const revokeObjectURL = vi.fn();
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    mocks.api.mockImplementation(async (path: string) => {
      if (path === '/documents/doc-1') {
        return {
          id: 'doc-1',
          title: 'Working Draft',
          role: 'editor',
          aiEnabled: true,
        };
      }

      return [];
    });
    mocks.fetchWithAuthRetry.mockResolvedValue(
      new Response('%PDF-1.4', {
        status: 200,
        headers: {
          'Content-Disposition': 'attachment; filename="working-draft.pdf"',
        },
      }),
    );
    window.URL.createObjectURL = createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL;

    render(<Editor />);

    expect(await screen.findByText('Working Draft')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^pdf$/i }));

    expect(mocks.fetchWithAuthRetry).toHaveBeenCalledWith(
      '/documents/doc-1/export/pdf',
      expect.objectContaining({
        method: 'POST',
      }),
      { redirectOnFailure: true },
    );
    expect(createObjectURL).toHaveBeenCalled();
    expect(anchorClick).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:lidox-pdf');

    anchorClick.mockRestore();
  });

  it('redirects out of the editor when a live permission downgrade arrives', async () => {
    mocks.api.mockImplementation(async (path: string) => {
      if (path === '/documents/doc-1') {
        return {
          id: 'doc-1',
          title: 'Working Draft',
          role: 'editor',
          aiEnabled: true,
        };
      }

      return [];
    });

    render(<Editor />);

    expect(await screen.findByText('Working Draft')).toBeInTheDocument();

    const statelessHandler = mocks.providerHandlers.get('stateless');
    expect(statelessHandler).toBeTypeOf('function');

    statelessHandler?.({
      payload: JSON.stringify({
        type: 'permission-change',
        newRole: 'viewer',
        revoked: false,
      }),
    });

    expect(mocks.destroyProvider).toHaveBeenCalledWith('doc-1');
    expect(mocks.navigate).toHaveBeenCalledWith(
      '/dashboard',
      expect.objectContaining({
        replace: true,
        state: expect.objectContaining({
          notice: expect.stringContaining('Working Draft'),
        }),
      }),
    );
  });
});
