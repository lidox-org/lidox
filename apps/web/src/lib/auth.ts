import { create } from 'zustand';
import { api, setAccessToken } from './api';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  setUser: (user: AuthUser) => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true,

  login: async (email: string, password: string) => {
    const data = await api<{ user: AuthUser; accessToken: string }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        skipAuth: true,
      },
    );
    setAccessToken(data.accessToken);
    set({ user: data.user, token: data.accessToken, isLoading: false });
  },

  register: async (email: string, password: string, name: string) => {
    const data = await api<{ user: AuthUser; accessToken: string }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ email, password, name }),
        skipAuth: true,
      },
    );
    setAccessToken(data.accessToken);
    set({ user: data.user, token: data.accessToken, isLoading: false });
  },

  logout: () => {
    api('/auth/logout', { method: 'POST' }).catch(() => {});
    setAccessToken(null);
    set({ user: null, token: null, isLoading: false });
  },

  setUser: (user: AuthUser) => set({ user }),

  refresh: async () => {
    try {
      const data = await api<{ accessToken: string; user?: AuthUser }>(
        '/auth/refresh',
        {
          method: 'POST',
          skipAuth: true,
        },
      );
      setAccessToken(data.accessToken);

      if (data.user) {
        set({ user: data.user, token: data.accessToken, isLoading: false });
      } else {
        const me = await api<AuthUser>('/auth/me');
        set({ user: me, token: data.accessToken, isLoading: false });
      }
    } catch {
      setAccessToken(null);
      set({ user: null, token: null, isLoading: false });
    }
  },
}));
