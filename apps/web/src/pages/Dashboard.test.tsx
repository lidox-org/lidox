import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './Dashboard';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  api: vi.fn(),
  authUser: {
    id: 'user-1',
    email: 'mo@example.com',
    name: 'Mohamed',
    avatarUrl: null as string | null,
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );

  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useLocation: () => ({ state: null }),
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

describe('Dashboard', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.api.mockReset();
    mocks.api.mockResolvedValue([
      {
        id: 'doc-owner',
        title: 'Owned Spec',
        ownerId: 'user-1',
        role: 'owner',
        createdAt: '2026-04-19T10:00:00.000Z',
        updatedAt: '2026-04-19T10:00:00.000Z',
      },
      {
        id: 'doc-viewer',
        title: 'Shared Notes',
        ownerId: 'user-2',
        role: 'viewer',
        createdAt: '2026-04-19T10:00:00.000Z',
        updatedAt: '2026-04-19T10:00:00.000Z',
      },
    ]);
  });

  it('shows document roles and only exposes delete to owners', async () => {
    const user = userEvent.setup();

    render(<Dashboard />);

    expect(await screen.findByText('Owned Spec')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Viewer')).toBeInTheDocument();
    expect(screen.getByText('Owned by you')).toBeInTheDocument();
    expect(screen.getByText('Shared with you as viewer')).toBeInTheDocument();

    const actionButtons = screen.getAllByTitle('Document actions');
    expect(actionButtons).toHaveLength(1);

    await user.click(actionButtons[0]);

    expect(
      screen.getByRole('button', { name: /delete/i }),
    ).toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledTimes(1);
  });
});
