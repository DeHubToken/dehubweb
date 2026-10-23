import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CommandDialog, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DESIGN_PANEL_NAMES } from "@/lib/editor/designPanels";
import { searchDesignCommands, type DesignToolPanelId } from "@/lib/editor/designCommands";
import { useCloseOnSurfaceSwitch } from "@/hooks/use-surface-switch";

export function DesignToolSearch({ onChoose }: { onChoose: (id: DesignToolPanelId) => void }) {
  const { t } = useTranslation(), [open, setOpen] = useState(false), [query, setQuery] = useState(""), [recent, setRecent] = useState<DesignToolPanelId[]>([]);
  const trigger = useRef<HTMLButtonElement>(null), visible = useRef(false); visible.current = open;
  useCloseOnSurfaceSwitch(useCallback(() => { setOpen(false); setQuery(""); }, []));
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !trigger.current?.getClientRects().length || visible.current || event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=menu]")) return;
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); setQuery(""); setOpen(true); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, []);
  const matches = searchDesignCommands(query, recent);
  return <><button ref={trigger} type="button" aria-haspopup="dialog" onClick={() => { setQuery(""); setOpen(true); }} className="flex min-h-9 shrink-0 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs text-white/75 hover:bg-white/10">{t("editor.tools.search", { defaultValue: "Search tools" })}<kbd className="text-white/35">/</kbd></button>
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false} title={t("editor.tools.search", { defaultValue: "Search tools" })} contentClassName="border-white/15 bg-neutral-950 text-white">
      <CommandInput value={query} onValueChange={setQuery} placeholder={t("editor.tools.placeholder", { defaultValue: "Try page numbers, photo grids, or merge cells…" })} />
      <CommandList className="max-h-[60vh] p-2">{!matches.length && <p role="status" className="px-3 py-8 text-center text-sm text-white/45">{t("editor.tools.noResults", { defaultValue: "No matching tools. Try a shorter search." })}</p>}{matches.map(command => <CommandItem key={command.id} value={command.id} onSelect={() => { setRecent(previous => [command.id, ...previous.filter(id => id !== command.id)].slice(0, 5)); setOpen(false); onChoose(command.id); }} className="cursor-pointer rounded-lg text-white/80 aria-selected:bg-white/10 aria-selected:text-white"><span className="min-w-0 flex-1"><span className="block text-sm">{t(`editor.designTools.panel.${command.id}`, { defaultValue: DESIGN_PANEL_NAMES[command.id] })}</span><span className="block text-xs text-white/45">{t(`editor.tools.detail.${command.id}`, { defaultValue: command.detail })}</span></span><span className="ml-3 text-[10px] text-white/35">{t(`editor.tools.category.${command.category}`, { defaultValue: command.category === "create" ? "Create" : command.category === "edit" ? "Edit" : "Document" })}</span></CommandItem>)}</CommandList>
    </CommandDialog>
  </>;
}
