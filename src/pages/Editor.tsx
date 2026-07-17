/**
 * /editor — DeHub in-browser video editor.
 * Phase 3: multi-track timeline, canvas compositor, text overlays, undo/redo,
 * autosave to IndexedDB, keyboard shortcuts.
 * Adapted from OpenCut (MIT) — see LICENSE-OpenCut.
 */
import { Helmet } from "react-helmet-async";
import { EditorTopBar } from "@/components/editor/EditorTopBar";
import { MediaPanel } from "@/components/editor/MediaPanel";
import { Compositor } from "@/components/editor/Preview/Compositor";
import { Timeline } from "@/components/editor/Timeline/Timeline";
import { Inspector } from "@/components/editor/Inspector";
import { ShortcutsLayer } from "@/components/editor/ShortcutsLayer";
import { Autosave } from "@/components/editor/Autosave";
import { MobileBottomBar } from "@/components/editor/MobileBottomBar";

export default function EditorPage() {
  return (
    <div className="fixed inset-0 flex flex-col bg-black text-white">
      <Helmet>
        <title>Editor — DeHub</title>
        <meta name="description" content="Edit videos directly in your browser with the DeHub video editor." />
      </Helmet>

      <EditorTopBar />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
        <div className="hidden h-full w-64 shrink-0 xl:block">
          <MediaPanel />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 min-w-0 flex-1">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <Compositor />
            </div>
            <div className="hidden h-full w-64 shrink-0 xl:block">
              <Inspector />
            </div>
          </div>
          <div className="h-[38vh] min-h-[180px] w-full shrink-0 overflow-hidden">
            <Timeline />
          </div>
          <MobileBottomBar />
        </div>
      </div>


      <ShortcutsLayer />
      <Autosave />
    </div>
  );
}
