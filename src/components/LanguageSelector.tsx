import { Globe, Search, Check } from "lucide-react";
import { useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useLanguage, languages } from "@/contexts/LanguageContext";

export function LanguageSelector() {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const current = languages.find(l => l.code === language);

  const filtered = languages.filter(
    (lang) =>
      lang.nativeLabel.toLowerCase().includes(search.toLowerCase()) ||
      lang.label.toLowerCase().includes(search.toLowerCase())
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
        className="border-t border-white/10 max-h-[85vh]"
        style={{
          background: 'rgba(30, 30, 30, 0.65)',
          backdropFilter: 'blur(40px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}
      >
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-white text-lg">Select Language</DrawerTitle>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
            <input
              type="text"
              placeholder="Search languages..."
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
                  setSearch("");
                }}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all ${
                  lang.code === language
                    ? 'bg-white/15 text-white'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{lang.nativeLabel}</span>
                  <span className="text-xs text-white/40">{lang.label}</span>
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
