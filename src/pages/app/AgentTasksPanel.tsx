import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { agentTaskRequest, type AgentTask, type AgentTaskAction } from '@/lib/agent-tasks';
import { WINDOW_ACTIONS, WINDOW_PRESETS, windowPrompt, windowRange, type WindowAction, type WindowPreset } from '@/lib/agent-task-window';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

const actionNames: Record<string, string> = { dehub_follow: 'agents.tasks.follow', dehub_vote: 'agents.tasks.reaction', dehub_post_create: 'agents.tasks.post', dehub_comment: 'agents.tasks.comment', dehub_update_profile: 'agents.tasks.profile', dehub_view: 'agents.tasks.window.view' };

function postActionUrl(post?: { token_id?: string | number; url?: string }) {
  const id = String(post?.token_id ?? '');
  return /^\d+$/.test(id) ? `/app/post/${id}` : post?.url;
}

function TaskHistory({ task, wallet }: { task: AgentTask; wallet: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const history = useQuery({ queryKey: ['agent-task-history', wallet, task.id], enabled: open,
    queryFn: () => agentTaskRequest<{ actions: AgentTaskAction[] }>(wallet, { operation: 'history', task_id: task.id }) });
  return <details onToggle={event => setOpen(event.currentTarget.open)} className="text-sm">
    <summary className="cursor-pointer text-white/80 hover:text-white">{t('agents.tasks.activity')}</summary>
    {history.isLoading && <p>{t('agents.tasks.loadingActivity')}</p>}
    {history.error && <p role="alert">{history.error.message}</p>}
    <ul className="mt-2 space-y-2">{history.data?.actions.map(action => <li key={action.id} className="rounded-lg bg-white/5 p-3 break-words">
      <p>{t(actionNames[action.tool] || 'agents.tasks.action')} · {action.status} · {new Date(action.created_at).toLocaleString()}</p>
      {action.target !== 'single' && <p className="text-white/60 break-all">{action.target}</p>}
      {action.result?.content && <p className="whitespace-pre-wrap">{action.result.content}</p>}
      {action.result?.error && <p>{action.result.error}</p>}
      {action.result?.hint && <p>{action.result.hint}</p>}
      {postActionUrl(action.result?.post) && <a className="underline" href={postActionUrl(action.result?.post)} target="_blank" rel="noreferrer">{t('agents.tasks.viewPost')}</a>}
    </li>)}</ul>
    {history.data?.actions.length === 0 && <p className="text-white/60">{t('agents.tasks.emptyActivity')}</p>}
    {(history.data?.actions.length ?? 0) >= 100 && <p>{t('agents.tasks.latestActivity')}</p>}
  </details>;
}

export function AgentTasksPanel({ wallet, agents }: { wallet: string; agents: { id: string; name: string; is_active: boolean }[] }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [prompt, setPrompt] = useSurfaceDraft('agent-task-prompt', '');
  const [chosen, setChosen] = useState('');
  const [swarm, setSwarm] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [windowMode, setWindowMode] = useState(false);
  const [preset, setPreset] = useState<WindowPreset>('last24h');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [windowActions, setWindowActions] = useState<WindowAction[]>(['view']);
  const [replyStyle, setReplyStyle] = useState('');
  const range = windowRange(preset, custom);
  const windowReady = !!range && windowActions.length > 0 && (!windowActions.includes('reply') || !!replyStyle.trim());
  const changed = () => { setRequestId(crypto.randomUUID()); create.reset(); };
  const active = agents.filter(agent => agent.is_active);
  const agentId = active.some(agent => agent.id === chosen) ? chosen : active[0]?.id;
  const swarmIds = active.filter(agent => selected.includes(agent.id)).map(agent => agent.id);
  const tasks = useQuery({ queryKey: ['agent-tasks', wallet],
    queryFn: () => agentTaskRequest<{ tasks: AgentTask[] }>(wallet, { operation: 'list' }) });
  const refresh = () => { client.invalidateQueries({ queryKey: ['agent-tasks', wallet] }); client.invalidateQueries({ queryKey: ['agent-task-history', wallet] }); };
  const create = useMutation({ mutationFn: (text: string) => agentTaskRequest(wallet, { operation: swarm ? 'create_swarm' : 'create',
    ...(swarm ? { agent_ids: swarmIds } : { agent_id: agentId }),
    prompt: text, request_id: requestId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    onSuccess: (_data, text) => { if (text === prompt) setPrompt.complete(prompt, ''); setRequestId(crypto.randomUUID()); refresh(); toast.success(t('agents.tasks.queued')); },
    onError: (error: Error) => toast.error(error.message),
  });
  const control = useMutation({ mutationFn: ({ id, operation }: { id: string; operation: string }) => agentTaskRequest(wallet, { operation, task_id: id }), onSuccess: refresh, onError: (error: Error) => toast.error(error.message) });
  const currentTasks = tasks.data?.tasks.filter(task => !['completed', 'failed', 'cancelled'].includes(task.status)) ?? [];
  const pastTasks = tasks.data?.tasks.filter(task => ['completed', 'failed', 'cancelled'].includes(task.status)) ?? [];
  const renderTask = (task: AgentTask) => <article key={task.id} className="space-y-2 rounded-xl border border-white/15 bg-black/20 p-4">
    <p className="font-medium leading-snug text-white">{task.plan.summary}</p>
    {task.swarm_id && <p className="text-xs font-medium uppercase tracking-wide text-white/65">{t('agents.tasks.swarmMember', { index: (task.swarm_index ?? 0) + 1, total: task.swarm_size })}</p>}
    <p className="text-sm text-white/75">{t('agents.tasks.meta', { agent: agents.find(agent => agent.id === task.agent_id)?.name || 'agent', status: task.status, total: task.completed_actions })}</p>
    {task.message && <p className="text-sm text-white/80">{task.message}</p>}
    {task.status === 'queued' && <p className="text-sm text-white/70">{t('agents.tasks.next', { time: new Date(task.next_run_at).toLocaleString() })}</p>}
    <div className="flex flex-wrap gap-2">{['queued', 'running'].includes(task.status) && <Button size="sm" variant="outline" disabled={control.isPending} onClick={() => control.mutate({ id: task.id, operation: 'pause' })}>{t('agents.tasks.pause')}</Button>}
      {['paused', 'failed'].includes(task.status) && <Button size="sm" variant="outline" disabled={control.isPending} onClick={() => control.mutate({ id: task.id, operation: task.needs_review ? 'skip' : 'resume' })}>{task.needs_review ? t('agents.tasks.skip') : t('agents.tasks.resume')}</Button>}</div>
    <TaskHistory task={task} wallet={wallet} />
  </article>;
  return <section data-kit-section className="space-y-5 rounded-2xl border border-white/20 bg-black/35 p-5 text-white backdrop-blur-xl">
    <div><h2 className="text-lg font-semibold text-white">{t('agents.tasks.title')}</h2><p className="text-sm leading-relaxed text-white/75">{t('agents.tasks.description')}</p></div>
    {active.length ? <>
      {active.length > 1 && <div className="flex flex-wrap gap-2" role="group" aria-label={t('agents.tasks.mode')}>
        <Button type="button" size="sm" variant={!swarm ? 'default' : 'outline'} onClick={() => { setSwarm(false); setRequestId(crypto.randomUUID()); create.reset(); }}>{t('agents.tasks.oneAgent')}</Button>
        <Button type="button" size="sm" variant={swarm ? 'default' : 'outline'} onClick={() => { setSwarm(true); setSelected(active.map(agent => agent.id)); setRequestId(crypto.randomUUID()); create.reset(); }}>{t('agents.tasks.swarm')}</Button>
      </div>}
      {swarm ? <div className="space-y-2"><p className="text-sm font-medium text-white/85">{t('agents.tasks.swarmChoose')}</p>
        <div className="flex flex-wrap gap-2">{active.map(agent => <button key={agent.id} type="button" aria-pressed={selected.includes(agent.id)} disabled={create.isPending}
          onClick={() => { setSelected(ids => ids.includes(agent.id) ? ids.filter(id => id !== agent.id) : [...ids, agent.id]); setRequestId(crypto.randomUUID()); create.reset(); }}
          className={`rounded-full border px-3 py-2 text-sm transition-colors ${selected.includes(agent.id) ? 'border-white/70 bg-white/20 text-white' : 'border-white/20 bg-black/20 text-white/70'}`}>@{agent.name}</button>)}</div>
        <p className="text-sm text-white/70">{t('agents.tasks.swarmHelp')}</p>
      </div> : <div className="space-y-2 text-sm"><label className="font-medium text-white/85" htmlFor="task-agent">{t('agents.agentName')}</label>
        <Select value={agentId} disabled={create.isPending} onValueChange={value => { setChosen(value); setRequestId(crypto.randomUUID()); create.reset(); }}>
          <SelectTrigger id="task-agent" data-theme-control-surface aria-label={t('agents.agentName')} className="border-white/20 bg-black/25 text-white"><SelectValue /></SelectTrigger>
          <SelectContent>{active.map(agent => <SelectItem key={agent.id} value={agent.id}>@{agent.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('agents.tasks.window.mode')}>
        <Button type="button" size="sm" variant={!windowMode ? 'default' : 'outline'} onClick={() => { setWindowMode(false); changed(); }}>{t('agents.tasks.window.write')}</Button>
        <Button type="button" size="sm" variant={windowMode ? 'default' : 'outline'} onClick={() => { setWindowMode(true); changed(); }}>{t('agents.tasks.window.title')}</Button>
      </div>
      {windowMode ? <div className="space-y-4 rounded-xl border border-white/15 bg-black/20 p-4">
        <div className="space-y-2"><p className="text-sm font-medium text-white/85">{t('agents.tasks.window.period')}</p>
          <div className="flex flex-wrap gap-2">{WINDOW_PRESETS.map(value => <button key={value} type="button" aria-pressed={preset === value} disabled={create.isPending}
            onClick={() => { setPreset(value); changed(); }} className={`rounded-full border px-3 py-2 text-sm transition-colors ${preset === value ? 'border-white/70 bg-white/20 text-white' : 'border-white/20 bg-black/20 text-white/70'}`}>{t(`agents.tasks.window.${value}`)}</button>)}</div>
          {preset === 'custom' && <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-white/80">{t('agents.tasks.window.from')}<Input type="datetime-local" value={custom.from} disabled={create.isPending} onChange={event => { setCustom(value => ({ ...value, from: event.target.value })); changed(); }} data-theme-control-surface className="border-white/20 bg-black/25 text-white" /></label>
            <label className="space-y-1 text-sm text-white/80">{t('agents.tasks.window.to')}<Input type="datetime-local" value={custom.to} disabled={create.isPending} onChange={event => { setCustom(value => ({ ...value, to: event.target.value })); changed(); }} data-theme-control-surface className="border-white/20 bg-black/25 text-white" /></label>
          </div>}
          {preset === 'custom' && custom.from && custom.to && !range && <p role="alert" className="text-sm">{t('agents.tasks.window.invalid')}</p>}
        </div>
        <div className="space-y-2"><p className="text-sm font-medium text-white/85">{t('agents.tasks.window.actions')}</p>
          <div className="flex flex-wrap gap-2">{WINDOW_ACTIONS.map(value => <button key={value} type="button" aria-pressed={windowActions.includes(value)} disabled={create.isPending}
            onClick={() => { setWindowActions(list => list.includes(value) ? list.filter(item => item !== value) : [...list, value]); changed(); }}
            className={`rounded-full border px-3 py-2 text-sm transition-colors ${windowActions.includes(value) ? 'border-white/70 bg-white/20 text-white' : 'border-white/20 bg-black/20 text-white/70'}`}>{t(`agents.tasks.window.${value}`)}</button>)}</div>
        </div>
        {windowActions.includes('reply') && <Textarea value={replyStyle} disabled={create.isPending} maxLength={500} onChange={event => { setReplyStyle(event.target.value); changed(); }} aria-label={t('agents.tasks.window.replyStyle')} placeholder={t('agents.tasks.window.replyPlaceholder')} data-theme-control-surface className="min-h-20 rounded-xl border-white/25 bg-black/35 p-3 text-base text-white placeholder:text-white/65" />}
        <p className="text-sm leading-relaxed text-white/70">{t('agents.tasks.window.help')}</p>
      </div> : <Textarea value={prompt} disabled={create.isPending} maxLength={4000} onChange={event => { setPrompt(event.target.value); setRequestId(crypto.randomUUID()); create.reset(); }} aria-label={t('agents.tasks.instructions')} placeholder={t('agents.tasks.examples')} data-theme-control-surface className="min-h-36 rounded-xl border-white/25 bg-black/35 p-4 text-base leading-relaxed text-white placeholder:text-white/65 focus-visible:ring-2 focus-visible:ring-white/50" />}
      <div className="flex flex-wrap items-center gap-3"><Button disabled={(windowMode ? !windowReady : !prompt.trim()) || create.isPending || (swarm && swarmIds.length < 2)} onClick={() => create.mutate(windowMode && range ? windowPrompt(range, windowActions, replyStyle) : prompt)}>{create.isPending ? t('agents.tasks.preparing') : swarm ? t('agents.tasks.runSwarm') : t('agents.tasks.run')}</Button><p className="min-w-0 flex-1 text-sm leading-relaxed text-white/75">{t('agents.tasks.limits')}</p></div>
    </> : <p className="text-sm text-white/60">{t('agents.tasks.createFirst')}</p>}
    {create.error && <p role="alert" className="text-sm break-words">{create.error.message}</p>}
    {control.error && <p role="alert" className="text-sm break-words">{control.error.message}</p>}
    {create.isSuccess && <p role="status" className="text-sm">{t('agents.tasks.queued')}</p>}
    <div className="flex items-center justify-between border-t border-white/15 pt-4"><h3 className="font-semibold">{t('agents.tasks.list')}</h3><Button variant="ghost" size="sm" disabled={tasks.isFetching} onClick={refresh}>{t('agents.tasks.refresh')}</Button></div>
    {tasks.error && <p role="alert">{tasks.error.message}</p>}
    {tasks.isLoading && <p>{t('agents.tasks.loading')}</p>}
    {currentTasks.map(renderTask)}
    {pastTasks.length > 0 && <details className="group rounded-xl border border-white/15 bg-black/20 p-4">
      <summary className="cursor-pointer font-medium text-white">{t('agents.tasks.list')} · {pastTasks.length}</summary>
      <div className="mt-4 space-y-3">{pastTasks.map(renderTask)}</div>
    </details>}
  </section>;
}
