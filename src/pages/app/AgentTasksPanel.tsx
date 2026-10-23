import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { agentTaskRequest, type AgentTask, type AgentTaskAction } from '@/lib/agent-tasks';
import { WINDOW_ACTIONS, WINDOW_PRESETS, toggleWindowAction, windowPrompt, windowRange, type WindowAction, type WindowPreset } from '@/lib/agent-task-window';
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
  const [distribution, setDistribution] = useState<'each' | 'shared'>('each');
  const [selected, setSelected] = useState<string[]>([]);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [windowMode, setWindowMode] = useState(false);
  const [preset, setPreset] = useState<WindowPreset>('last24h');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [windowActions, setWindowActions] = useState<WindowAction[]>(['view']);
  const [replyStyle, setReplyStyle] = useState('');
  const [filters, setFilters] = useState({ author: '', category: '' });
  const [filterModes, setFilterModes] = useState({ author: false, category: false });
  const range = windowRange(preset, custom);
  const windowReady = !!range && windowActions.length > 0 && (!windowActions.includes('reply') || !!replyStyle.trim());
  const changed = () => { setRequestId(crypto.randomUUID()); create.reset(); };
  const active = agents.filter(agent => agent.is_active);
  const agentId = active.some(agent => agent.id === chosen) ? chosen : active[0]?.id;
  const swarmIds = active.filter(agent => selected.includes(agent.id)).map(agent => agent.id);
  const tasks = useQuery({ queryKey: ['agent-tasks', wallet], refetchInterval: 10000,
    queryFn: () => agentTaskRequest<{ tasks: AgentTask[] }>(wallet, { operation: 'list' }) });
  const refresh = () => { client.invalidateQueries({ queryKey: ['agent-tasks', wallet] }); client.invalidateQueries({ queryKey: ['agent-task-history', wallet] }); };
  const create = useMutation({ mutationFn: (text: string) => agentTaskRequest(wallet, { operation: swarm ? 'create_swarm' : 'create',
    ...(swarm ? { agent_ids: swarmIds, swarm_mode: distribution } : { agent_id: agentId }),
    prompt: text, request_id: requestId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    onSuccess: (_data, text) => { if (text === prompt) setPrompt.complete(prompt, ''); setRequestId(crypto.randomUUID()); refresh(); toast.success(t('agents.tasks.queued')); },
    onError: (error: Error) => toast.error(error.message),
  });
  const control = useMutation({ mutationFn: ({ id, operation, group }: { id: string; operation: string; group?: boolean }) => agentTaskRequest<{ updated?: number }>(wallet, { operation, ...(group ? { swarm_id: id } : { task_id: id }) }), onSuccess: data => { refresh(); if (data.updated !== undefined) toast.success(t('agents.tasks.controlUpdated', { count: data.updated })); }, onError: (error: Error) => toast.error(error.message) });
  const swarmGroups = [...new Set(tasks.data?.tasks.filter(task => task.swarm_id).map(task => task.swarm_id!) ?? [])];
  const currentTasks = tasks.data?.tasks.filter(task => !['completed', 'failed', 'cancelled'].includes(task.status)) ?? [];
  const pastTasks = tasks.data?.tasks.filter(task => ['completed', 'failed', 'cancelled'].includes(task.status)) ?? [];
  const renderTask = (task: AgentTask) => <article key={task.id} className="space-y-2 rounded-xl border border-white/15 bg-black/20 p-4">
    <p className="font-medium leading-snug text-white">{task.plan.summary}</p>
    {task.swarm_id && <p className="text-xs font-medium uppercase tracking-wide text-white/65">{t('agents.tasks.swarmMember', { index: (task.swarm_index ?? 0) + 1, total: task.swarm_size })}</p>}
    <p className="text-sm text-white/75">{t('agents.tasks.meta', { agent: agents.find(agent => agent.id === task.agent_id)?.name || 'agent', status: task.status, total: task.completed_actions })}</p>
    {task.message && <p className="text-sm text-white/80">{task.message}</p>}
    {task.status === 'queued' && <p className="text-sm text-white/70">{t('agents.tasks.next', { time: new Date(task.next_run_at).toLocaleString() })}</p>}
    <div className="flex flex-wrap gap-2">{['queued', 'running'].includes(task.status) && <Button size="sm" variant="outline" disabled={control.isPending} onClick={() => control.mutate({ id: task.id, operation: 'pause' })}>{t('agents.tasks.pause')}</Button>}
      {['paused', 'failed'].includes(task.status) && <Button size="sm" variant="outline" disabled={control.isPending} onClick={() => control.mutate({ id: task.id, operation: task.needs_review ? 'skip' : 'resume' })}>{task.needs_review ? t('agents.tasks.skip') : t('agents.tasks.resume')}</Button>}
      {!['completed', 'cancelled'].includes(task.status) && <Button size="sm" variant="ghost" disabled={control.isPending} onClick={() => control.mutate({ id: task.id, operation: 'cancel' })}>{t('agents.tasks.cancelTask')}</Button>}</div>
    <TaskHistory task={task} wallet={wallet} />
  </article>;
  return <section id="agent-task-controls" data-kit-section className="space-y-5 rounded-2xl border border-white/20 bg-black/35 p-5 text-white backdrop-blur-xl">
    <div><h2 className="text-lg font-semibold text-white">{t('agents.tasks.title')}</h2><p className="text-sm leading-relaxed text-white/75">{t('agents.tasks.description')}</p></div>
    {active.length ? <>
      {active.length > 1 && <div className="flex flex-wrap gap-2" role="group" aria-label={t('agents.tasks.mode')}>
        <Button type="button" size="sm" disabled={create.isPending} aria-pressed={!swarm} variant={!swarm ? 'default' : 'outline'} onClick={() => { setSwarm(false); setRequestId(crypto.randomUUID()); create.reset(); }}>{t('agents.tasks.oneAgent')}</Button>
        <Button type="button" size="sm" disabled={create.isPending} aria-pressed={swarm} variant={swarm ? 'default' : 'outline'} onClick={() => { setSwarm(true); setSelected(active.map(agent => agent.id)); setRequestId(crypto.randomUUID()); create.reset(); }}>{t('agents.tasks.swarm')}</Button>
      </div>}
      {swarm ? <div className="space-y-2"><p className="text-sm font-medium text-white/85">{t('agents.tasks.swarmChoose')}</p>
        <div className="flex items-center gap-2 text-sm">
          <Button type="button" size="sm" variant="outline" disabled={create.isPending} onClick={() => { setSelected(active.map(agent => agent.id)); changed(); }}>{t('agents.tasks.selectAll')}</Button>
          <Button type="button" size="sm" variant="ghost" disabled={create.isPending} onClick={() => { setSelected([]); changed(); }}>{t('agents.tasks.clearSelection')}</Button>
          <span role="status">{t('agents.tasks.selectedCount', { count: swarmIds.length, total: active.length })}</span>
        </div>
        <div className="flex flex-wrap gap-2">{active.map(agent => <button key={agent.id} type="button" aria-pressed={selected.includes(agent.id)} disabled={create.isPending}
          onClick={() => { setSelected(ids => ids.includes(agent.id) ? ids.filter(id => id !== agent.id) : [...ids, agent.id]); setRequestId(crypto.randomUUID()); create.reset(); }}
          className={`rounded-full border px-3 py-2 text-sm transition-colors ${selected.includes(agent.id) ? 'border-white/70 bg-white/20 text-white' : 'border-white/20 bg-black/20 text-white/70'}`}>@{agent.name}</button>)}</div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('agents.tasks.distribution')}>
          {(['each', 'shared'] as const).map(mode => <Button key={mode} type="button" size="sm" disabled={create.isPending} aria-pressed={distribution === mode} variant={distribution === mode ? 'default' : 'outline'} onClick={() => { setDistribution(mode); changed(); }}>{t(`agents.tasks.${mode}Mode`)}</Button>)}
        </div>
        <p className="text-sm text-white/70">{t(distribution === 'each' ? 'agents.tasks.eachHelp' : 'agents.tasks.swarmHelp')}</p>
      </div> : <div className="space-y-2 text-sm"><label className="font-medium text-white/85" htmlFor="task-agent">{t('agents.agentName')}</label>
        <Select value={agentId} disabled={create.isPending} onValueChange={value => { setChosen(value); setRequestId(crypto.randomUUID()); create.reset(); }}>
          <SelectTrigger id="task-agent" data-theme-control-surface aria-label={t('agents.agentName')} className="border-white/20 bg-black/25 text-white"><SelectValue /></SelectTrigger>
          <SelectContent>{active.map(agent => <SelectItem key={agent.id} value={agent.id}>@{agent.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('agents.tasks.window.mode')}>
        <Button type="button" size="sm" disabled={create.isPending} aria-pressed={!windowMode} variant={!windowMode ? 'default' : 'outline'} onClick={() => { setWindowMode(false); changed(); }}>{t('agents.tasks.window.write')}</Button>
        <Button type="button" size="sm" disabled={create.isPending} aria-pressed={windowMode} variant={windowMode ? 'default' : 'outline'} onClick={() => { setWindowMode(true); changed(); }}>{t('agents.tasks.window.title')}</Button>
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
        <div className="grid gap-4 sm:grid-cols-2">
          {(['author', 'category'] as const).map(field => <div key={field} className="space-y-2 rounded-xl border border-white/15 bg-white/5 p-3">
            <p className="text-sm font-medium">{t(`agents.tasks.window.${field}`)}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t(`agents.tasks.window.${field}`)}>
              {([false, true] as const).map(specific => <Button key={String(specific)} type="button" size="sm" variant={filterModes[field] === specific ? 'default' : 'outline'} aria-pressed={filterModes[field] === specific} disabled={create.isPending}
                onClick={() => { setFilterModes(current => ({ ...current, [field]: specific })); changed(); }}>{t(`agents.tasks.window.${field}${specific ? 'Choose' : 'All'}`)}</Button>)}
            </div>
            {filterModes[field] && <Input aria-label={t(`agents.tasks.window.${field}`)} value={filters[field]} maxLength={field === 'author' ? 50 : 1000} disabled={create.isPending} placeholder={t(`agents.tasks.window.${field}Placeholder`)}
              onChange={event => { setFilters(current => ({ ...current, [field]: event.target.value })); changed(); }} data-theme-control-surface className="border-white/20 bg-black/25 text-white" />}
            {field === 'category' && filterModes.category && <p className="text-xs text-white/70">{t('agents.tasks.window.categoryHint')}</p>}
          </div>)}
        </div>
        <p className="text-sm text-white/70">{t('agents.tasks.window.filterHelp')}</p>
        <div className="space-y-2"><p className="text-sm font-medium text-white/85">{t('agents.tasks.window.actions')}</p>
          <div className="flex flex-wrap gap-2">{WINDOW_ACTIONS.map(value => <button key={value} type="button" aria-pressed={windowActions.includes(value)} disabled={create.isPending}
            onClick={() => { setWindowActions(list => toggleWindowAction(list, value)); changed(); }}
            className={`rounded-full border px-3 py-2 text-sm transition-colors ${windowActions.includes(value) ? 'border-white/70 bg-white/20 text-white' : 'border-white/20 bg-black/20 text-white/70'}`}>{t(`agents.tasks.window.${value}`)}</button>)}</div>
        </div>
        {windowActions.includes('reply') && <Textarea value={replyStyle} disabled={create.isPending} maxLength={500} onChange={event => { setReplyStyle(event.target.value); changed(); }} aria-label={t('agents.tasks.window.replyStyle')} placeholder={t('agents.tasks.window.replyPlaceholder')} data-theme-control-surface className="min-h-20 rounded-xl border-white/25 bg-black/35 p-3 text-base text-white placeholder:text-white/65" />}
        <p className="text-sm leading-relaxed text-white/70">{t('agents.tasks.window.help')}</p>
      </div> : <Textarea value={prompt} disabled={create.isPending} maxLength={4000} onChange={event => { setPrompt(event.target.value); setRequestId(crypto.randomUUID()); create.reset(); }} aria-label={t('agents.tasks.instructions')} placeholder={t('agents.tasks.examples')} data-theme-control-surface className="min-h-36 rounded-xl border-white/25 bg-black/35 p-4 text-base leading-relaxed text-white placeholder:text-white/65 focus-visible:ring-2 focus-visible:ring-white/50" />}
      <div className="flex flex-wrap items-center gap-3"><Button disabled={(windowMode ? !windowReady : !prompt.trim()) || create.isPending || (swarm && swarmIds.length < 2)} onClick={() => create.mutate(windowMode && range ? windowPrompt(windowRange(preset, custom)!, windowActions, replyStyle, { author: filterModes.author ? filters.author : '', category: filterModes.category ? filters.category : '' }) : prompt)}>{create.isPending ? t('agents.tasks.preparing') : swarm ? t('agents.tasks.runSwarm') : t('agents.tasks.run')}</Button><p className="min-w-0 flex-1 text-sm leading-relaxed text-white/75">{t(windowMode ? 'agents.tasks.windowLimits' : 'agents.tasks.promptLimits')}</p></div>
    </> : <p className="text-sm text-white/60">{t('agents.tasks.createFirst')}</p>}
    {create.error && <p role="alert" className="text-sm break-words">{create.error.message}</p>}
    {control.error && <p role="alert" className="text-sm break-words">{control.error.message}</p>}
    {create.isSuccess && <p role="status" className="text-sm">{t('agents.tasks.queued')}</p>}
    <div className="flex items-center justify-between border-t border-white/15 pt-4"><h3 className="font-semibold">{t('agents.tasks.list')}</h3><Button variant="ghost" size="sm" disabled={tasks.isFetching} onClick={refresh}>{t('agents.tasks.refresh')}</Button></div>
    {tasks.error && <p role="alert">{tasks.error.message}</p>}
    {tasks.isLoading && <p>{t('agents.tasks.loading')}</p>}
    {swarmGroups.map(id => {
      const members = tasks.data!.tasks.filter(task => task.swarm_id === id);
      const has = (statuses: string[]) => members.some(task => statuses.includes(task.status));
      return <details key={id} className="rounded-xl border border-white/20 bg-black/20 p-4">
        <summary className="cursor-pointer font-medium">{t('agents.tasks.swarm')} · {members.length} · {members[0].plan.summary}</summary>
        <p className="mt-2 text-sm text-white/75">{t(members[0].swarm_mode === 'each' ? 'agents.tasks.eachMode' : 'agents.tasks.sharedMode')} · {members.reduce((sum, task) => sum + task.completed_actions, 0)} {t('agents.tasks.actionsProcessed')}</p>
        <div className="my-3 flex flex-wrap gap-2">
          {has(['queued', 'running']) && <Button size="sm" variant="outline" disabled={control.isPending} onClick={() => control.mutate({ id, operation: 'pause', group: true })}>{t('agents.tasks.pauseSwarm')}</Button>}
          {has(['paused', 'failed']) && <Button size="sm" variant="outline" disabled={control.isPending} onClick={() => control.mutate({ id, operation: 'resume', group: true })}>{t('agents.tasks.resumeSwarm')}</Button>}
          {has(['queued', 'running', 'paused', 'failed']) && <Button size="sm" variant="ghost" disabled={control.isPending} onClick={() => control.mutate({ id, operation: 'cancel', group: true })}>{t('agents.tasks.cancelSwarm')}</Button>}
        </div>
        {members.some(task => task.needs_review) && <p className="my-2 text-sm">{t('agents.tasks.reviewMembers')}</p>}
        <div className="space-y-3">{members.map(renderTask)}</div>
      </details>;
    })}
    {currentTasks.filter(task => !task.swarm_id).map(renderTask)}
    {pastTasks.some(task => !task.swarm_id) && <details className="group rounded-xl border border-white/15 bg-black/20 p-4">
      <summary className="cursor-pointer font-medium text-white">{t('agents.tasks.list')} · {pastTasks.filter(task => !task.swarm_id).length}</summary>
      <div className="mt-4 space-y-3">{pastTasks.filter(task => !task.swarm_id).map(renderTask)}</div>
    </details>}
  </section>;
}


/** The account-enabled pill opens actual task activity, rather than implying it is running. */
export function AgentActivity({ wallet, agentId, lastActive }: { wallet: string; agentId: string; lastActive: string | null }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const tasks = useQuery({ queryKey: ['agent-tasks', wallet], refetchInterval: 10000,
    queryFn: () => agentTaskRequest<{ tasks: AgentTask[] }>(wallet, { operation: 'list' }) });
  const control = useMutation({ mutationFn: ({ id, operation }: { id: string; operation: string }) => agentTaskRequest(wallet, { operation, task_id: id }),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['agent-tasks', wallet] }); }, onError: (error: Error) => toast.error(error.message) });
  const own = tasks.data?.tasks.filter(task => task.agent_id === agentId) ?? [];
  return <div id={`agent-activity-${agentId}`} className="mb-4 space-y-3 rounded-xl border border-white/20 bg-black/25 p-4 text-white">
    <p className="text-sm text-white/80">{t('agents.tasks.enabledHelp')}</p>
    <p className="text-sm">{t('agents.tasks.lastActive')}: {lastActive ? new Date(lastActive).toLocaleString() : t('agents.tasks.noActivity')}</p>
    {tasks.isLoading && <p>{t('agents.tasks.loading')}</p>}
    {tasks.error && <p role="alert">{tasks.error.message}</p>}
    {!tasks.isLoading && !tasks.error && own.length === 0 && <p>{t('agents.tasks.noTasks')}</p>}
    {own.map(task => <article key={task.id} className="space-y-2 border-t border-white/15 pt-3">
      <p>{task.plan.summary}</p><p role="status" className="text-sm">{task.status} · {task.completed_actions} {t('agents.tasks.actionsProcessed')}</p>
      {task.message && <p className="text-sm text-white/80">{task.message}</p>}
      <div className="flex flex-wrap gap-2">
        {['queued', 'running'].includes(task.status) && <Button size="sm" disabled={control.isPending} onClick={() => control.mutate({ id: task.id, operation: 'pause' })}>{t('agents.tasks.pause')}</Button>}
        {['paused', 'failed'].includes(task.status) && !task.needs_review && <Button size="sm" disabled={control.isPending} onClick={() => control.mutate({ id: task.id, operation: 'resume' })}>{t('agents.tasks.resume')}</Button>}
      </div>
      <TaskHistory task={task} wallet={wallet} />
    </article>)}
  </div>;
}
