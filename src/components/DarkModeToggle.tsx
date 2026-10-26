import { Sun } from "lucide-react";
import Moon from "@/components/ui/cut-icons/appearance";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

export function DarkModeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { t } = useLanguage();

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    if (compact) return <span className="inline-block w-9 h-9" aria-hidden="true" />;
    return (
      <Button variant="ghost" size="sm" className="w-full justify-start gap-3 px-3 py-2">
        <div className="w-4 h-4" />
        <span>{t('common.theme')}</span>
      </Button>
    );
  }

  const isDark = theme === "dark";
  const label = isDark ? t('common.lightMode') : t('common.darkMode');

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={label}
        title={label}
        data-docs-chip
        className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-foreground hover:bg-muted transition-colors"
      >
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="w-full justify-start gap-3 px-3 py-2 text-foreground hover:bg-muted"
    >
      {isDark ? (
        <Sun className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
      <span>{isDark ? t('common.lightMode') : t('common.darkMode')}</span>
    </Button>
  );
}
