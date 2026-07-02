import { useEditorStore } from "@/store/editorStore";
import { LiquidGlassBubble2 } from "@/components/ui/liquid-glass-bubble-2";
import { Button } from "@/components/ui/button";
import { Save, Download, Undo2, Redo2, FilePlus2, Info, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { listProjects, deleteProject, setLastProjectId } from "@/lib/editor/projectStore";
import type { ProjectSnapshot } from "@/lib/editor/types";
import { ExportDialog } from "@/components/editor/ExportDialog";
import { PostToDeHub } from "@/components/editor/PostToDeHub";
import { AboutDialog } from "@/components/editor/AboutDialog";

export function EditorTopBar() {
  const navigate = useNavigate();
  const title = useEditorStore((s) => s.projectTitle);
  const setTitle = useEditorStore((s) => s.setProjectTitle);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const past = useEditorStore((s) => s.past);
  const future = useEditorStore((s) => s.future);
  const newProject = useEditorStore((s) => s.newProject);
  const loadSnapshot = useEditorStore((s) => s.loadSnapshot);
  const projectId = useEditorStore((s) => s.projectId);

  const [open, setOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectSnapshot[]>([]);
  useEffect(() => {
    if (!open) return;
    listProjects().then(setProjects).catch(() => undefined);
  }, [open]);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/60 px-4 backdrop-blur-[24px]">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost"
              className="h-8 rounded-md text-white/80 hover:bg-white/10 hover:text-white">
              Projects
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 border-white/10 bg-black/80 p-2 text-white backdrop-blur-[24px]">
            <Button size="sm" variant="ghost"
              onClick={() => { newProject(); setOpen(false); }}
              className="mb-1 w-full justify-start rounded-md text-white/90 hover:bg-white/10">
              <FilePlus2 className="mr-1.5 h-4 w-4" /> New project
            </Button>
            <div className="max-h-72 overflow-y-auto">
              {projects.length === 0 && (
                <p className="px-2 py-3 text-xs text-white/40">No saved projects yet.</p>
              )}
              {projects.map((p) => (
                <div key={p.id}
                  className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-xs hover:bg-white/5 ${
                    p.id === projectId ? "bg-white/5" : ""
                  }`}>
                  <button
                    onClick={() => { loadSnapshot(p); setLastProjectId(p.id); setOpen(false); }}
                    className="min-w-0 flex-1 truncate text-left text-white/90"
                  >
                    {p.title || "Untitled"}
                  </button>
                  <button
                    onClick={async () => { await deleteProject(p.id); setProjects((s) => s.filter((x) => x.id !== p.id)); }}
                    aria-label="Delete project"
                    className="rounded p-1 text-white/30 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="mx-1 h-4 w-px bg-white/10" />
        <Button size="icon" variant="ghost" onClick={undo} disabled={!past.length}
          aria-label="Undo"
          className="h-8 w-8 rounded-md text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-30">
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={redo} disabled={!future.length}
          aria-label="Redo"
          className="h-8 w-8 rounded-md text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-30">
          <Redo2 className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => setAboutOpen(true)}
          aria-label="About the editor"
          className="h-8 w-8 rounded-md text-white/60 hover:bg-white/10 hover:text-white">
          <Info className="h-4 w-4" />
        </Button>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Project title"
        className="mx-auto w-64 max-w-[40vw] rounded-md bg-transparent px-2 py-1 text-center text-sm text-white/90 outline-none ring-1 ring-transparent transition focus:bg-white/5 focus:ring-white/20"
      />

      <div className="hidden items-center gap-1.5 md:flex sm:gap-2">
        <LiquidGlassBubble2
          label="Save"
          icon={<Save className="h-4 w-4" />}
          onClick={() => toast.success("Project autosaved.")}
          width="92px"
          height="36px"
        />
        <LiquidGlassBubble2
          label="Export"
          icon={<Download className="h-4 w-4" />}
          onClick={() => setExportOpen(true)}
          width="100px"
          height="36px"
        />
        <PostToDeHub />
      </div>
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </header>
  );
}
