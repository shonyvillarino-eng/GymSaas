import { Suspense, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';

import { LoadingState } from '../ui/states';

import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { initTheme, toggleTheme, type Theme } from '../../lib/theme';

export function AppLayout() {
  const [theme, setTheme] = useState<Theme>('light');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setTheme(initTheme());
  }, []);

  const handleToggleTheme = () => {
    setTheme(toggleTheme());
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col min-w-0">
        <Topbar
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {/* Keeps the shell visible while a lazy route chunk is downloading. */}
          <Suspense fallback={<LoadingState label="Loading…" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}