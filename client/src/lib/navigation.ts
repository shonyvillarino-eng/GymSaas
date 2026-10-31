import type { LucideIcon } from 'lucide-react';
import type { UserRole } from '@gym-saas/shared';
import { Bell, Building2, ClipboardList, Coins, CreditCard, Dumbbell, LayoutDashboard, Settings, Users, UserRound, UserRoundCog, CalendarDays, CircleDollarSign, FileBarChart, Wallet } from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  pending?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

const GYM_ADMIN_SECTIONS: NavSection[] = [
  { title: 'Gym management', items: [
    { label: 'Dashboard', path: '/gym', icon: LayoutDashboard },
    { label: 'Gym information', path: '/gym/settings', icon: Building2 },
    { label: 'Members', path: '/gym/members', icon: Users },
    { label: 'Instructors', path: '/gym/instructors', icon: UserRoundCog },
    { label: 'Membership plans', path: '/gym/plans', icon: CreditCard },
    { label: 'Memberships', path: '/gym/subscriptions', icon: CreditCard },
    { label: 'Payments', path: '/gym/payments', icon: CircleDollarSign },
    { label: 'Outstanding balances', path: '/gym/receivables', icon: Wallet },
    { label: 'Cash register', path: '/gym/cash', icon: Coins },
    { label: 'Attendance', path: '/gym/attendance', icon: CalendarDays },
    { label: 'Routines', path: '/gym/routines', icon: Dumbbell },
    { label: 'Exercise catalog', path: '/gym/exercises', icon: ClipboardList },
    { label: 'Reports', path: '/gym', icon: FileBarChart, pending: true },
    { label: 'Settings & profile', path: '/gym/settings', icon: Settings },
  ] },
];

const INSTRUCTOR_SECTIONS: NavSection[] = [
  { title: 'Training', items: [
    { label: 'Dashboard', path: '/instructor', icon: LayoutDashboard },
    { label: 'My members', path: '/instructor/members', icon: Users },
    { label: 'Routines', path: '/instructor/routines', icon: Dumbbell },
    { label: 'Exercise catalog', path: '/instructor/exercises', icon: ClipboardList },
    { label: 'My profile', path: '/instructor/profile', icon: Settings },
  ] },
];

/**
 * Member portal navigation. Every entry is a real, implemented section: the
 * former placeholder pages (analytics, members, plans, settings) are gone, so
 * the menu never offers something that does not work.
 */
const MEMBER_SECTIONS: NavSection[] = [
  { title: 'My gym', items: [
    { label: 'Home', path: '/', icon: LayoutDashboard },
    { label: 'My profile', path: '/profile', icon: UserRound },
  ] },
  { title: 'My training', items: [
    { label: 'My routine', path: '/routines', icon: Dumbbell },
    { label: 'My attendances', path: '/attendance', icon: CalendarDays },
  ] },
  { title: 'My account', items: [
    { label: 'My membership', path: '/membership', icon: CreditCard },
    { label: 'My payments', path: '/payments', icon: CircleDollarSign },
    { label: 'Notices', path: '/notifications', icon: Bell },
  ] },
];

const ADMIN_SECTIONS: NavSection[] = [
  { title: 'Platform', items: [
    { label: 'Overview', path: '/admin', icon: LayoutDashboard },
    { label: 'Gyms', path: '/admin/gyms', icon: Building2 },
  ] },
];

export function navigationForRole(role: UserRole): NavSection[] {
  if (role === 'SUPER_ADMIN') return ADMIN_SECTIONS;
  if (role === 'GYM_ADMIN') return GYM_ADMIN_SECTIONS;
  return role === 'INSTRUCTOR' ? INSTRUCTOR_SECTIONS : MEMBER_SECTIONS;
}