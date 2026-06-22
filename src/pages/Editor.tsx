/**
 * /editor — DeHub in-browser video editor.
 * Phase 1 (shell) + Phase 2 (media import) only. Adapted from OpenCut (MIT).
 * See LICENSE-OpenCut for attribution.
 */
import { Helmet } from "react-helmet-async";
import { EditorTopBar } from "@/components/editor/EditorTopBar";
import { MediaPanel } from "@/components/editor/MediaPanel";
import { PreviewPlayer } from "@/components/editor/PreviewPlayer";
import { TimelinePlaceholder } from "@/components/editor/TimelinePlaceholder";

export default function EditorPage() {
  return (
    <div className="fixed inset-0 flex flex-col bg-black text-white">
      <Helmet>
        <title>Editor — DeHub</title>
        <meta name="description" content="Edit videos directly in your browser with the DeHub video editor." />
      </Helmet>

      <EditorTopBar />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="h-56 w-full shrink-0 md:h-full md:w-72">
          <MediaPanel />
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <PreviewPlayer />
          <TimelinePlaceholder />
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
    </div>
  );
}
