import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { agentTaskRequest } from '@/lib/agent-tasks';
import { getMediaUrl } from '@/lib/api/dehub/core';

type Profile = { display_name?: string; bio?: string; avatar?: string; banner?: string };
const picture = (value?: string) => value && !value.startsWith('default-') ? getMediaUrl(value) : undefined;

function ImageField({ label, current, file, onChange }: { label: string; current?: string; file?: File; onChange: (file?: File) => void }) {
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    if (!file) { setPreview(undefined); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const source = preview || picture(current);
  return <label className="block space-y-2 text-sm">
    <span>{label}</span>
    {source && <img src={source} alt={label} className="h-24 max-w-full rounded-xl object-cover" />}
    <Input type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label={label} data-theme-control-surface
      onChange={event => onChange(event.target.files?.[0])} className="bg-transparent text-white file:mr-3 file:cursor-pointer" />
  </label>;
}

function ProfileForm({ wallet, agentId, profile, onClose }: { wallet: string; agentId: string; profile: Profile; onClose: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [name, setName] = useState(profile.display_name || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [avatar, setAvatar] = useState<File>();
  const [banner, setBanner] = useState<File>();
  const save = useMutation({ mutationFn: async () => {
    if ([avatar, banner].some(file => file && (file.size > 5 * 1024 * 1024 || !['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)))) throw new Error(t('agents.profile.imageHelp'));
    const form = new FormData(); form.append('operation', 'update_profile'); form.append('agent_id', agentId);
    if (name.trim() !== (profile.display_name || '')) form.append('display_name', name.trim());
    if (bio !== (profile.bio || '')) form.append('bio', bio);
    if (avatar) form.append('avatar', avatar);
    if (banner) form.append('banner', banner);
    return agentTaskRequest(wallet, form);
  }, onSuccess: async () => {
    setAvatar(undefined); setBanner(undefined);
    await client.invalidateQueries({ queryKey: ['agent-profile', wallet, agentId] });
    client.invalidateQueries({ queryKey: ['ai-agents', wallet] });
  } });
  const dirty = name.trim() !== (profile.display_name || '') || bio !== (profile.bio || '') || !!avatar || !!banner;
  return <form onSubmit={event => { event.preventDefault(); save.mutate(); }} className="space-y-3 pt-3">
    <fieldset disabled={save.isPending} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <ImageField label={t('agents.profile.avatar')} current={profile.avatar} file={avatar} onChange={file => { setAvatar(file); save.reset(); }} />
        <ImageField label={t('agents.profile.banner')} current={profile.banner} file={banner} onChange={file => { setBanner(file); save.reset(); }} />
      </div>
      <p className="text-xs text-white/60">{t('agents.profile.imageHelp')}</p>
      <label className="block space-y-1 text-sm"><span>{t('settings.displayName')}</span><Input value={name} maxLength={100} onChange={event => { setName(event.target.value); save.reset(); }} data-theme-control-surface className="bg-transparent text-white" /></label>
      <label className="block space-y-1 text-sm"><span>{t('settings.bio')}</span><Textarea value={bio} maxLength={2000} onChange={event => { setBio(event.target.value); save.reset(); }} data-theme-control-surface className="min-h-24 bg-transparent text-white" /></label>
      <div className="flex gap-2"><Button type="submit" disabled={!dirty || (name !== (profile.display_name || '') && !name.trim()) || save.isPending}>{save.isPending ? t('settings.saving') : t('common.save')}</Button><Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button></div>
    </fieldset>
    {save.error && <p role="alert" className="text-sm break-words">{save.error.message}</p>}
    {save.isSuccess && <p role="status" className="text-sm">{t('agents.profile.saved')}</p>}
  </form>;
}

export function AgentProfilePanel({ wallet, agentId }: { wallet: string; agentId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const profile = useQuery({ queryKey: ['agent-profile', wallet, agentId], staleTime: 60000,
    queryFn: () => agentTaskRequest<{ profile: Profile }>(wallet, { operation: 'profile', agent_id: agentId }) });
  const data = profile.data?.profile;
  return <div className="mb-4 space-y-2">
    {!open && picture(data?.banner) && <img src={picture(data?.banner)} alt={t('agents.profile.banner')} className="aspect-[3/1] w-full rounded-xl object-cover" />}
    {!open && picture(data?.avatar) && <img src={picture(data?.avatar)} alt={t('agents.profile.avatar')} className="h-16 w-16 rounded-full object-cover" />}
    {data?.display_name && <p className="font-medium">{data.display_name}</p>}
    <Button type="button" variant="outline" aria-expanded={open} onClick={() => setOpen(value => !value)}>{t('agents.profile.edit')}</Button>
    {open && profile.isLoading && <p>{t('common.loading')}</p>}
    {open && profile.error && <div role="alert"><p>{profile.error.message}</p><Button onClick={() => profile.refetch()}>{t('common.retry')}</Button></div>}
    {open && data && <ProfileForm wallet={wallet} agentId={agentId} profile={data} onClose={() => setOpen(false)} />}
  </div>;
}
