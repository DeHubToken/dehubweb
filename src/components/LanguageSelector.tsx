import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { Globe } from "lucide-react";
import Check from "@/components/ui/cut-icons/check";

import Search from "@/components/ui/cut-icons/search";

import { useMemo, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useLanguage, languages, type LanguageOption } from "@/contexts/LanguageContext";

// Intl names the two Chinese scripts, not the bundle codes.
const INTL_CODE: Partial<Record<string, string>> = { zh: 'zh-Hans', zh_tw: 'zh-Hant' };

export function LanguageSelector() {
  const { t: _copy } = _useCopy();
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useSurfaceDraft("components/LanguageSelector.tsx:search", "");
  const current = languages.find(l => l.code === language);

  // The line under each endonym names the language in the reader's language.
  // English keeps the hand-written labels, and so does any name Intl cannot
  // give: it is missing on older WebViews, and a reader language the runtime
  // has no data for resolves to some other default, not to this reader's.
  const displayNames = useMemo(() => {
    if (language === 'en') return null;
    const tag = language.replace('_', '-');
    try {
      const names = new Intl.DisplayNames([tag], { type: 'language', fallback: 'none' });
      const resolved = names.resolvedOptions().locale.split('-')[0].toLowerCase();
      return resolved === tag.split('-')[0] ? names : null;
    } catch {
      return null;
    }
  }, [language]);
  const nameOf = (lang: LanguageOption) => {
    try {
      return displayNames?.of(INTL_CODE[lang.code] ?? lang.code) || lang.label;
    } catch {
      return lang.label;
    }
  };

  const filtered = languages.filter(
    (lang) =>
      lang.nativeLabel.toLowerCase().includes(search.toLowerCase()) ||
      lang.label.toLowerCase().includes(search.toLowerCase()) ||
      nameOf(lang).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button className="flex items-center gap-1.5 w-full text-sm text-foreground hover:opacity-80 transition-opacity px-1 py-1 min-w-0">
          <Globe className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{current?.nativeLabel}</span>
        </button>
      </DrawerTrigger>
      <DrawerContent
        className="border-t border-white/10 max-h-[85dvh]"
        style={{
          background: 'rgba(30, 30, 30, 0.65)',
          backdropFilter: 'blur(40px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}
      >
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-white text-lg">{_copy("copy.2d8f9954cb33", { defaultValue: "Select Language" })}</DrawerTitle>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
            <input
              type="text"
              placeholder={_copy("copy.7858b9baa709", { defaultValue: "Search languages..." })}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-white placeholder:text-white/40 border border-white/15 focus:outline-none focus:border-white/30 transition-colors"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
              }}
            />
          </div>
        </DrawerHeader>
        <div className="overflow-y-auto max-h-[60vh] px-4 pb-6">
          <div className="grid grid-cols-1 gap-1">
            {filtered.map((lang) => (
              <button
                key={lang.code}
                onClick={() => {
                  setLanguage(lang.code as any);
                  setOpen(false);
                  setSearch.complete(search, "");
                }}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all ${
                  lang.code === language
                    ? 'bg-white/15 text-white'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{lang.nativeLabel}</span>
                  <span className="text-xs text-white/40">{nameOf(lang)}</span>
                </div>
                {lang.code === language && (
                  <Check className="w-4 h-4 text-white" />
                )}
              </button>
            ))}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
