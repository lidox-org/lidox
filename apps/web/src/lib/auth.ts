import { create } from 'zustand';
import { api } from './api';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  setUser: (user: AuthUser) => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  isLoading: true,

  login: async (email: string, password: string) => {
    const data = await api<{ user: AuthUser }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        skipAuth: true,
      },
    );
    set({ user: data.user, isLoading: false });
  },

  register: async (email: string, password: string, name: string) => {
    const data = await api<{ user: AuthUser }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ email, password, name }),
        skipAuth: true,
      },
    );
    set({ user: data.user, isLoading: false });
  },

  logout: () => {
    api('/auth/logout', { method: 'POST' }).catch(() => {});
    set({ user: null, isLoading: false });
  },

  setUser: (user: AuthUser) => set({ user }),

  refresh: async () => {
    try {
      const data = await api<{ user: AuthUser }>(
        '/auth/refresh',
        {
          method: 'POST',
          skipAuth: true,
        },
      );
      set({ user: data.user, isLoading: false });
    } catch {
      set({ user: null, isLoading: false });
    }
  },
}));
