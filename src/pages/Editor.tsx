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
        <div className="hidden h-full w-64 shrink-0 lg:block">
          <MediaPanel />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 min-w-0 flex-1">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <Compositor />
            </div>
            <div className="hidden h-full w-72 shrink-0 lg:block">
              <Inspector />
            </div>
          </div>
          <div className="h-[38vh] min-h-[180px] w-full shrink-0 overflow-hidden">
            <Timeline />
          </div>
          <MobileBottomBar />
        </div>
      </div>

      <footer className="flex h-7 shrink-0 items-center justify-end gap-2 border-t border-white/10 bg-black/60 px-3 text-[10px] text-white/40 backdrop-blur-[24px]">
        <span>Built on</span>
        <a
          href="https://github.com/OpenCut-app/OpenCut"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/60 underline-offset-2 hover:text-white hover:underline"
        >
          OpenCut (MIT)
        </a>
      </footer>

      <ShortcutsLayer />
      <Autosave />
    </div>
  );
}
