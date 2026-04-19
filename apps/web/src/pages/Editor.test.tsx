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
    authUser: {
      id: 'user-1',
      email: 'mo@example.com',
      name: 'Mohamed',
      avatarUrl: null as string | null,
    },
    provider: {
      awareness: {
        setLocalStateField: vi.fn(),
      },
      isConnected: false,
      status: 'disconnected',
      hasUnsyncedChanges: false,
      on: vi.fn(),
      off: vi.fn(),
    },
    editor: {
      setEditable: vi.fn(),
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
  destroyProvider: vi.fn(),
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
    mocks.provider.awareness.setLocalStateField.mockReset();
    mocks.provider.on.mockReset();
    mocks.provider.off.mockReset();
    mocks.provider.isConnected = false;
    mocks.provider.status = 'disconnected';
    mocks.provider.hasUnsyncedChanges = false;
    mocks.editor.setEditable.mockReset();
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
      screen.getByText(/does not guarantee offline persistence/i),
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
});
