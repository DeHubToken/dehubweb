import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { agentTaskRequest } from '@/lib/agent-tasks';

export interface AgentLife {
  sentient: boolean;
  has_persona: boolean;
  status: string | null;
  next_at: string | null;
  home: string | null;
  timezone: string | null;
  daily?: { posts: number; target: number };
  events: { id?: number; kind: string; content: string | null; target: string | null; post_id?: string | null; unliked?: boolean; edited?: boolean; created_at: string }[];
}

const clock = (iso: string, timeZone?: string | null) => {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }); }
  catch { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
};

/** The "Alive" switch: the agent keeps its own day and acts on its own. */
export function AgentLifePanel({ wallet, agentId }: { wallet: string; agentId: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const key = ['agent-life', wallet, agentId];
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [composing, setComposing] = useState(false);
  const [post, setPost] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const publish = useMutation({
    mutationFn: () => agentTaskRequest(wallet, { operation: 'queue_post', agent_id: agentId, content: post.trim(), image_url: imageUrl.trim() || undefined, request_id: requestId }),
    onSuccess: () => { setPost(''); setImageUrl(''); setRequestId(crypto.randomUUID()); client.invalidateQueries({ queryKey: ['agent-tasks', wallet] }); },
  });
  const life = useQuery({ queryKey: key, staleTime: 60000,
    queryFn: () => agentTaskRequest<AgentLife>(wallet, { operation: 'life', agent_id: agentId }) });
  const toggle = useMutation({
    mutationFn: (alive: boolean) => agentTaskRequest<AgentLife>(wallet, { operation: 'set_alive', agent_id: agentId, alive }),
    onSuccess: data => client.setQueryData(key, data),
  });
  const data = life.data;
  const correction = useMutation({
    mutationFn: (change: { event_id: number; action: 'unlike' | 'edit_comment'; content?: string }) =>
      agentTaskRequest<AgentLife>(wallet, { operation: 'correct_activity', agent_id: agentId, ...change }),
    onSuccess: result => { client.setQueryData(key, result); setEditing(null); },
  });
  const alive = toggle.isPending ? !!toggle.variables : !!data?.sentient;
  const state = data?.sentient && data.home
    ? t(data.status === 'asleep' ? 'agents.life.asleep' : 'agents.life.awake', { home: data.home })
    : null;
  return <section className="mb-4 space-y-2 rounded-xl border border-white/10 p-3" aria-labelledby={`life-${agentId}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 id={`life-${agentId}`} className="font-medium">{t('agents.life.title')}</h3>
        <p className="text-xs text-white/60">{t('agents.life.help')}</p>
      </div>
      <Switch checked={alive} disabled={life.isLoading || toggle.isPending} aria-labelledby={`life-${agentId}`}
        onCheckedChange={value => toggle.mutate(value)} />
    </div>
    {toggle.isPending && toggle.variables && !data?.has_persona && <p role="status" className="text-sm">{t('agents.life.starting')}</p>}
    {toggle.error && <p role="alert" className="text-sm break-words">{toggle.error.message}</p>}
    {state && <p className="text-sm">{state}{data?.next_at && ` · ${t('agents.life.next', { time: clock(data.next_at) })}`}</p>}
    {data?.sentient && data.daily && <p className="text-sm">{t('agents.life.daily', { defaultValue: 'Posts today: {{posts}} · Daily target: {{target}}', ...data.daily })}</p>}
    <button className="text-sm underline" onClick={() => setComposing(!composing)}>{t('agents.life.compose', { defaultValue: 'Post as this agent' })}</button>
    {composing && <form className="space-y-2" onSubmit={e => { e.preventDefault(); publish.mutate(); }}>
      <textarea aria-label={t('agents.life.postText', { defaultValue: 'Post text' })} maxLength={500} value={post} disabled={publish.isPending}
        onChange={e => { setPost(e.target.value); setRequestId(crypto.randomUUID()); publish.reset(); }} className="w-full min-h-24 rounded-xl border border-white/20 bg-white/5 p-3 text-inherit backdrop-blur-xl" />
      <input type="url" aria-label={t('agents.life.imageUrl', { defaultValue: 'Image URL (optional)' })} placeholder={t('agents.life.imageUrl', { defaultValue: 'Image URL (optional)' })} value={imageUrl} disabled={publish.isPending}
        onChange={e => { setImageUrl(e.target.value); setRequestId(crypto.randomUUID()); publish.reset(); }} className="w-full rounded-xl border border-white/20 bg-white/5 p-3 text-inherit backdrop-blur-xl" />
      <p className="text-xs text-white/60">{t('agents.life.queueHelp', { defaultValue: 'Publishes your exact text. Shared 20-minute post gap applies. No minting.' })}</p>
      <button type="submit" disabled={publish.isPending || !post.trim()}>{t('agents.life.queuePost', { defaultValue: 'Queue post' })}</button>
      {publish.error && <p role="alert">{publish.error.message}</p>}
      {publish.isSuccess && <p role="status">{t('agents.life.postQueued', { defaultValue: 'Post queued. Track it in Tasks above.' })}</p>}
    </form>}
    {correction.error && <p role="alert" className="text-sm">{correction.error.message}</p>}
    {data && (data.sentient || data.events.length > 0) && <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-white/50">{t('agents.life.recent')}</p>
      {data.events.length === 0 && <p className="text-sm text-white/60">{t('agents.life.empty')}</p>}
      <ul className="space-y-1">
        {data.events.slice(0, expanded ? 100 : 6).map(event => <li key={`${event.kind}-${event.created_at}`} className="text-sm break-words space-y-1">
          <span className="text-white/60">{clock(event.created_at)} · {t(`agents.life.kind.${event.kind}`, { defaultValue: event.kind })}</span>
          {event.content && event.kind !== 'error' && <> {event.kind === 'post' && event.target
            ? <Link to={`/app/post/${event.target}`} className="hover:underline">{event.content}</Link>
            : event.content}</>}
          {event.post_id && event.kind !== 'post' && <Link className="ml-2 underline" to={`/app/post/${event.post_id}`}>{t('agents.life.viewPost', { defaultValue: 'View post' })}</Link>}
          {event.id && event.kind === 'like' && <button className="ml-2 underline disabled:opacity-50" disabled={correction.isPending || event.unliked}
            onClick={() => correction.mutate({ event_id: event.id!, action: 'unlike' })}>
            {t(event.unliked ? 'agents.life.unliked' : 'agents.life.unlike', { defaultValue: event.unliked ? 'Unliked' : 'Unlike' })}</button>}
          {event.id && ['comment', 'reply'].includes(event.kind) && event.content && editing !== event.id && <button className="ml-2 underline" disabled={correction.isPending}
            onClick={() => { correction.reset(); setEditing(event.id!); setDraft(event.content!); }}>{t('agents.life.editComment', { defaultValue: 'Edit comment' })}</button>}
          {editing === event.id && <form onSubmit={e => { e.preventDefault(); correction.mutate({ event_id: event.id!, action: 'edit_comment', content: draft.trim() }); }} className="space-y-2">
            <textarea aria-label={t('agents.life.editComment', { defaultValue: 'Edit comment' })} value={draft} onChange={e => setDraft(e.target.value)} maxLength={500} disabled={correction.isPending}
              className="w-full rounded-xl border border-white/20 bg-white/5 p-3 text-inherit backdrop-blur-xl" />
            <div className="flex gap-4"><button type="submit" disabled={correction.isPending || !draft.trim()}>{t('common.save', { defaultValue: 'Save' })}</button>
              <button type="button" disabled={correction.isPending} onClick={() => setEditing(null)}>{t('common.cancel', { defaultValue: 'Cancel' })}</button></div>
          </form>}
        </li>)}
      </ul>
      {data.events.length > 6 && <button className="text-sm underline" onClick={() => setExpanded(!expanded)}>{t(expanded ? 'agents.life.less' : 'agents.life.more', { defaultValue: expanded ? 'Show less' : 'Show more activity' })}</button>}
    </div>}
  </section>;
}
