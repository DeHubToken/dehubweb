/**
 * Searchable Google Font picker with in-line previews.
 * Fonts are lazily loaded on hover/selection so the initial menu is cheap.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  GOOGLE_FONTS,
  fontFamilyCss,
  loadGoogleFont,
  primaryFamily,
  type GoogleFont,
} from "@/lib/editor/googleFonts";

const CATEGORIES = ["all", "sans-serif", "serif", "display", "handwriting", "monospace"] as const;

interface Props {
  /** Current CSS font-family value on the clip. */
  value: string;
  onChange: (cssFamily: string, weights: number[]) => void;
}

export function FontPicker({ value, onChange }: Props) {
  const currentName = primaryFamily(value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("all");
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GOOGLE_FONTS.filter((f) => {
      if (category !== "all" && f.category !== category) return false;
      if (!q) return true;
      return f.family.toLowerCase().includes(q);
    });
  }, [query, category]);

  // Lazy-load the currently-selected font so the trigger previews it.
  useEffect(() => {
    const match = GOOGLE_FONTS.find(
      (f) => f.family.toLowerCase() === currentName.toLowerCase(),
    );
    if (match) loadGoogleFont(match.family, match.weights);
  }, [currentName]);

  // On open: preload previews for the currently visible slice.
  useEffect(() => {
    if (!open) return;
    const first = filtered.slice(0, 24);
    for (const f of first) loadGoogleFont(f.family, [Math.min(...f.weights)]);
  }, [open, filtered]);

  const pick = (font: GoogleFont) => {
    loadGoogleFont(font.family, font.weights);
    onChange(fontFamilyCss(font.family, font.category), font.weights);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          className="h-7 w-full justify-between rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white hover:bg-white/10"
        >
          <span className="truncate" style={{ fontFamily: value }}>
            {currentName || "Choose font"}
          </span>
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 border-white/10 bg-black/85 p-0 text-white backdrop-blur-[24px]"
      >
        <div className="flex items-center gap-1 border-b border-white/10 px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-white/40" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search fonts…"
            className="h-7 border-0 bg-transparent p-0 text-xs text-white placeholder:text-white/40 focus-visible:ring-0"
          />
        </div>
        <div className="flex flex-wrap gap-1 border-b border-white/10 px-2 py-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] uppercase tracking-wide transition",
                category === c
                  ? "bg-white/15 text-white"
                  : "text-white/50 hover:bg-white/5 hover:text-white",
              )}
            >
              {c === "all" ? "All" : c === "sans-serif" ? "Sans" : c === "serif" ? "Serif" : c === "handwriting" ? "Script" : c === "monospace" ? "Mono" : c}
            </button>
          ))}
        </div>
        <ScrollArea className="h-72">
          <div ref={listRef} className="p-1">
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-xs text-white/40">No fonts match “{query}”.</p>
            )}
            {filtered.map((f) => {
              const isSel = f.family.toLowerCase() === currentName.toLowerCase();
              return (
                <button
                  key={f.family}
                  type="button"
                  onMouseEnter={() => loadGoogleFont(f.family, [Math.min(...f.weights)])}
                  onClick={() => pick(f)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-white/85 transition hover:bg-white/10",
                    isSel && "bg-white/10 text-white",
                  )}
                >
                  <span className="flex flex-col overflow-hidden">
                    <span className="truncate text-[10px] uppercase tracking-wide text-white/40">
                      {f.category}
                    </span>
                    <span
                      className="truncate text-sm"
                      style={{ fontFamily: fontFamilyCss(f.family, f.category) }}
                    >
                      {f.family}
                    </span>
                  </span>
                  {isSel && <Check className="h-3.5 w-3.5 shrink-0 text-white" />}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
