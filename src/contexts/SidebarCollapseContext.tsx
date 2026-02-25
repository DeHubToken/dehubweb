import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

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

export function SidebarCollapseProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  const setCollapsed = useCallback((value: boolean) => {
    setIsCollapsed(value);
    try { localStorage.setItem(STORAGE_KEY, String(value)); } catch {}
  }, []);

  return (
    <SidebarCollapseContext.Provider value={{ isCollapsed, toggleCollapse, setCollapsed }}>
      {children}
    </SidebarCollapseContext.Provider>
  );
}

export const useSidebarCollapse = () => useContext(SidebarCollapseContext);
