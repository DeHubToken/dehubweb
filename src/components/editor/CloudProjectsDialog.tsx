import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { CloudUpload, History, MessageSquare, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { ProjectReviewPanel } from "./ProjectReviewPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useEditorStore } from "@/store/editorStore";
import { browserCloudProjectSession } from "@/lib/editor/cloudProjectDevice";
import { useCloudProjects } from "@/lib/editor/useCloudProjects";
import { saveProject, setLastProjectId } from "@/lib/editor/projectStore";
import { toast } from "sonner";

export function CloudProjectsDialog({ open, onOpenChange }: { open: boolean; onOpenChange(value: boolean): void }) {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const [query, setQuery] = useSurfaceDraft("components/editor/CloudProjectsDialog.tsx:query", "");
  const preserve = async () => { const snapshot = useEditorStore.getState().toSnapshot(); await saveProject(snapshot); setLastProjectId(snapshot.id); };
  const cloud = useCloudProjects(walletAddress, browserCloudProjectSession, {
    current: () => useEditorStore.getState().toSnapshot(), preserve,
    open: snapshot => { useEditorStore.getState().loadSnapshot(snapshot); setLastProjectId(snapshot.id); },
    receive: (snapshot,key) => useEditorStore.getState().applySharedSnapshot(snapshot,key),
    seek: seconds => { useEditorStore.getState().setIsPlaying(false); useEditorStore.getState().setCurrentTime(seconds); },
  });
  useEffect(() => { if (open && walletAddress) void cloud.refresh(); }, [open, walletAddress]);
  useEffect(() => { setQuery.initialize(""); }, [walletAddress, setQuery]);
  const matching = cloud.projects.filter(project => (project.title || "Untitled").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const matchingShared = cloud.sharedProjects.filter(project => (project.title || "Untitled").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <Dialog open={open} onOpenChange={value => { if (value || !cloud.busy) onOpenChange(value); }}>
    <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto border-white/10 bg-black/95 text-white">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><CloudUpload className="h-5 w-5" /> Cloud projects</DialogTitle>
        <DialogDescription className="text-white/60">Save your timeline and source media to open on another device. Versions open as separate local projects.</DialogDescription></DialogHeader>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={cloud.busy} onClick={() => { void preserve().then(() => toast.success("Saved on this device.")).catch(() => toast.error("Could not save this project.")); }}>Save on device</Button>
        <Button disabled={!cloud.available || cloud.busy || cloud.linkPending} onClick={() => { void cloud.save(); }}>Save to cloud</Button>
        <Button variant="outline" disabled={!cloud.available || cloud.busy || cloud.linkPending} onClick={() => { void cloud.save(true); }}>Save a copy</Button>
        <Button variant="outline" disabled={!cloud.canReceive || cloud.busy} onClick={() => { void cloud.receiveChanges(); }}><RefreshCw className="mr-2 h-4 w-4" />{t("editor.sharedTimeline.receive")}</Button>
      </div>
      <p className="text-xs text-white/60">{t("editor.sharedTimeline.hint")}</p>
      {cloud.received && <p role="status" className="text-sm text-white/80">{t(cloud.received.changed ? "editor.sharedTimeline.received" : "editor.sharedTimeline.upToDate", {revision:cloud.received.revision})}</p>}
      {!!cloud.received?.protectedUndo && <p className="text-xs text-white/60">{t("editor.sharedTimeline.protectedUndo")}</p>}
      {cloud.sharedOwner && <div className="rounded-lg border border-white/15 bg-white/5 p-3 text-xs text-white/75"><p>Editing a shared project. Save updates its cloud version; Save a copy makes your own project.</p><p className="mt-1 break-all">Owner: {cloud.sharedOwner}</p></div>}
      {cloud.mergeCopy && <div className="space-y-2 rounded-lg border border-white/15 p-3 text-xs text-white/75"><p>Combined cloud version {cloud.mergeCopy.revision} is ready. Your newer local edits were kept on this device.</p><Button size="sm" variant="outline" disabled={cloud.busy} onClick={()=>{void cloud.openMergeCopy();}}>Open combined copy</Button></div>}
      {!cloud.available && <p className="text-sm text-white/60">Sign in to use cloud projects.</p>}
      {cloud.busy && <p role="status" className="text-sm text-white/60">Transferring project…</p>}
      {cloud.error && <p role="alert" className="text-sm text-red-300">{cloud.error}</p>}
      {cloud.saved && <p role="status" className="text-sm text-white/80">Cloud version saved.</p>}
      <div className="flex gap-2" role="group" aria-label="Cloud project library">
        <Button size="sm" variant={cloud.viewTrash || cloud.viewShared ? "outline" : "secondary"} disabled={!cloud.available || cloud.busy} aria-pressed={!cloud.viewTrash && !cloud.viewShared} onClick={() => { void cloud.switchView(false); }}>Projects</Button>
        <Button size="sm" variant={cloud.viewShared ? "secondary" : "outline"} disabled={!cloud.available || cloud.busy} aria-pressed={cloud.viewShared} onClick={()=>{void cloud.switchShared();}}>Shared with you</Button>
        <Button size="sm" variant={cloud.viewTrash ? "secondary" : "outline"} disabled={!cloud.available || cloud.busy} aria-pressed={cloud.viewTrash} onClick={() => { void cloud.switchView(true); }}><Trash2 className="mr-2 h-4 w-4" />Trash</Button>
      </div>
      {!cloud.selected && !cloud.review && <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search projects" aria-label="Search cloud projects" disabled={!cloud.available} className="border-white/15 bg-white/5 text-white placeholder:text-white/50 disabled:opacity-60" />}
      {cloud.viewTrash && <p className="text-xs text-white/60">Versions and source media are kept. Restore a project to continue editing.</p>}
      {cloud.review ? <ProjectReviewPanel cloud={cloud} wallet={walletAddress?.toLowerCase() || ""} onEditShared={()=>{void cloud.openShared(()=>onOpenChange(false));}} onOpenCopy={(revision,seconds)=>{void cloud.openReview(revision,seconds,()=>onOpenChange(false));}} /> : <><div className="flex items-center justify-between"><h3 className="text-sm font-medium">{cloud.selected ? "Version history" : cloud.viewTrash ? "Trash" : cloud.viewShared ? "Shared with you" : "Your cloud projects"}</h3>
        {cloud.selected ? <Button variant="ghost" size="sm" disabled={cloud.busy} onClick={cloud.clearHistory}>Back</Button>
          : <Button variant="ghost" size="icon" disabled={!cloud.available || cloud.busy} aria-label="Refresh cloud projects" onClick={() => { void cloud.refresh(); }}><RefreshCw className="h-4 w-4" /></Button>}</div>
      {cloud.viewShared ? <div className="space-y-2">{matchingShared.map(project=><div key={`${project.ownerWallet}:${project.projectId}`} className="space-y-2 rounded-lg border border-white/10 p-3"><p className="truncate text-sm">{project.title || "Untitled"}</p><p className="text-xs text-white/50">Version {project.revision} · {project.role==="editor" ? "Can edit" : project.role==="commenter" ? "Can comment" : "Can view"}</p><div className="flex flex-wrap gap-2">
          {project.accepted ? <Button size="sm" variant="outline" disabled={cloud.busy} onClick={()=>{void cloud.showReview(project);}}>Review</Button> : <Button size="sm" disabled={cloud.busy} onClick={()=>{void cloud.acceptReview(project);}}>Accept invitation</Button>}
          <Button size="sm" variant="ghost" disabled={cloud.busy} onClick={()=>{void cloud.leaveReview(project);}}>{project.accepted ? "Leave review" : "Decline invitation"}</Button>
        </div></div>)}{!matchingShared.length && cloud.available && !cloud.busy && !cloud.error && <p className="text-sm text-white/50">No shared projects.</p>}</div> : cloud.selected ? <div className="space-y-2">{cloud.history.map(version => <div key={version.revision} className="rounded-lg border border-white/10 p-3">
        <p className="text-sm">Version {version.revision} · {new Date(version.savedAt).toLocaleString()}</p>
        <p className="mb-2 truncate text-xs text-white/60">{version.title}</p>
        <div className="flex gap-2"><Button size="sm" variant="outline" disabled={cloud.busy} onClick={() => { void cloud.open(version.projectId, version.revision); }}>Open copy</Button>
          <Button size="sm" variant="outline" disabled={cloud.busy || version.revision === cloud.selected?.revision} onClick={() => { void cloud.restore(version.revision); }}>Restore as new version</Button></div>
      </div>)}</div> : <div className="space-y-2">{matching.map(project => <div key={project.projectId} className="flex items-center gap-2 rounded-lg border border-white/10 p-3">
        <button className="min-w-0 flex-1 text-left" disabled={cloud.busy || cloud.viewTrash} onClick={() => { void cloud.open(project.projectId); }}><span className="block truncate text-sm">{project.title || "Untitled"}</span>
          <span className="text-xs text-white/50">Version {project.revision} · {new Date(project.savedAt).toLocaleDateString()}</span></button>
        {!cloud.viewTrash && <Button variant="ghost" size="icon" disabled={cloud.busy} aria-label={`History for ${project.title}`} onClick={() => { void cloud.showHistory(project); }}><History className="h-4 w-4" /></Button>}
        {!cloud.viewTrash && <Button variant="ghost" size="icon" disabled={cloud.busy} aria-label={`Review and share ${project.title}`} onClick={()=>{void cloud.showReview({...project,ownerWallet:walletAddress?.toLowerCase() || "",role:"owner"});}}><MessageSquare className="h-4 w-4" /></Button>}
        <Button variant="ghost" size={cloud.viewTrash ? "sm" : "icon"} disabled={cloud.busy} aria-label={`${cloud.viewTrash ? "Restore" : "Move to Trash"}: ${project.title}`} onClick={() => { void cloud.setTrash(project, !cloud.viewTrash); }}>
          {cloud.viewTrash ? <><RotateCcw className="mr-2 h-4 w-4" />Restore</> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>)}{!matching.length && cloud.available && !cloud.busy && !cloud.error && <p className="text-sm text-white/50">{query.trim() ? "No matching projects." : cloud.viewTrash ? "Trash is empty." : "No cloud projects yet."}</p>}</div>}</>}
    </DialogContent>
  </Dialog>;
}
