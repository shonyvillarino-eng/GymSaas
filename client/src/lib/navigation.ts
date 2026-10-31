import type { LucideIcon } from 'lucide-react';
import type { UserRole } from '@gym-saas/shared';
import { Bell, Building2, ClipboardList, Coins, CreditCard, Dumbbell, LayoutDashboard, Settings, ShieldCheck, Users, UserRound, UserRoundCog, CalendarDays, CircleDollarSign, FileBarChart, Wallet } from 'lucide-react';

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
  { title: 'nav.management', items: [
    { label: 'nav.dashboard', path: '/gym', icon: LayoutDashboard },
    { label: 'nav.gymInfo', path: '/gym/settings', icon: Building2 },
    { label: 'nav.members', path: '/gym/members', icon: Users },
    { label: 'nav.instructors', path: '/gym/instructors', icon: UserRoundCog },
    { label: 'nav.plans', path: '/gym/plans', icon: CreditCard },
    { label: 'nav.subscriptions', path: '/gym/subscriptions', icon: CreditCard },
    { label: 'nav.payments', path: '/gym/payments', icon: CircleDollarSign },
    { label: 'nav.receivables', path: '/gym/receivables', icon: Wallet },
    { label: 'nav.cash', path: '/gym/cash', icon: Coins },
    { label: 'nav.attendance', path: '/gym/attendance', icon: CalendarDays },
    { label: 'nav.routines', path: '/gym/routines', icon: Dumbbell },
    { label: 'nav.exercises', path: '/gym/exercises', icon: ClipboardList },
    { label: 'nav.reports', path: '/gym/reports', icon: FileBarChart },
    { label: 'nav.announcements', path: '/gym/announcements', icon: Bell },
    { label: 'nav.audit', path: '/gym/audit', icon: ShieldCheck },
    { label: 'nav.notifications', path: '/notifications/center', icon: Bell },
    { label: 'nav.settings', path: '/gym/settings', icon: Settings },
  ] },
];

const INSTRUCTOR_SECTIONS: NavSection[] = [
  { title: 'nav.training', items: [
    { label: 'nav.dashboard', path: '/instructor', icon: LayoutDashboard },
    { label: 'nav.myMembers', path: '/instructor/members', icon: Users },
    { label: 'nav.routines', path: '/instructor/routines', icon: Dumbbell },
    { label: 'nav.exercises', path: '/instructor/exercises', icon: ClipboardList },
    { label: 'nav.notifications', path: '/notifications/center', icon: Bell },
    { label: 'nav.myProfile', path: '/instructor/profile', icon: Settings },
  ] },
];

/**
 * Member portal navigation. Every entry is a real, implemented section: the
 * former placeholder pages (analytics, members, plans, settings) are gone, so
 * the menu never offers something that does not work.
 */
const MEMBER_SECTIONS: NavSection[] = [
  { title: 'nav.myGym', items: [
    { label: 'nav.home', path: '/', icon: LayoutDashboard },
    { label: 'nav.myProfile', path: '/profile', icon: UserRound },
  ] },
  { title: 'nav.myTraining', items: [
    { label: 'nav.myRoutine', path: '/routines', icon: Dumbbell },
    { label: 'nav.myAttendances', path: '/attendance', icon: CalendarDays },
  ] },
  { title: 'nav.myAccount', items: [
    { label: 'nav.myMembership', path: '/membership', icon: CreditCard },
    { label: 'nav.myPayments', path: '/payments', icon: CircleDollarSign },
    { label: 'nav.notices', path: '/notifications', icon: Bell },
  ] },
];

const ADMIN_SECTIONS: NavSection[] = [
  { title: 'nav.platform', items: [
    { label: 'nav.overview', path: '/admin', icon: LayoutDashboard },
    { label: 'nav.gyms', path: '/admin/gyms', icon: Building2 },
    { label: 'nav.audit', path: '/admin/audit', icon: ShieldCheck },
  ] },
];

export function navigationForRole(role: UserRole): NavSection[] {
  if (role === 'SUPER_ADMIN') return ADMIN_SECTIONS;
  if (role === 'GYM_ADMIN') return GYM_ADMIN_SECTIONS;
  return role === 'INSTRUCTOR' ? INSTRUCTOR_SECTIONS : MEMBER_SECTIONS;
}