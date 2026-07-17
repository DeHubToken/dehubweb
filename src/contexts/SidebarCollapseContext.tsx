import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useSyncedPreference } from '@/contexts/UserPreferencesContext';

interface SidebarCollapseContextType {
  isCollapsed: boolean;
  toggleCollapse: () => void;
  setCollapsed: (value: boolean) => void;
}

const SidebarCollapseContext = createContext<SidebarCollapseContextType>({
  isCollapsed: false,
  toggleCollapse: () => {},
  setCollapsed: () => {},
});

const STORAGE_KEY = 'sidebar-collapsed';
// Collapse feature only applies on desktop (lg = 1024px).
// On mobile/tablet the desktop sidebar is hidden anyway, so isCollapsed is always false.
const isLargeScreen = () => typeof window !== 'undefined' && window.innerWidth >= 1024;

export function SidebarCollapseProvider({ children }: { children: ReactNode }) {
  const [storedCollapsed, setStoredCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [isDesktop, setIsDesktop] = useState(isLargeScreen);

  useEffect(() => {
    const onResize = () => setIsDesktop(isLargeScreen());
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Reconcile inbound synced value (server → local) for the signed-in account.
  const applyCollapsed = useCallback((v: unknown) => {
    const val = v === true || v === 'true';
    setStoredCollapsed(val);
    try { localStorage.setItem(STORAGE_KEY, String(val)); } catch { /* ignore */ }
  }, []);
  const { push: pushCollapsed } = useSyncedPreference('sidebarCollapsed', storedCollapsed, applyCollapsed, false);

  // Effective value: collapse only active on desktop lg+
  const isCollapsed = isDesktop && storedCollapsed;

  const toggleCollapse = useCallback(() => {
    setStoredCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* ignore */ }
      pushCollapsed(next);
      return next;
    });
  }, [pushCollapsed]);

  const setCollapsed = useCallback((value: boolean) => {
    setStoredCollapsed(value);
    try { localStorage.setItem(STORAGE_KEY, String(value)); } catch { /* ignore */ }
    pushCollapsed(value);
  }, [pushCollapsed]);

  return (
    <SidebarCollapseContext.Provider value={{ isCollapsed, toggleCollapse, setCollapsed }}>
      {children}
    </SidebarCollapseContext.Provider>
  );
}

export const useSidebarCollapse = () => useContext(SidebarCollapseContext);
