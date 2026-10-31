import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { UserRole } from '@gym-saas/shared';
import { useAuth } from '../../lib/auth';
import { LoadingState } from '../ui/states';

export function ProtectedRoute({ roles }: { roles?: UserRole[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingState label="Loading your workspace…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles && location.pathname === '/' && user.role === 'SUPER_ADMIN') {
    return <Navigate to="/admin" replace />;
  }
  if (!roles && location.pathname === '/' && user.role === 'GYM_ADMIN') {
    return <Navigate to="/gym" replace />;
  }
  if (!roles && location.pathname === '/' && user.role === 'INSTRUCTOR') {
    return <Navigate to="/instructor" replace />;
  }
  if (roles && !roles.includes(user.role)) {
    const destination =
      user.role === 'SUPER_ADMIN' ? '/admin' : user.role === 'GYM_ADMIN' ? '/gym' : user.role === 'INSTRUCTOR' ? '/instructor' : '/';
    return <Navigate to={destination} replace />;
  }
  return <Outlet />;
}
