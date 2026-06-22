import { useEditorStore } from "@/store/editorStore";
import { LiquidGlassBubble2 } from "@/components/ui/liquid-glass-bubble-2";
import { Save, Download } from "lucide-react";
import { toast } from "sonner";

export function EditorTopBar() {
  const title = useEditorStore((s) => s.projectTitle);
  const setTitle = useEditorStore((s) => s.setProjectTitle);

  const placeholder = (label: string) => () =>
    toast(`${label} will arrive in a later phase.`);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/60 px-4 backdrop-blur-[24px]">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-white">{"\n"}</span>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Project title"
        className="mx-auto w-64 max-w-[40vw] rounded-md bg-transparent px-2 py-1 text-center text-sm text-white/90 outline-none ring-1 ring-transparent transition focus:bg-white/5 focus:ring-white/20"
      />

      <div className="flex items-center gap-2">
        <LiquidGlassBubble2
          label="Save"
          icon={<Save className="w-4 h-4" />}
          onClick={placeholder("Save")}
          width="100px"
          height="36px"
        />
        <LiquidGlassBubble2
          label="Export"
          icon={<Download className="w-4 h-4" />}
          onClick={placeholder("Export")}
          width="110px"
          height="36px"
          active
        />
      </div>
    </header>
  );
}
