import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Login } from './Login';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  authState: {
    user: null as null | {
      id: string;
      email: string;
      name: string;
      avatarUrl: string | null;
    },
    isLoading: false,
    login: vi.fn(),
  },
}));

vi.mock('../lib/auth', () => ({
  useAuth: (
    selector: (state: {
      user: typeof mocks.authState.user;
      isLoading: boolean;
      login: typeof mocks.authState.login;
    }) => unknown,
  ) =>
    selector({
      user: mocks.authState.user,
      isLoading: mocks.authState.isLoading,
      login: mocks.authState.login,
    }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  );

  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

describe('Login', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.authState.user = null;
    mocks.authState.isLoading = false;
    mocks.authState.login.mockReset();
    mocks.authState.login.mockResolvedValue(undefined);
  });

  it('submits the login form and navigates to the dashboard', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/email/i), 'mo@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'secret-pass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mocks.authState.login).toHaveBeenCalledWith(
        'mo@example.com',
        'secret-pass',
      );
      expect(mocks.navigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('shows an inline error when login fails', async () => {
    const user = userEvent.setup();
    mocks.authState.login.mockRejectedValue(new Error('Invalid credentials'));

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/email/i), 'mo@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'wrong-pass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(
      await screen.findByText('Invalid credentials'),
    ).toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
