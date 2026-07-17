import { useCallback, useEffect, useState } from 'react';
import {
  adminLogin,
  adminLogout,
  clearAdminSession,
  getAdminToken,
  type AdminSession,
} from '@/lib/api/dehub/admin';

export function useAdminAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getAdminToken());
  const [adminEmail, setAdminEmail] = useState<string | null>(null);

  useEffect(() => {
    setIsAuthenticated(!!getAdminToken());
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session: AdminSession = await adminLogin(email, password);
    setIsAuthenticated(true);
    setAdminEmail(session.admin.email);
    return session;
  }, []);

  const logout = useCallback(async () => {
    await adminLogout();
    setIsAuthenticated(false);
    setAdminEmail(null);
  }, []);

  const clearSession = useCallback(() => {
    clearAdminSession();
    setIsAuthenticated(false);
    setAdminEmail(null);
  }, []);

  return { isAuthenticated, adminEmail, login, logout, clearSession };
}
