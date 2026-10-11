import { useEffect,useRef,useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Dialog,DialogContent,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getFollowList } from '@/lib/api/dehub/social';
import { inviteCommunityFollowers } from '@/lib/community-invites';
import type { InviteOutcome } from '@/lib/community-invites-core';
import { dehubLinkFor } from '@/lib/dehub-links';

export function InviteFollowers({open,onOpenChange,communityId,slug,wallet}:{open:boolean;onOpenChange:(open:boolean)=>void;communityId:string;slug:string;wallet:string}) {
  const {t}=useTranslation();
  const [page,setPage]=useState(1);
  const [selected,setSelected]=useState<string[]>([]);
  const [results,setResults]=useState<Record<string,InviteOutcome>>({});
  const [busy,setBusy]=useState(false);
  const [failed,setFailed]=useState(false);
  const active=useRef(false);
  const running=useRef(false);
  useEffect(()=>{active.current=open;return()=>{active.current=false;};},[open,wallet,communityId]);
  useEffect(()=>{setSelected([]);setResults({});setFailed(false);},[page,wallet,communityId,open]);
  const followers=useQuery({queryKey:['community-invite-followers',wallet,page],enabled:open,
    queryFn:()=>getFollowList(wallet,'followers',{page,limit:50,sortBy:'createdAt',sortOrder:'asc'})});
  const rows=(followers.data?.items??[]).filter(row=>row.address&&row.address.toLowerCase()!==wallet.toLowerCase());
  const send=async()=>{
    if(running.current||!selected.length)return;
    running.current=true;setBusy(true);setFailed(false);
    try { const outcome=await inviteCommunityFollowers(communityId,wallet,dehubLinkFor.community(slug),selected,()=>active.current);
      setResults(outcome);setSelected(selected.filter(address=>outcome[address.toLowerCase()]==='failed'));
    } catch {setFailed(true);} finally {running.current=false;setBusy(false);}
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-md">
    <DialogHeader><DialogTitle>{t('communities.followerInvites.title')}</DialogTitle></DialogHeader>
    <p className="text-sm text-muted-foreground">{t('communities.followerInvites.detail')}</p>
    <p className="text-xs break-all">{dehubLinkFor.community(slug)}</p>
    <div className="flex gap-2"><Button variant="outline" disabled={busy||followers.isFetching} onClick={()=>setSelected(rows.map(row=>row.address!.toLowerCase()))}>{t('communities.followerInvites.selectAll')}</Button><Button variant="ghost" disabled={busy} onClick={()=>setSelected([])}>{t('communities.followerInvites.clear')}</Button></div>
    <div className="max-h-72 overflow-y-auto space-y-1">
      {followers.isLoading?<p>{t('common.loading')}</p>:followers.isError?<Button onClick={()=>followers.refetch()}>{t('common.retry')}</Button>:rows.length===0?<p>{t('communities.followerInvites.empty')}</p>:rows.map(row=>{
        const address=row.address!.toLowerCase();
        return <label key={address} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30"><input type="checkbox" checked={selected.includes(address)} disabled={busy} onChange={event=>setSelected(value=>event.target.checked?[...value,address]:value.filter(item=>item!==address))}/><span className="truncate">{row.displayName||row.username||address}</span></label>;
      })}
    </div>
    {!!Object.keys(results).length&&<p role="status" className="text-sm">{t('communities.followerInvites.summary',Object.fromEntries(['sent','skipped','review','failed'].map(status=>[status,Object.values(results).filter(value=>value===status).length])))}</p>}
    {failed&&<p role="alert">{t('communities.followerInvites.error')}</p>}
    <div className="flex gap-2"><Button variant="ghost" disabled={busy||page===1} onClick={()=>setPage(value=>value-1)}>{t('communities.followerInvites.previous')}</Button><Button variant="ghost" disabled={busy||followers.isFetching||!followers.data?.pagination?.hasMore} onClick={()=>setPage(value=>value+1)}>{t('communities.followerInvites.next')}</Button></div>
    <Button disabled={busy||!selected.length||followers.isFetching} onClick={send}>{busy?t('communities.followerInvites.sending'):t('communities.followerInvites.send',{count:selected.length})}</Button>
  </DialogContent></Dialog>;
}
