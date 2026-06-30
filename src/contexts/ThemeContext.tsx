import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const THEME_STORAGE_KEY = 'dehub.theme';

type ThemeContextValue = {
  theme: string;
  setTheme: (value: string) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<string>(() => {
    if (typeof window === 'undefined') return 'system';
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY) || 'system';
    // Migrate old 'christmas' theme name to 'winter'.
    return stored === 'christmas' ? 'winter' : stored;
  });

  const setTheme = (value: string) => {
    setThemeState(value);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch {
      // ignore quota / private-mode errors
    }
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Safe fallback so components don't crash if provider is missing.
    return { theme: 'system', setTheme: () => {} } as ThemeContextValue;
  }
  return ctx;
}
