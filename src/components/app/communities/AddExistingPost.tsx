import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { addCommunityPost } from '@/lib/community-posts';

export function AddExistingPost({ communityId, wallet }: { communityId:string; wallet:string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [input,setInput] = useState('');
  const [busy,setBusy] = useState(false);
  return <form className="mb-4 space-y-2" onSubmit={async e => {
    e.preventDefault();
    if (busy || !input.trim()) return;
    setBusy(true);
    try {
      await addCommunityPost(communityId,wallet,input);
      setInput('');
      await qc.invalidateQueries({queryKey:['community-feed']});
      toast.success(t('communities.existingPost.added'));
    } catch (error) {
      const key=error instanceof Error && ['invalidLink','unavailable','signIn'].includes(error.message) ? error.message : 'failed';
      toast.error(t(`communities.existingPost.${key}`));
    }
    finally { setBusy(false); }
  }}>
    <label className="block text-sm font-medium text-white" htmlFor={`community-post-${communityId}`}>{t('communities.existingPost.add')}</label>
    <p className="text-xs text-zinc-400">{t('communities.existingPost.hint')}</p>
    <div className="flex gap-2">
      <input id={`community-post-${communityId}`} value={input} onChange={e=>setInput(e.target.value)}
        placeholder={t('communities.existingPost.placeholder')} disabled={busy}
        className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white" />
      <button type="submit" disabled={busy || !input.trim()} className="rounded-xl border border-white/20 px-3 py-2 text-sm text-white disabled:opacity-50">
        {busy ? t('communities.existingPost.adding') : t('communities.existingPost.add')}
      </button>
    </div>
  </form>;
}
