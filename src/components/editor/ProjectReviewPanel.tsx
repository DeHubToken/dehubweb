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
    <div className="flex items-center justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-medium">Project review · {review.title || "Untitled"}</h3><p className="text-xs text-white/50">Version {review.revision} · {owner ? "Owner" : review.role==="editor" ? "Can edit" : canComment ? "Can comment" : "Can view"}</p></div>
      <Button size="icon" variant="ghost" disabled={pending} aria-label="Refresh project review" onClick={()=>{void cloud.refreshReview();}}><RefreshCw className="h-4 w-4" /></Button></div>
    <div className="flex flex-wrap gap-2">{(owner || review.role==="editor") && <Button size="sm" disabled={pending} onClick={onEditShared}>Edit shared project</Button>}<Button size="sm" variant="outline" disabled={pending} onClick={()=>onOpenCopy()}>Open review copy</Button><Button size="sm" variant="ghost" disabled={pending} onClick={cloud.clearReview}>Back</Button></div>
    <p className="text-xs text-white/50">A review opens a separate local copy of the saved version. Your current project is saved first.</p>
    {owner && <div className="space-y-2 rounded-lg border border-white/10 p-3">
      <h4 className="flex items-center gap-2 text-sm"><Users className="h-4 w-4" />Review access</h4>
      <p className="text-xs text-white/50">Invited people can download project sources after accepting. Editors can save changes to this project. Revoke access here.</p>
      <Input value={recipient} onChange={event=>setRecipient(event.target.value)} aria-label="Reviewer wallet address" placeholder="DeHub wallet address · 0x…" disabled={pending} className="border-white/15 bg-white/5 text-white placeholder:text-white/50" />
      <div className="flex gap-2"><Button size="sm" variant={role==="viewer" ? "secondary" : "outline"} aria-pressed={role==="viewer"} disabled={pending} onClick={()=>setRole("viewer")}>Can view</Button><Button size="sm" variant={role==="commenter" ? "secondary" : "outline"} aria-pressed={role==="commenter"} disabled={pending} onClick={()=>setRole("commenter")}>Can comment</Button>
        <Button size="sm" variant={role==="editor" ? "secondary" : "outline"} aria-pressed={role==="editor"} disabled={pending} onClick={()=>setRole("editor")}>Can edit</Button>
        <Button size="sm" disabled={pending || !recipient.trim()} onClick={()=>{void cloud.shareReview(recipient,role,()=>setRecipient.complete(recipient,""));}}>Invite</Button></div>
      {cloud.members.filter(member=>!member.revoked).map(member=><div key={member.memberWallet} className="flex items-center justify-between gap-2 text-xs"><span className="min-w-0 truncate" title={member.memberWallet}>{short(member.memberWallet)} · {member.role==="editor" ? "Can edit" : member.role==="commenter" ? "Can comment" : "Can view"} · {member.accepted ? "Accepted" : "Pending"}</span><Button size="sm" variant="ghost" disabled={pending} aria-label={`Revoke ${member.memberWallet}`} onClick={()=>{void cloud.shareReview(member.memberWallet,"none");}}>Revoke</Button></div>)}
    </div>}
    <h4 className="flex items-center gap-2 text-sm"><MessageSquare className="h-4 w-4" />Comments</h4>
    {!roots.length && <p className="text-sm text-white/50">No feedback yet.</p>}
    {roots.map(comment=><div key={comment.id} className={`space-y-2 rounded-lg border border-white/10 p-3 ${comment.resolved ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-2"><button className="text-xs underline underline-offset-4" disabled={pending} onClick={()=>onOpenCopy(comment.revision,comment.atSeconds)} aria-label={`Open version ${comment.revision} at ${projectReviewTime(comment.atSeconds)}`}>v{comment.revision} · {projectReviewTime(comment.atSeconds)}</button><span className="text-xs text-white/50" title={projectReviewIsErased(comment) ? undefined : comment.authorWallet}>{projectReviewIsErased(comment) ? t("stats.feedback.anonymous") : short(comment.authorWallet)}{comment.resolved ? " · Resolved" : ""}</span></div>
      <p className="whitespace-pre-wrap break-words text-sm">{projectReviewIsErased(comment) ? t("profile.replyThread.commentUnavailable") : comment.body}</p>
      {comment.assigneeWallet && <p className="text-xs text-white/50" title={comment.assigneeWallet}>Assigned to {short(comment.assigneeWallet)}</p>}
      {cloud.comments.filter(child=>child.parentId===comment.id).map(child=><div key={child.id} className="border-l border-white/20 pl-3"><p className="text-xs text-white/50" title={projectReviewIsErased(child) ? undefined : child.authorWallet}>{projectReviewIsErased(child) ? t("stats.feedback.anonymous") : short(child.authorWallet)}</p><p className="whitespace-pre-wrap break-words text-sm">{projectReviewIsErased(child) ? t("profile.replyThread.commentUnavailable") : child.body}</p></div>)}
      {canComment && <div className="flex gap-2"><Button size="sm" variant="ghost" disabled={pending} onClick={()=>setReply(comment)}>Reply</Button>{(owner || comment.authorWallet===wallet || comment.assigneeWallet===wallet) && <Button size="sm" variant="ghost" disabled={pending} onClick={()=>{void cloud.resolveReviewComment(comment);}}>{comment.resolved ? "Reopen" : "Resolve"}</Button>}</div>}
    </div>)}
    {canComment && <div className="space-y-2 rounded-lg border border-white/10 p-3">
      {reply && <div className="flex items-center justify-between text-xs"><span>Reply · v{reply.revision} · {projectReviewTime(reply.atSeconds)}</span><Button size="sm" variant="ghost" disabled={pending} onClick={()=>setReply.complete(reply, null)}>Cancel reply</Button></div>}
      <label className="block text-xs text-white/60">Time in seconds<Input type="number" min="0" max="86400" step="0.001" value={reply ? String(reply.atSeconds) : time} onChange={event=>setTime(event.target.value)} disabled={pending || !!reply} aria-label="Comment time in seconds" className="mt-1 border-white/15 bg-white/5 text-white" /></label>
      <Textarea value={body} onChange={event=>setBody(event.target.value)} disabled={pending} aria-label="Project review comment" placeholder="Feedback on this saved frame…" className="border-white/15 bg-white/5 text-white placeholder:text-white/50" />
      {!reply && <Input value={assignee} onChange={event=>setAssignee(event.target.value)} disabled={pending} aria-label="Assign comment to wallet, optional" placeholder="Assign to wallet · optional" className="border-white/15 bg-white/5 text-white placeholder:text-white/50" />}
      <Button size="sm" disabled={pending || !body.trim() || (!reply && !time.trim())} onClick={()=>{void cloud.addReviewComment({body,revision:reply?.revision ?? review.revision,atSeconds:reply?.atSeconds ?? Number(time),clipId:reply?.clipId,parentId:reply?.id,assigneeWallet:reply ? null : assignee || null},()=>{if(setBody.complete(body,"")){setReply.complete(reply, null);setAssignee.complete(assignee,"");}});}}>Send comment</Button>
    </div>}
  </div>;
}
