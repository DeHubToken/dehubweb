import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getAdminToken } from '@/lib/api/dehub/admin';

export function AdminRoute() {
  const location = useLocation();
  if (!getAdminToken()) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
