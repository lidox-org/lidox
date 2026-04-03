import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { User, Mail, Key, Loader2, Check } from 'lucide-react';

export function Settings() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);

  const [name, setName] = useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const updated = await api<{ id: string; name: string; email: string; avatarUrl: string | null }>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim() }),
      });
      setUser(updated);
      setProfileMsg({ type: 'success', text: 'Profile updated successfully.' });
    } catch {
      setProfileMsg({ type: 'error', text: 'Failed to update profile.' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMsg({ type: 'error', text: 'Password must be at least 8 characters.' });
      return;
    }
    setSavingPassword(true);
    setPasswordMsg(null);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPasswordMsg({ type: 'success', text: 'Password changed successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setPasswordMsg({ type: 'error', text: 'Failed to change password. Check your current password.' });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-8 text-2xl font-bold text-ink">Settings</h1>

      {/* Profile section */}
      <section className="mb-8 rounded-xl border border-border bg-white p-6 shadow-sm">
        <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-ink">
          <User className="h-4 w-4 text-accent" />
          Profile
        </h2>

        <div className="mb-5 flex items-center gap-4">
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-xl font-semibold text-white">
              {initials}
            </div>
          )}
          <div>
            <p className="font-medium text-ink">{user?.name}</p>
            <p className="text-sm text-muted">{user?.email}</p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Display name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-ink placeholder-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              placeholder="Your name"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Email</label>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
              <Mail className="h-4 w-4 text-muted" />
              <span className="text-sm text-muted">{user?.email}</span>
            </div>
            <p className="mt-1 text-xs text-muted">Email cannot be changed.</p>
          </div>

          {profileMsg && (
            <p className={`flex items-center gap-1.5 text-sm ${profileMsg.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
              {profileMsg.type === 'success' && <Check className="h-4 w-4" />}
              {profileMsg.text}
            </p>
          )}

          <button
            type="submit"
            disabled={savingProfile || !name.trim()}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-default"
          >
            {savingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
            Save profile
          </button>
        </form>
      </section>

      {/* Password section */}
      <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
        <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-ink">
          <Key className="h-4 w-4 text-accent" />
          Change password
        </h2>

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-ink placeholder-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-ink placeholder-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              placeholder="Min. 8 characters"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm text-ink placeholder-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              placeholder="••••••••"
            />
          </div>

          {passwordMsg && (
            <p className={`flex items-center gap-1.5 text-sm ${passwordMsg.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
              {passwordMsg.type === 'success' && <Check className="h-4 w-4" />}
              {passwordMsg.text}
            </p>
          )}

          <button
            type="submit"
            disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-default"
          >
            {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
            Change password
          </button>
        </form>
      </section>
    </div>
  );
}
