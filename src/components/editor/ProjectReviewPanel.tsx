import { useTranslation as _useCopy } from 'react-i18next';
import { useDraftState } from '@/hooks/use-draft-state';
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { useCloudProjects } from "@/lib/editor/useCloudProjects";
import { projectReviewIsErased, projectReviewTime, type ProjectReviewComment, type ProjectReviewRole } from "@/lib/editor/cloudProjectReview";

export function ProjectReviewPanel({ cloud, wallet, onOpenCopy, onEditShared }: { cloud: ReturnType<typeof useCloudProjects>; wallet: string; onOpenCopy(revision?: number, seconds?: number): void; onEditShared(): void }) {
  const { t: _copy } = _useCopy();
  const {t}=useTranslation(), review=cloud.review;
  const scope = review ? `review:${review.ownerWallet}:${review.projectId}:${review.revision}` : null;
  const [reply,setReply]=useDraftState<ProjectReviewComment|null>(scope ? `${scope}:reply` : null,null);
  const [body,setBody]=useDraftState(scope ? `${scope}:${reply?.id ?? 'root'}:body` : null,"");
  const [time,setTime]=useDraftState(scope ? `${scope}:time` : null,"0");
  const [assignee,setAssignee]=useDraftState(scope ? `${scope}:assignee` : null,"");
  const [recipient,setRecipient]=useDraftState(scope ? `${scope}:recipient` : null,"");
  const [role,setRole]=useState<ProjectReviewRole>("commenter");
  if (!review) return null;
  const owner=review.ownerWallet===wallet, canComment=review.role!=="viewer", roots=cloud.comments.filter(comment=>!comment.parentId);
  const short=(value:string)=>`${value.slice(0,6)}…${value.slice(-4)}`;
  const pending=cloud.busy || !cloud.available;
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-medium">{_copy("copy.fdbeef90498f", { defaultValue: "Project review · " })}{review.title || _copy("copy.f59ab8d1331b", { defaultValue: "Untitled" })}</h3><p className="text-xs text-white/50">{_copy("copy.92b2c95e99f0", { defaultValue: "Version " })}{review.revision} · {owner ? _copy("copy.4b1b8aa3608a", { defaultValue: "Owner" }) : review.role==="editor" ? _copy("copy.5abe9e1fbc5b", { defaultValue: "Can edit" }) : canComment ? _copy("copy.737c1a43331e", { defaultValue: "Can comment" }) : _copy("copy.151dc282a69e", { defaultValue: "Can view" })}</p></div>
      <Button size="icon" variant="ghost" disabled={pending} aria-label={_copy("copy.5e33618463e5", { defaultValue: "Refresh project review" })} onClick={()=>{void cloud.refreshReview();}}><RefreshCw className="h-4 w-4" /></Button></div>
    <div className="flex flex-wrap gap-2">{(owner || review.role==="editor") && <Button size="sm" disabled={pending} onClick={onEditShared}>{_copy("copy.968694668387", { defaultValue: "Edit shared project" })}</Button>}<Button size="sm" variant="outline" disabled={pending} onClick={()=>onOpenCopy()}>{_copy("copy.a4bc97e503dd", { defaultValue: "Open review copy" })}</Button><Button size="sm" variant="ghost" disabled={pending} onClick={cloud.clearReview}>{_copy("copy.76900f1bfd16", { defaultValue: "Back" })}</Button></div>
    <p className="text-xs text-white/50">{_copy("copy.e8db090dcfad", { defaultValue: "A review opens a separate local copy of the saved version. Your current project is saved first." })}</p>
    {owner && <div className="space-y-2 rounded-lg border border-white/10 p-3">
      <h4 className="flex items-center gap-2 text-sm"><Users className="h-4 w-4" />{_copy("copy.5ddb6f051115", { defaultValue: "Review access" })}</h4>
      <p className="text-xs text-white/50">{_copy("copy.6a3e4479b405", { defaultValue: "Invited people can download project sources after accepting. Editors can save changes to this project. Revoke access here." })}</p>
      <Input value={recipient} onChange={event=>setRecipient(event.target.value)} aria-label={_copy("copy.908024dce6b0", { defaultValue: "Reviewer wallet address" })} placeholder={_copy("copy.c363ff62914c", { defaultValue: "DeHub wallet address · 0x…" })} disabled={pending} className="border-white/15 bg-white/5 text-white placeholder:text-white/50" />
      <div className="flex gap-2"><Button size="sm" variant={role==="viewer" ? "secondary" : "outline"} aria-pressed={role==="viewer"} disabled={pending} onClick={()=>setRole("viewer")}>{_copy("copy.151dc282a69e", { defaultValue: "Can view" })}</Button><Button size="sm" variant={role==="commenter" ? "secondary" : "outline"} aria-pressed={role==="commenter"} disabled={pending} onClick={()=>setRole("commenter")}>{_copy("copy.737c1a43331e", { defaultValue: "Can comment" })}</Button>
        <Button size="sm" variant={role==="editor" ? "secondary" : "outline"} aria-pressed={role==="editor"} disabled={pending} onClick={()=>setRole("editor")}>{_copy("copy.5abe9e1fbc5b", { defaultValue: "Can edit" })}</Button>
        <Button size="sm" disabled={pending || !recipient.trim()} onClick={()=>{void cloud.shareReview(recipient,role,()=>setRecipient.complete(recipient,""));}}>{_copy("copy.1fd9ae1607aa", { defaultValue: "Invite" })}</Button></div>
      {cloud.members.filter(member=>!member.revoked).map(member=><div key={member.memberWallet} className="flex items-center justify-between gap-2 text-xs"><span className="min-w-0 truncate" title={member.memberWallet}>{short(member.memberWallet)} · {member.role==="editor" ? _copy("copy.5abe9e1fbc5b", { defaultValue: "Can edit" }) : member.role==="commenter" ? _copy("copy.737c1a43331e", { defaultValue: "Can comment" }) : _copy("copy.151dc282a69e", { defaultValue: "Can view" })} · {member.accepted ? _copy("copy.a00fb0c50741", { defaultValue: "Accepted" }) : _copy("copy.331551b0de41", { defaultValue: "Pending" })}</span><Button size="sm" variant="ghost" disabled={pending} aria-label={_copy("copy.88bb4da02044", { defaultValue: "Revoke {{value1}}", value1: member.memberWallet })} onClick={()=>{void cloud.shareReview(member.memberWallet,"none");}}>{_copy("copy.87e6d00bbf53", { defaultValue: "Revoke" })}</Button></div>)}
    </div>}
    <h4 className="flex items-center gap-2 text-sm"><MessageSquare className="h-4 w-4" />{_copy("copy.355f79f29d7d", { defaultValue: "Comments" })}</h4>
    {!roots.length && <p className="text-sm text-white/50">{_copy("copy.aca4871a8444", { defaultValue: "No feedback yet." })}</p>}
    {roots.map(comment=><div key={comment.id} className={`space-y-2 rounded-lg border border-white/10 p-3 ${comment.resolved ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-2"><button className="text-xs underline underline-offset-4" disabled={pending} onClick={()=>onOpenCopy(comment.revision,comment.atSeconds)} aria-label={_copy("copy.78d4a6075ea1", { defaultValue: "Open version {{value1}} at {{value2}}", value1: comment.revision, value2: projectReviewTime(comment.atSeconds) })}>v{comment.revision} · {projectReviewTime(comment.atSeconds)}</button><span className="text-xs text-white/50" title={projectReviewIsErased(comment) ? undefined : comment.authorWallet}>{projectReviewIsErased(comment) ? t("stats.feedback.anonymous") : short(comment.authorWallet)}{comment.resolved ? _copy("copy.7991c1885371", { defaultValue: " · Resolved" }) : ""}</span></div>
      <p className="whitespace-pre-wrap break-words text-sm">{projectReviewIsErased(comment) ? t("profile.replyThread.commentUnavailable") : comment.body}</p>
      {comment.assigneeWallet && <p className="text-xs text-white/50" title={comment.assigneeWallet}>{_copy("copy.90b64ea6658a", { defaultValue: "Assigned to " })}{short(comment.assigneeWallet)}</p>}
      {cloud.comments.filter(child=>child.parentId===comment.id).map(child=><div key={child.id} className="border-l border-white/20 pl-3"><p className="text-xs text-white/50" title={projectReviewIsErased(child) ? undefined : child.authorWallet}>{projectReviewIsErased(child) ? t("stats.feedback.anonymous") : short(child.authorWallet)}</p><p className="whitespace-pre-wrap break-words text-sm">{projectReviewIsErased(child) ? t("profile.replyThread.commentUnavailable") : child.body}</p></div>)}
      {canComment && <div className="flex gap-2"><Button size="sm" variant="ghost" disabled={pending} onClick={()=>setReply(comment)}>{_copy("copy.c253f451bdd5", { defaultValue: "Reply" })}</Button>{(owner || comment.authorWallet===wallet || comment.assigneeWallet===wallet) && <Button size="sm" variant="ghost" disabled={pending} onClick={()=>{void cloud.resolveReviewComment(comment);}}>{comment.resolved ? _copy("copy.a886d1dc4f12", { defaultValue: "Reopen" }) : _copy("copy.c8f193b315c8", { defaultValue: "Resolve" })}</Button>}</div>}
    </div>)}
    {canComment && <div className="space-y-2 rounded-lg border border-white/10 p-3">
      {reply && <div className="flex items-center justify-between text-xs"><span>{_copy("copy.1c97ca603b05", { defaultValue: "Reply · v" })}{reply.revision} · {projectReviewTime(reply.atSeconds)}</span><Button size="sm" variant="ghost" disabled={pending} onClick={()=>setReply.complete(reply, null)}>{_copy("copy.2355f7315019", { defaultValue: "Cancel reply" })}</Button></div>}
      <label className="block text-xs text-white/60">{_copy("copy.ae02dada7574", { defaultValue: "Time in seconds" })}<Input type="number" min="0" max="86400" step="0.001" value={reply ? String(reply.atSeconds) : time} onChange={event=>setTime(event.target.value)} disabled={pending || !!reply} aria-label={_copy("copy.29f985a6c491", { defaultValue: "Comment time in seconds" })} className="mt-1 border-white/15 bg-white/5 text-white" /></label>
      <Textarea value={body} onChange={event=>setBody(event.target.value)} disabled={pending} aria-label={_copy("copy.9aae765e8261", { defaultValue: "Project review comment" })} placeholder={_copy("copy.65d7dfa47619", { defaultValue: "Feedback on this saved frame…" })} className="border-white/15 bg-white/5 text-white placeholder:text-white/50" />
      {!reply && <Input value={assignee} onChange={event=>setAssignee(event.target.value)} disabled={pending} aria-label={_copy("copy.ba5cb1cce0d4", { defaultValue: "Assign comment to wallet, optional" })} placeholder={_copy("copy.ab60ba3815e3", { defaultValue: "Assign to wallet · optional" })} className="border-white/15 bg-white/5 text-white placeholder:text-white/50" />}
      <Button size="sm" disabled={pending || !body.trim() || (!reply && !time.trim())} onClick={()=>{void cloud.addReviewComment({body,revision:reply?.revision ?? review.revision,atSeconds:reply?.atSeconds ?? Number(time),clipId:reply?.clipId,parentId:reply?.id,assigneeWallet:reply ? null : assignee || null},()=>{if(setBody.complete(body,"")){setReply.complete(reply, null);setAssignee.complete(assignee,"");}});}}>{_copy("copy.badd6941df17", { defaultValue: "Send comment" })}</Button>
    </div>}
  </div>;
}
