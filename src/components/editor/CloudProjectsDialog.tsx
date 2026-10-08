import { useEffect } from "react";
import { CloudUpload, History, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useEditorStore } from "@/store/editorStore";
import { browserCloudProjectSession } from "@/lib/editor/cloudProjectDevice";
import { useCloudProjects } from "@/lib/editor/useCloudProjects";
import { saveProject, setLastProjectId } from "@/lib/editor/projectStore";
import { toast } from "sonner";

export function CloudProjectsDialog({ open, onOpenChange }: { open: boolean; onOpenChange(value: boolean): void }) {
  const { walletAddress } = useAuth();
  const preserve = async () => { const snapshot = useEditorStore.getState().toSnapshot(); await saveProject(snapshot); setLastProjectId(snapshot.id); };
  const cloud = useCloudProjects(walletAddress, browserCloudProjectSession, {
    current: () => useEditorStore.getState().toSnapshot(), preserve,
    open: snapshot => { useEditorStore.getState().loadSnapshot(snapshot); setLastProjectId(snapshot.id); },
  });
  useEffect(() => { if (open && walletAddress) void cloud.refresh(); }, [open, walletAddress]);
  return <Dialog open={open} onOpenChange={value => { if (value || !cloud.busy) onOpenChange(value); }}>
    <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto border-white/10 bg-black/95 text-white">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><CloudUpload className="h-5 w-5" /> Cloud projects</DialogTitle>
        <DialogDescription className="text-white/60">Save your timeline and source media to open on another device. Versions open as separate local projects.</DialogDescription></DialogHeader>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={cloud.busy} onClick={() => { void preserve().then(() => toast.success("Saved on this device.")).catch(() => toast.error("Could not save this project.")); }}>Save on device</Button>
        <Button disabled={!cloud.available || cloud.busy} onClick={() => { void cloud.save(); }}>Save to cloud</Button>
        <Button variant="outline" disabled={!cloud.available || cloud.busy} onClick={() => { void cloud.save(true); }}>Save a copy</Button>
      </div>
      {!cloud.available && <p className="text-sm text-white/60">Sign in to use cloud projects.</p>}
      {cloud.busy && <p role="status" className="text-sm text-white/60">Transferring project…</p>}
      {cloud.error && <p role="alert" className="text-sm text-red-300">{cloud.error}</p>}
      {cloud.saved && <p role="status" className="text-sm text-white/80">Cloud version saved.</p>}
      <div className="flex items-center justify-between"><h3 className="text-sm font-medium">{cloud.selected ? "Version history" : "Your cloud projects"}</h3>
        {cloud.selected ? <Button variant="ghost" size="sm" disabled={cloud.busy} onClick={cloud.clearHistory}>Back</Button>
          : <Button variant="ghost" size="icon" disabled={!cloud.available || cloud.busy} aria-label="Refresh cloud projects" onClick={() => { void cloud.refresh(); }}><RefreshCw className="h-4 w-4" /></Button>}</div>
      {cloud.selected ? <div className="space-y-2">{cloud.history.map(version => <div key={version.revision} className="rounded-lg border border-white/10 p-3">
        <p className="text-sm">Version {version.revision} · {new Date(version.savedAt).toLocaleString()}</p>
        <p className="mb-2 truncate text-xs text-white/60">{version.title}</p>
        <div className="flex gap-2"><Button size="sm" variant="outline" disabled={cloud.busy} onClick={() => { void cloud.open(version.projectId, version.revision); }}>Open copy</Button>
          <Button size="sm" variant="outline" disabled={cloud.busy || version.revision === cloud.selected?.revision} onClick={() => { void cloud.restore(version.revision); }}>Restore as new version</Button></div>
      </div>)}</div> : <div className="space-y-2">{cloud.projects.map(project => <div key={project.projectId} className="flex items-center gap-2 rounded-lg border border-white/10 p-3">
        <button className="min-w-0 flex-1 text-left" disabled={cloud.busy} onClick={() => { void cloud.open(project.projectId); }}><span className="block truncate text-sm">{project.title || "Untitled"}</span>
          <span className="text-xs text-white/50">Version {project.revision} · {new Date(project.savedAt).toLocaleDateString()}</span></button>
        <Button variant="ghost" size="icon" disabled={cloud.busy} aria-label={`History for ${project.title}`} onClick={() => { void cloud.showHistory(project); }}><History className="h-4 w-4" /></Button>
      </div>)}{!cloud.projects.length && cloud.available && !cloud.busy && !cloud.error && <p className="text-sm text-white/50">No cloud projects yet.</p>}</div>}
    </DialogContent>
  </Dialog>;
}
