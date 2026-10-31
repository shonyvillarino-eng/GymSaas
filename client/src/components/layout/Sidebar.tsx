import { NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

import { navigationForRole } from '../../lib/navigation';
import { useAuth } from '../../lib/auth';
import { cn } from '../../lib/utils';
import { api } from '../../lib/api';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const sections = navigationForRole(user?.role ?? 'MEMBER');
  const [gymBrand, setGymBrand] = useState<{ name: string; logoUrl: string | null } | null>(null);

  useEffect(() => {
    if (user?.role !== 'GYM_ADMIN') { setGymBrand(null); return; }
    let active = true;
    api<{ data: { name: string; logoUrl: string | null } }>('/gym')
      .then((result) => { if (active) setGymBrand({ name: result.data.name, logoUrl: result.data.logoUrl }); })
      .catch(() => { if (active) setGymBrand(null); });
    return () => { active = false; };
  }, [user?.role, user?.gymId, location.pathname]);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <>
      {/* Overlay for mobile */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-card transition-transform duration-200',
          'lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-2">
            {gymBrand?.logoUrl ? <img src={gymBrand.logoUrl} alt="Gym logo" className="h-8 w-8 rounded-lg border border-border bg-background object-contain p-0.5" /> : <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><span className="text-sm font-bold">G</span></div>}
            <span className="truncate text-lg font-semibold tracking-tight">{gymBrand?.name ?? (user?.role === 'GYM_ADMIN' ? user.gymName ?? 'Gym' : 'GymFlow')}</span>
          </div>
          <button
            onClick={onClose}
            className="btn-ghost p-2 lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {section.title}
              </p>
              <ul className="space-y-1">
                {section.items.map((item) => (
                  <li key={item.label}>
                    {item.pending ? (
                      <span aria-disabled="true" title="This module is not implemented yet" className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground/60">
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">Pending</span>
                      </span>
                    ) : (
                      <NavLink
                        to={item.path}
                        onClick={onClose}
                        end={item.path === '/' || item.path === '/admin'}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          )
                        }
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </NavLink>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
              {user?.fullName.slice(0, 1).toUpperCase() ?? 'U'}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium">{user?.fullName ?? 'Account'}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{user?.role?.replace('_', ' ')}</p>
            </div>
            <button onClick={() => void handleLogout()} className="btn-ghost px-2 py-1 text-xs" aria-label="Sign out">Sign out</button>
          </div>
        </div>
      </aside>
    </>
  );
}