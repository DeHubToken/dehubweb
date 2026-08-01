/**
 * Phone bottom bar.
 * =================
 * Below `md` the icon rail has nowhere to dock, so the same tabs run along the
 * bottom and open their panel as a sheet. Above `md` the rail and the docked
 * column take over and this renders nothing.
 *
 * The open panel is the shared `editorUiStore` value, not local state. Keeping
 * a private copy here meant the six places that navigate between panels by
 * calling `setPanel` (the Design panel's quick-start buttons, the Generate
 * panel handing off to Generations, and so on) silently did nothing on a
 * phone, and it mounted a second copy of every panel with duplicate element
 * ids while the docked column sat hidden behind CSS.
 */
import { useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import { useCloseOnSurfaceSwitch, useSurfaceEpoch } from "@/hooks/use-surface-switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PanelBody } from "@/components/editor/EditorRail";
import { INSPECTOR_TAB, RAIL_TABS } from "@/components/editor/railTabs";
import { useEditorStore } from "@/store/editorStore";
import { useEditorUiStore } from "@/store/editorUiStore";
import { useGenerationStore } from "@/store/generationStore";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export function MobileBottomBar() {
  const isMobile = useIsMobile();
  const panel = useEditorUiStore((s) => s.panel);
  const setPanel = useEditorUiStore((s) => s.setPanel);
  const togglePanel = useEditorUiStore((s) => s.togglePanel);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const runningCount = useGenerationStore((s) =>
    s.jobs.filter((j) => j.status === "running").length,
  );
  const surfaceEpoch = useSurfaceEpoch();

  // The sheet is a Radix portal on document.body, so the host hiding /editor
  // does not hide it. Without this it stays up as a modal over /creator.
  useCloseOnSurfaceSwitch(useCallback(() => setPanel(null), [setPanel]));

  const tabs = selectedClipIds.length > 0 ? [...RAIL_TABS, INSPECTOR_TAB] : RAIL_TABS;
  const openTab = tabs.find((t) => t.id === panel);

  // The shared default of 'design' is right for the docked column but wrong
  // here: it would throw a sheet over three quarters of the screen the moment
  // the editor loads on a phone. Start closed, once, as soon as we know the
  // width. Tapping a tab is what opens it after that.
  const closedForPhone = useRef(false);
  useEffect(() => {
    if (isMobile && !closedForPhone.current) {
      closedForPhone.current = true;
      setPanel(null);
    }
  }, [isMobile, setPanel]);

  // Only the phone layout owns a sheet; the docked column handles md and up.
  const sheetOpen = isMobile && panel !== null;

  return (
    <>
      <nav
        className="flex h-14 shrink-0 items-stretch justify-start gap-0.5 overflow-x-auto border-t border-white/10 bg-black/70 px-1 backdrop-blur-[24px] scrollbar-none md:hidden"
        aria-label="Editor tools"
      >
        <Link
          to="/"
          aria-label="Home"
          className="flex w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-lg text-white/55 transition hover:bg-white/10 hover:text-white"
        >
          <Home className="h-[18px] w-[18px]" />
          <span className="text-[9px] font-medium leading-none">Home</span>
        </Link>

        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = panel === tab.id;
          const badge = tab.id === "library" && runningCount > 0 ? runningCount : null;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => togglePanel(tab.id)}
              aria-pressed={active}
              aria-label={tab.label}
              className={cn(
                "relative flex w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-lg transition",
                active ? "bg-white/[0.14] text-white" : "text-white/55 hover:bg-white/10 hover:text-white",
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              <span className="text-[9px] font-medium leading-none">{tab.label}</span>
              {badge !== null && (
                <span className="absolute right-2 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-white px-1 text-[8px] font-bold tabular-nums text-black">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <Sheet key={surfaceEpoch} open={sheetOpen} onOpenChange={(open) => !open && setPanel(null)}>
        <SheetContent
          side="bottom"
          className="h-[76dvh] border-white/10 bg-zinc-950/95 p-0 text-white backdrop-blur-[24px]"
        >
          <SheetHeader className="border-b border-white/10 px-3 py-2.5 text-left">
            <SheetTitle className="text-sm text-white/85">{openTab?.label ?? ""}</SheetTitle>
          </SheetHeader>
          <div className="h-[calc(76dvh-3.25rem)] min-h-0">
            {sheetOpen && panel ? <PanelBody panel={panel} /> : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
