import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { LoadingState } from './components/ui/states';
import { NotFoundPage } from './pages/NotFoundPage';
import { LoginPage } from './pages/LoginPage';
import { CompleteSetupPage } from './pages/CompleteSetupPage';

/**
 * Route-level code splitting: each module is downloaded only when the user
 * opens it. Pages keep their named exports, so the loader maps them to the
 * default export React.lazy expects.
 */
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })));
const GymsPage = lazy(() => import('./pages/admin/GymsPage').then((m) => ({ default: m.GymsPage })));
const GymDetailPage = lazy(() => import('./pages/admin/GymDetailPage').then((m) => ({ default: m.GymDetailPage })));
const GymDashboardPage = lazy(() => import('./pages/GymDashboardPage').then((m) => ({ default: m.GymDashboardPage })));
const GymSettingsPage = lazy(() => import('./pages/GymSettingsPage').then((m) => ({ default: m.GymSettingsPage })));
const GymMembersPage = lazy(() => import('./pages/GymMembersPage').then((m) => ({ default: m.GymMembersPage })));
const GymMemberFormPage = lazy(() => import('./pages/GymMemberFormPage').then((m) => ({ default: m.GymMemberFormPage })));
const GymMemberDetailPage = lazy(() => import('./pages/GymMemberDetailPage').then((m) => ({ default: m.GymMemberDetailPage })));
const GymInstructorsPage = lazy(() => import('./pages/GymInstructorsPage').then((m) => ({ default: m.GymInstructorsPage })));
const GymInstructorFormPage = lazy(() => import('./pages/GymInstructorFormPage').then((m) => ({ default: m.GymInstructorFormPage })));
const GymInstructorDetailPage = lazy(() => import('./pages/GymInstructorDetailPage').then((m) => ({ default: m.GymInstructorDetailPage })));
const InstructorDashboardPage = lazy(() => import('./pages/InstructorDashboardPage').then((m) => ({ default: m.InstructorDashboardPage })));
const GymPlansPage = lazy(() => import('./pages/GymPlansPage').then((m) => ({ default: m.GymPlansPage })));
const GymSubscriptionsPage = lazy(() => import('./pages/GymSubscriptionsPage').then((m) => ({ default: m.GymSubscriptionsPage })));
const GymSubscriptionFormPage = lazy(() => import('./pages/GymSubscriptionFormPage').then((m) => ({ default: m.GymSubscriptionFormPage })));
const GymPaymentsPage = lazy(() => import('./pages/GymPaymentsPage').then((m) => ({ default: m.GymPaymentsPage })));
const GymPaymentFormPage = lazy(() => import('./pages/GymPaymentFormPage').then((m) => ({ default: m.GymPaymentFormPage })));
const GymReceivablesPage = lazy(() => import('./pages/GymReceivablesPage').then((m) => ({ default: m.GymReceivablesPage })));
const GymCashPage = lazy(() => import('./pages/GymCashPage').then((m) => ({ default: m.GymCashPage })));
const GymAttendancePage = lazy(() => import('./pages/GymAttendancePage').then((m) => ({ default: m.GymAttendancePage })));
const GymAttendanceScanPage = lazy(() => import('./pages/GymAttendanceScanPage').then((m) => ({ default: m.GymAttendanceScanPage })));
const GymAttendanceHistoryPage = lazy(() => import('./pages/GymAttendanceHistoryPage').then((m) => ({ default: m.GymAttendanceHistoryPage })));
const ExerciseCatalogPage = lazy(() => import('./pages/ExerciseCatalogPage').then((m) => ({ default: m.ExerciseCatalogPage })));
const RoutinesListPage = lazy(() => import('./pages/RoutinesListPage').then((m) => ({ default: m.RoutinesListPage })));
const RoutineBuilderPage = lazy(() => import('./pages/RoutineBuilderPage').then((m) => ({ default: m.RoutineBuilderPage })));
const RoutineDetailPage = lazy(() => import('./pages/RoutineDetailPage').then((m) => ({ default: m.RoutineDetailPage })));
const MyRoutinesPage = lazy(() => import('./pages/MyRoutinesPage').then((m) => ({ default: m.MyRoutinesPage })));
const PortalDashboardPage = lazy(() => import('./pages/portal/PortalDashboardPage').then((m) => ({ default: m.PortalDashboardPage })));
const PortalProfilePage = lazy(() => import('./pages/portal/PortalProfilePage').then((m) => ({ default: m.PortalProfilePage })));
const PortalAttendancePage = lazy(() => import('./pages/portal/PortalAttendancePage').then((m) => ({ default: m.PortalAttendancePage })));
const PortalMembershipPage = lazy(() => import('./pages/portal/PortalMembershipPage').then((m) => ({ default: m.PortalMembershipPage })));
const PortalPaymentsPage = lazy(() => import('./pages/portal/PortalPaymentsPage').then((m) => ({ default: m.PortalPaymentsPage })));
const PortalNotificationsPage = lazy(() => import('./pages/portal/PortalNotificationsPage').then((m) => ({ default: m.PortalNotificationsPage })));
const GymReportsPage = lazy(() => import('./pages/GymReportsPage'));
const GymAuditPage = lazy(() => import('./pages/GymAuditPage').then((m) => ({ default: m.GymAuditPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const GymAnnouncementsPage = lazy(() => import('./pages/GymAnnouncementsPage').then((m) => ({ default: m.GymAnnouncementsPage })));
const GymMembersReportPage = lazy(() => import('./pages/GymMembersReportPage').then((m) => ({ default: m.GymMembersReportPage })));
const GymAttendanceReportPage = lazy(() => import('./pages/GymAttendanceReportPage').then((m) => ({ default: m.GymAttendanceReportPage })));
const GymFinancialReportPage = lazy(() => import('./pages/GymFinancialReportPage').then((m) => ({ default: m.GymFinancialReportPage })));

export function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<LoadingState label="Loading…" />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/complete-setup" element={<CompleteSetupPage />} />
          <Route element={<ProtectedRoute roles={['GYM_ADMIN']} />}>
            <Route element={<AppLayout />}>
              <Route path="/gym" element={<GymDashboardPage />} />
              <Route path="/gym/members" element={<GymMembersPage />} />
              <Route path="/gym/members/new" element={<GymMemberFormPage />} />
              <Route path="/gym/members/:id" element={<GymMemberDetailPage />} />
              <Route path="/gym/members/:id/edit" element={<GymMemberFormPage />} />
              <Route path="/gym/instructors" element={<GymInstructorsPage />} />
              <Route path="/gym/instructors/new" element={<GymInstructorFormPage />} />
              <Route path="/gym/instructors/:id" element={<GymInstructorDetailPage />} />
              <Route path="/gym/instructors/:id/edit" element={<GymInstructorFormPage />} />
              <Route path="/gym/plans" element={<GymPlansPage />} />
              <Route path="/gym/plans/new" element={<GymPlansPage />} />
              <Route path="/gym/plans/:id/edit" element={<GymPlansPage />} />
              <Route path="/gym/subscriptions" element={<GymSubscriptionsPage />} />
              <Route path="/gym/subscriptions/new" element={<GymSubscriptionFormPage />} />
              <Route path="/gym/subscriptions/:id/renew" element={<GymSubscriptionFormPage />} />
              <Route path="/gym/payments" element={<GymPaymentsPage />} />
              <Route path="/gym/payments/new" element={<GymPaymentFormPage />} />
              <Route path="/gym/receivables" element={<GymReceivablesPage />} />
              <Route path="/gym/cash" element={<GymCashPage />} />
              <Route path="/gym/attendance" element={<GymAttendancePage />} />
              <Route path="/gym/attendance/scan" element={<GymAttendanceScanPage />} />
              <Route path="/gym/attendance/history" element={<GymAttendanceHistoryPage />} />
              <Route path="/gym/exercises" element={<ExerciseCatalogPage />} />
              <Route path="/gym/routines" element={<RoutinesListPage scope="gym" basePath="/gym" />} />
              <Route path="/gym/routines/new" element={<RoutineBuilderPage scope="gym" basePath="/gym" />} />
              <Route path="/gym/routines/:id" element={<RoutineDetailPage basePath="/gym" />} />
              <Route path="/gym/routines/:id/edit" element={<RoutineBuilderPage scope="gym" basePath="/gym" />} />
              <Route path="/gym/settings" element={<GymSettingsPage />} />
              <Route path="/gym/reports" element={<GymReportsPage />} />
              <Route path="/gym/reports/members" element={<GymMembersReportPage />} />
              <Route path="/gym/reports/attendance" element={<GymAttendanceReportPage />} />
              <Route path="/gym/reports/financial" element={<GymFinancialReportPage />} />
              <Route path="/gym/audit" element={<GymAuditPage />} />
              <Route path="/gym/announcements" element={<GymAnnouncementsPage />} />
            </Route>
          </Route>
          <Route element={<ProtectedRoute roles={['INSTRUCTOR']} />}>
            <Route element={<AppLayout />}>
              <Route path="/instructor" element={<InstructorDashboardPage />} />
              <Route path="/instructor/members" element={<InstructorDashboardPage initialTab="members" />} />
              <Route path="/instructor/exercises" element={<ExerciseCatalogPage />} />
              <Route path="/instructor/routines" element={<RoutinesListPage scope="instructor" basePath="/instructor" />} />
              <Route path="/instructor/routines/new" element={<RoutineBuilderPage scope="instructor" basePath="/instructor" />} />
              <Route path="/instructor/routines/:id" element={<RoutineDetailPage basePath="/instructor" />} />
              <Route path="/instructor/routines/:id/edit" element={<RoutineBuilderPage scope="instructor" basePath="/instructor" />} />
              <Route path="/instructor/profile" element={<InstructorDashboardPage initialTab="profile" />} />
            </Route>
          </Route>
          {/* Member portal: the member's own records only, read-only except profile. */}
          <Route element={<ProtectedRoute roles={['MEMBER']} />}>
            <Route element={<AppLayout />}>
              <Route index element={<PortalDashboardPage />} />
              <Route path="/profile" element={<PortalProfilePage />} />
              <Route path="/routines" element={<MyRoutinesPage />} />
              <Route path="/attendance" element={<PortalAttendancePage />} />
              <Route path="/membership" element={<PortalMembershipPage />} />
              <Route path="/payments" element={<PortalPaymentsPage />} />
              <Route path="/notifications" element={<PortalNotificationsPage />} />
            </Route>
          </Route>
          <Route element={<ProtectedRoute roles={['SUPER_ADMIN']} />}>
            <Route element={<AppLayout />}>
              <Route path="/admin" element={<AdminDashboardPage />} />
              <Route path="/admin/gyms" element={<GymsPage />} />
              <Route path="/admin/gyms/:id" element={<GymDetailPage />} />
              <Route path="/admin/audit" element={<GymAuditPage global />} />
            </Route>
          </Route>
          <Route element={<ProtectedRoute roles={['GYM_ADMIN', 'INSTRUCTOR', 'MEMBER']} />}>
            <Route element={<AppLayout />}>
              <Route path="/notifications/center" element={<NotificationsPage />} />
            </Route>
          </Route>
          <Route path="/404" element={<NotFoundPage />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
