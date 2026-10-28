import { Bell, Menu, Moon, Sun, Monitor } from 'lucide-react';
import { useState } from 'react';

import type { Theme } from '../../lib/theme';

interface TopbarProps {
  theme: Theme;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
}

export function Topbar({ theme, onToggleTheme, onToggleSidebar }: TopbarProps) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="btn-ghost p-2"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-semibold leading-tight">Dashboard</h1>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Welcome back, Admin
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setNotificationsOpen((v) => !v)}
            className="btn-ghost p-2 relative"
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
          </button>

          {notificationsOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setNotificationsOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute right-0 z-50 mt-2 w-80 animate-fade-in rounded-xl border border-border bg-card p-2 shadow-lg">
                <div className="px-3 py-2">
                  <p className="text-sm font-semibold">Notifications</p>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  <div className="flex items-start gap-3 rounded-lg px-3 py-3 hover:bg-muted">
                    <div className="h-2 w-2 mt-1.5 rounded-full bg-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Welcome to GymFlow</p>
                      <p className="text-xs text-muted-foreground">
                        Explore the dashboard to get started.
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">Just now</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg px-3 py-3 hover:bg-muted">
                    <div className="h-2 w-2 mt-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Backend connected</p>
                      <p className="text-xs text-muted-foreground">
                        API health check passed.
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">2 min ago</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          className="btn-ghost p-2"
          aria-label="Toggle theme"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? (
            <Sun className="h-5 w-5" />
          ) : theme === 'light' ? (
            <Moon className="h-5 w-5" />
          ) : (
            <Monitor className="h-5 w-5" />
          )}
        </button>
      </div>
    </header>
  );
}