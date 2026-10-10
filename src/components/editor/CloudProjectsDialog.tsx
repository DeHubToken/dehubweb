import { useTranslation as _useCopy } from 'react-i18next';
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
  const { t: _copy } = _useCopy();
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
      <DialogHeader><DialogTitle className="flex items-center gap-2"><CloudUpload className="h-5 w-5" />{_copy("copy.dd898475ebd0", { defaultValue: " Cloud projects" })}</DialogTitle>
        <DialogDescription className="text-white/60">{_copy("copy.876cbf2b8b8b", { defaultValue: "Save your timeline and source media to open on another device. Versions open as separate local projects." })}</DialogDescription></DialogHeader>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={cloud.busy} onClick={() => { void preserve().then(() => toast.success(_copy("copy.e495f5fbd650", { defaultValue: "Saved on this device." }))).catch(() => toast.error(_copy("copy.ca84a86ff373", { defaultValue: "Could not save this project." }))); }}>{_copy("copy.a17d4481f773", { defaultValue: "Save on device" })}</Button>
        <Button disabled={!cloud.available || cloud.busy || cloud.linkPending} onClick={() => { void cloud.save(); }}>{_copy("copy.c8af674b1c46", { defaultValue: "Save to cloud" })}</Button>
        <Button variant="outline" disabled={!cloud.available || cloud.busy || cloud.linkPending} onClick={() => { void cloud.save(true); }}>{_copy("copy.2c2a765c72f1", { defaultValue: "Save a copy" })}</Button>
        <Button variant="outline" disabled={!cloud.canReceive || cloud.busy} onClick={() => { void cloud.receiveChanges(); }}><RefreshCw className="mr-2 h-4 w-4" />{t("editor.sharedTimeline.receive")}</Button>
      </div>
      <p className="text-xs text-white/60">{t("editor.sharedTimeline.hint")}</p>
      {cloud.received && <p role="status" className="text-sm text-white/80">{t(cloud.received.changed ? "editor.sharedTimeline.received" : "editor.sharedTimeline.upToDate", {revision:cloud.received.revision})}</p>}
      {!!cloud.received?.protectedUndo && <p className="text-xs text-white/60">{t("editor.sharedTimeline.protectedUndo")}</p>}
      {cloud.sharedOwner && <div className="rounded-lg border border-white/15 bg-white/5 p-3 text-xs text-white/75"><p>{_copy("copy.1bd55b98c963", { defaultValue: "Editing a shared project. Save updates its cloud version; Save a copy makes your own project." })}</p><p className="mt-1 break-all">{_copy("copy.60d5bbcba717", { defaultValue: "Owner: " })}{cloud.sharedOwner}</p></div>}
      {cloud.mergeCopy && <div className="space-y-2 rounded-lg border border-white/15 p-3 text-xs text-white/75"><p>{_copy("copy.2bc16abfcfdb", { defaultValue: "Combined cloud version " })}{cloud.mergeCopy.revision}{_copy("copy.523dd62771d5", { defaultValue: " is ready. Your newer local edits were kept on this device." })}</p><Button size="sm" variant="outline" disabled={cloud.busy} onClick={()=>{void cloud.openMergeCopy();}}>{_copy("copy.b3c2885bf0d8", { defaultValue: "Open combined copy" })}</Button></div>}
      {!cloud.available && <p className="text-sm text-white/60">{_copy("copy.b75175111b88", { defaultValue: "Sign in to use cloud projects." })}</p>}
      {cloud.busy && <p role="status" className="text-sm text-white/60">{_copy("copy.793c8566c71e", { defaultValue: "Transferring project…" })}</p>}
      {cloud.error && <p role="alert" className="text-sm text-red-300">{cloud.error}</p>}
      {cloud.saved && <p role="status" className="text-sm text-white/80">{_copy("copy.7114161df497", { defaultValue: "Cloud version saved." })}</p>}
      <div className="flex gap-2" role="group" aria-label={_copy("copy.15d688e67540", { defaultValue: "Cloud project library" })}>
        <Button size="sm" variant={cloud.viewTrash || cloud.viewShared ? "outline" : "secondary"} disabled={!cloud.available || cloud.busy} aria-pressed={!cloud.viewTrash && !cloud.viewShared} onClick={() => { void cloud.switchView(false); }}>{_copy("copy.04e2a9728af7", { defaultValue: "Projects" })}</Button>
        <Button size="sm" variant={cloud.viewShared ? "secondary" : "outline"} disabled={!cloud.available || cloud.busy} aria-pressed={cloud.viewShared} onClick={()=>{void cloud.switchShared();}}>{_copy("copy.b447129c6d6b", { defaultValue: "Shared with you" })}</Button>
        <Button size="sm" variant={cloud.viewTrash ? "secondary" : "outline"} disabled={!cloud.available || cloud.busy} aria-pressed={cloud.viewTrash} onClick={() => { void cloud.switchView(true); }}><Trash2 className="mr-2 h-4 w-4" />{_copy("copy.c560122ac470", { defaultValue: "Trash" })}</Button>
      </div>
      {!cloud.selected && !cloud.review && <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={_copy("copy.9e079c7df9f1", { defaultValue: "Search projects" })} aria-label={_copy("copy.e6e0ca418dd4", { defaultValue: "Search cloud projects" })} disabled={!cloud.available} className="border-white/15 bg-white/5 text-white placeholder:text-white/50 disabled:opacity-60" />}
      {cloud.viewTrash && <p className="text-xs text-white/60">{_copy("copy.32619bde1291", { defaultValue: "Versions and source media are kept. Restore a project to continue editing." })}</p>}
      {cloud.review ? <ProjectReviewPanel cloud={cloud} wallet={walletAddress?.toLowerCase() || ""} onEditShared={()=>{void cloud.openShared(()=>onOpenChange(false));}} onOpenCopy={(revision,seconds)=>{void cloud.openReview(revision,seconds,()=>onOpenChange(false));}} /> : <><div className="flex items-center justify-between"><h3 className="text-sm font-medium">{cloud.selected ? _copy("copy.a6df11e706c5", { defaultValue: "Version history" }) : cloud.viewTrash ? _copy("copy.c560122ac470", { defaultValue: "Trash" }) : cloud.viewShared ? _copy("copy.b447129c6d6b", { defaultValue: "Shared with you" }) : _copy("copy.681e4dc953d5", { defaultValue: "Your cloud projects" })}</h3>
        {cloud.selected ? <Button variant="ghost" size="sm" disabled={cloud.busy} onClick={cloud.clearHistory}>{_copy("copy.76900f1bfd16", { defaultValue: "Back" })}</Button>
          : <Button variant="ghost" size="icon" disabled={!cloud.available || cloud.busy} aria-label={_copy("copy.25f66bb8fa9f", { defaultValue: "Refresh cloud projects" })} onClick={() => { void cloud.refresh(); }}><RefreshCw className="h-4 w-4" /></Button>}</div>
      {cloud.viewShared ? <div className="space-y-2">{matchingShared.map(project=><div key={`${project.ownerWallet}:${project.projectId}`} className="space-y-2 rounded-lg border border-white/10 p-3"><p className="truncate text-sm">{project.title || _copy("copy.f59ab8d1331b", { defaultValue: "Untitled" })}</p><p className="text-xs text-white/50">{_copy("copy.92b2c95e99f0", { defaultValue: "Version " })}{project.revision} · {project.role==="editor" ? _copy("copy.5abe9e1fbc5b", { defaultValue: "Can edit" }) : project.role==="commenter" ? _copy("copy.737c1a43331e", { defaultValue: "Can comment" }) : _copy("copy.151dc282a69e", { defaultValue: "Can view" })}</p><div className="flex flex-wrap gap-2">
          {project.accepted ? <Button size="sm" variant="outline" disabled={cloud.busy} onClick={()=>{void cloud.showReview(project);}}>{_copy("copy.aff0766a5290", { defaultValue: "Review" })}</Button> : <Button size="sm" disabled={cloud.busy} onClick={()=>{void cloud.acceptReview(project);}}>{_copy("copy.7e17aadc3039", { defaultValue: "Accept invitation" })}</Button>}
          <Button size="sm" variant="ghost" disabled={cloud.busy} onClick={()=>{void cloud.leaveReview(project);}}>{project.accepted ? _copy("copy.46924c1f6e5a", { defaultValue: "Leave review" }) : _copy("copy.2ce06dafd875", { defaultValue: "Decline invitation" })}</Button>
        </div></div>)}{!matchingShared.length && cloud.available && !cloud.busy && !cloud.error && <p className="text-sm text-white/50">{_copy("copy.3c991eb96538", { defaultValue: "No shared projects." })}</p>}</div> : cloud.selected ? <div className="space-y-2">{cloud.history.map(version => <div key={version.revision} className="rounded-lg border border-white/10 p-3">
        <p className="text-sm">{_copy("copy.92b2c95e99f0", { defaultValue: "Version " })}{version.revision} · {new Date(version.savedAt).toLocaleString()}</p>
        <p className="mb-2 truncate text-xs text-white/60">{version.title}</p>
        <div className="flex gap-2"><Button size="sm" variant="outline" disabled={cloud.busy} onClick={() => { void cloud.open(version.projectId, version.revision); }}>{_copy("copy.2c6d8d9c7563", { defaultValue: "Open copy" })}</Button>
          <Button size="sm" variant="outline" disabled={cloud.busy || version.revision === cloud.selected?.revision} onClick={() => { void cloud.restore(version.revision); }}>{_copy("copy.0323dd89503c", { defaultValue: "Restore as new version" })}</Button></div>
      </div>)}</div> : <div className="space-y-2">{matching.map(project => <div key={project.projectId} className="flex items-center gap-2 rounded-lg border border-white/10 p-3">
        <button className="min-w-0 flex-1 text-left" disabled={cloud.busy || cloud.viewTrash} onClick={() => { void cloud.open(project.projectId); }}><span className="block truncate text-sm">{project.title || _copy("copy.f59ab8d1331b", { defaultValue: "Untitled" })}</span>
          <span className="text-xs text-white/50">{_copy("copy.92b2c95e99f0", { defaultValue: "Version " })}{project.revision} · {new Date(project.savedAt).toLocaleDateString()}</span></button>
        {!cloud.viewTrash && <Button variant="ghost" size="icon" disabled={cloud.busy} aria-label={_copy("copy.20a4d6a49b66", { defaultValue: "History for {{value1}}", value1: project.title })} onClick={() => { void cloud.showHistory(project); }}><History className="h-4 w-4" /></Button>}
        {!cloud.viewTrash && <Button variant="ghost" size="icon" disabled={cloud.busy} aria-label={_copy("copy.530630818e62", { defaultValue: "Review and share {{value1}}", value1: project.title })} onClick={()=>{void cloud.showReview({...project,ownerWallet:walletAddress?.toLowerCase() || "",role:"owner"});}}><MessageSquare className="h-4 w-4" /></Button>}
        <Button variant="ghost" size={cloud.viewTrash ? "sm" : "icon"} disabled={cloud.busy} aria-label={`${cloud.viewTrash ? _copy("copy.a76e13b98392", { defaultValue: "Restore" }) : _copy("copy.9adcdf33dce1", { defaultValue: "Move to Trash" })}: ${project.title}`} onClick={() => { void cloud.setTrash(project, !cloud.viewTrash); }}>
          {cloud.viewTrash ? <><RotateCcw className="mr-2 h-4 w-4" />{_copy("copy.a76e13b98392", { defaultValue: "Restore" })}</> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>)}{!matching.length && cloud.available && !cloud.busy && !cloud.error && <p className="text-sm text-white/50">{query.trim() ? _copy("copy.51c342463863", { defaultValue: "No matching projects." }) : cloud.viewTrash ? _copy("copy.4ff140671613", { defaultValue: "Trash is empty." }) : _copy("copy.a38437e1b1a4", { defaultValue: "No cloud projects yet." })}</p>}</div>}</>}
    </DialogContent>
  </Dialog>;
}
