import { Menu, Moon, Sun, Monitor, Languages } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import type { Theme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { NotificationBell } from './NotificationBell';

interface TopbarProps {
  theme: Theme;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
}

export function Topbar({ theme, onToggleTheme, onToggleSidebar }: TopbarProps) {
  const { t } = useTranslation();
  const { user, language, setLanguage } = useAuth();
  const location = useLocation();

  const path = location.pathname;
  const titleKey = path.startsWith('/admin/gyms/') ? 'nav.gymInfo'
    : path === '/admin/gyms' ? 'nav.gyms'
    : path === '/admin' ? 'nav.overview'
    : path === '/admin/audit' ? 'nav.audit'
    : path.startsWith('/gym/members') ? 'nav.members'
    : path.startsWith('/gym/instructors') ? 'nav.instructors'
    : path.startsWith('/gym/plans') ? 'nav.plans'
    : path.startsWith('/gym/subscriptions') ? 'nav.subscriptions'
    : path.startsWith('/gym/payments') ? 'nav.payments'
    : path.startsWith('/gym/receivables') ? 'nav.receivables'
    : path.startsWith('/gym/cash') ? 'nav.cash'
    : path.startsWith('/gym/attendance') ? 'nav.attendance'
    : path.startsWith('/gym/routines') ? 'nav.routines'
    : path.startsWith('/gym/exercises') ? 'nav.exercises'
    : path.startsWith('/gym/reports') ? 'nav.reports'
    : path.startsWith('/gym/announcements') ? 'nav.announcements'
    : path.startsWith('/gym/audit') ? 'nav.audit'
    : path === '/gym/settings' ? 'nav.settings'
    : path.startsWith('/notifications') ? 'nav.notifications'
    : path === '/instructor/members' ? 'nav.myMembers'
    : path.startsWith('/instructor/routines') ? 'nav.routines'
    : path === '/instructor/profile' ? 'nav.myProfile'
    : 'nav.dashboard';

  const pageTitle = t(titleKey);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="btn-ghost p-2"
          aria-label={t('topbar.toggleSidebar')}
        >
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-semibold leading-tight">{pageTitle}</h1>
          <p className="hidden text-xs text-muted-foreground sm:block">
            {t('topbar.welcome', { name: user?.fullName.split(' ')[0] ?? '' })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <NotificationBell />

        {/* Personal language: persisted in the user profile. */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1">
          <Languages className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <select
            value={language}
            onChange={(event) => {
              const next = event.target.value as typeof language;
              void setLanguage(next).catch(() => undefined);
            }}
            aria-label={t('topbar.language')}
            title={t('topbar.personalLanguageHint')}
            className="bg-transparent text-xs focus:outline-none"
          >
            <option value="es">ES</option>
            <option value="en">EN</option>
            <option value="pt">PT</option>
          </select>
        </div>

        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          className="btn-ghost p-2"
          aria-label={t('topbar.toggleTheme')}
          title={t('topbar.toggleTheme')}
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