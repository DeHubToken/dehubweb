import { useEditorStore } from "@/store/editorStore";
import { Button } from "@/components/ui/button";
import { Save, Download, Film } from "lucide-react";
import { toast } from "sonner";

export function EditorTopBar() {
  const title = useEditorStore((s) => s.projectTitle);
  const setTitle = useEditorStore((s) => s.setProjectTitle);

  const placeholder = (label: string) => () =>
    toast(`${label} will arrive in a later phase.`);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/60 px-4 backdrop-blur-[24px]">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
          <Film className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-white">{"\n"}</span>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Project title"
        className="mx-auto w-64 max-w-[40vw] rounded-md bg-transparent px-2 py-1 text-center text-sm text-white/90 outline-none ring-1 ring-transparent transition focus:bg-white/5 focus:ring-white/20"
      />

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
          onClick={placeholder("Save")}
        >
          <Save className="mr-1.5 h-4 w-4" /> Save
        </Button>
        <Button
          size="sm"
          className="rounded-xl bg-white text-black hover:bg-white/90"
          onClick={placeholder("Export")}
        >
          <Download className="mr-1.5 h-4 w-4" /> Export
        </Button>
      </div>
    </header>
  );
}
