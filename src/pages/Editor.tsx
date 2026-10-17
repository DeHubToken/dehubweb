/**
 * /editor — DeHub in-browser video editor.
 *
 * Layout is a Canva-style shell: an icon rail, one focused panel, the canvas,
 * and the timeline. The previous layout only rendered its side panels above
 * 1280px, so anyone on a smaller laptop got a canvas and a timeline with no way
 * to reach media, text or the inspector except through a bottom sheet. Panels
 * now dock from `md` up and fall back to sheets only on phones.
 *
 * Adapted from OpenCut (MIT) — see LICENSE-OpenCut.
 */
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { EditorTopBar } from "@/components/editor/EditorTopBar";
import { EditorRail, EditorPanelColumn } from "@/components/editor/EditorRail";
import { Compositor } from "@/components/editor/Preview/Compositor";
import { Timeline } from "@/components/editor/Timeline/Timeline";
import { Inspector } from "@/components/editor/Inspector";
import { ShortcutsLayer } from "@/components/editor/ShortcutsLayer";
import { Autosave } from "@/components/editor/Autosave";
import { MediaLibraryLoader } from "@/components/editor/MediaLibraryLoader";
import { GenerationWindow } from "@/components/editor/GenerationWindow";
import { MobileBottomBar } from "@/components/editor/MobileBottomBar";
import { useEditorStore } from "@/store/editorStore";
import { useEditorUiStore } from "@/store/editorUiStore";
import { DesignTools } from "@/components/editor/DesignTools";

export default function EditorPage() {
  const { pathname } = useLocation();
  useEffect(() => () => useEditorStore.getState().cancelPendingEdits(), []);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const inspectorOpen = useEditorUiStore((s) => s.inspectorOpen);
  const setInspectorOpen = useEditorUiStore((s) => s.setInspectorOpen);
  const setPanel = useEditorUiStore((s) => s.setPanel);
  const timelineOpen = useEditorUiStore((s) => s.timelineOpen);
  const projectId = useEditorStore(s => s.projectId);
  const needsMediaTimeline = useEditorStore(s => s.clips.some(c => c.kind === "video" || c.kind === "audio") && (s.settings.pages?.length ?? 1) < 2);
  const previousTimeline = useRef<{ id: string; media: boolean } | null>(null);
  useEffect(() => {
    const previous = previousTimeline.current;
    if (!previous || previous.id !== projectId || (!previous.media && needsMediaTimeline)) useEditorUiStore.getState().setTimelineOpen(needsMediaTimeline);
    previousTimeline.current = { id: projectId, media: needsMediaTimeline };
  }, [projectId, needsMediaTimeline]);
  useEffect(() => { if (!pathname.startsWith("/editor")) useEditorUiStore.getState().setCanvasFocus(false); }, [pathname]);

  // The inspector is contextual: it earns a column only once a clip is
  // selected, which leaves the canvas as wide as possible the rest of the time.
  const showInspector = inspectorOpen && selectedClipIds.length > 0;

  // The canvas and timeline ask for the inspector when a clip wants attention.
  // Where it lands depends on width: its own column from lg up, otherwise the
  // rail panel, which the phone bar renders as a sheet. This is the only
  // listener for the event.
  useEffect(() => {
    const handler = () => {
      if (window.matchMedia("(min-width: 1024px)").matches) setInspectorOpen(true);
      else setPanel("inspector");
    };
    window.addEventListener("editor:open-inspector", handler);
    return () => window.removeEventListener("editor:open-inspector", handler);
  }, [setInspectorOpen, setPanel]);

  return (
    <div className="fixed inset-0 flex flex-col bg-black text-white">
      {/* Page metadata lives in CreatorEditorHost, which is the only component
          that knows which of the two co-mounted surfaces is actually visible. */}
      <EditorTopBar />

      <div className="flex min-h-0 min-w-0 flex-1">
        <EditorRail />
        <EditorPanelColumn />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <DesignTools />
          <div className="flex min-h-0 min-w-0 flex-1">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <Compositor />
            </div>
            {showInspector && (
              <div className="hidden h-full w-72 shrink-0 border-l border-white/10 bg-black/60 backdrop-blur-[24px] lg:block">
                <Inspector />
              </div>
            )}
          </div>

          {/* Collapsible so a photo or graphic gets the whole height; the
              toggle sits at the end of the playback bar. */}
          {timelineOpen && (
            <div className="h-[34vh] min-h-[168px] w-full shrink-0 overflow-hidden border-t border-white/10">
              <Timeline />
            </div>
          )}

          <MobileBottomBar />
        </div>
      </div>

      <ShortcutsLayer active={pathname.startsWith("/editor")} />
      <Autosave />
      <MediaLibraryLoader />
      <GenerationWindow />
    </div>
  );
}
