import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  FileText,
  LogOut,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';

export function Layout() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-border bg-white transition-all duration-300 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        {/* Brand */}
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
                L
              </div>
              <span className="text-lg font-semibold text-ink">Lidox</span>
            </div>
          )}
          {collapsed && (
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
              L
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`rounded-md p-1 text-muted hover:bg-surface hover:text-ink transition-default ${
              collapsed ? 'hidden' : ''
            }`}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 p-3">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-default ${
                isActive
                  ? 'bg-accentLight text-accent'
                  : 'text-muted hover:bg-surface hover:text-ink'
              } ${collapsed ? 'justify-center' : ''}`
            }
          >
            <FileText className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span>My Documents</span>}
          </NavLink>
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-3">
          {collapsed && (
            <button
              onClick={() => setCollapsed(false)}
              className="flex w-full items-center justify-center rounded-lg p-2 text-muted hover:bg-surface hover:text-ink transition-default"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
          {!collapsed && (
            <div className="space-y-1">
              <button
                onClick={() => navigate('/settings')}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface hover:text-ink transition-default"
              >
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </button>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-red-50 hover:text-red-600 transition-default"
              >
                <LogOut className="h-4 w-4" />
                <span>Log out</span>
              </button>
              <div className="mt-3 flex items-center gap-3 rounded-lg px-3 py-2">
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
                    {initials}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {user?.name}
                  </p>
                  <p className="truncate text-xs text-muted">{user?.email}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
