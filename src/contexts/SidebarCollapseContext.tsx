import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

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

  // Effective value: collapse only active on desktop lg+
  const isCollapsed = isDesktop && storedCollapsed;

  const toggleCollapse = useCallback(() => {
    setStoredCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  const setCollapsed = useCallback((value: boolean) => {
    setStoredCollapsed(value);
    try { localStorage.setItem(STORAGE_KEY, String(value)); } catch {}
  }, []);

  return (
    <SidebarCollapseContext.Provider value={{ isCollapsed, toggleCollapse, setCollapsed }}>
      {children}
    </SidebarCollapseContext.Provider>
  );
}

export const useSidebarCollapse = () => useContext(SidebarCollapseContext);
