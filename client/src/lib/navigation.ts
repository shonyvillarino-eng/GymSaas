import type { LucideIcon } from 'lucide-react';
import { BarChart3, CreditCard, Dumbbell, LayoutDashboard, Settings, Users } from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', path: '/', icon: LayoutDashboard },
      { label: 'Analytics', path: '/analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Members', path: '/members', icon: Users },
      { label: 'Plans', path: '/plans', icon: CreditCard },
      { label: 'Routines', path: '/routines', icon: Dumbbell },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Settings', path: '/settings', icon: Settings },
    ],
  },
];