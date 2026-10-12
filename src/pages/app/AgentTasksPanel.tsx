import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { agentTaskRequest, type AgentTask, type AgentTaskAction } from '@/lib/agent-tasks';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

const actionNames: Record<string, string> = { dehub_follow: 'agents.tasks.follow', dehub_vote: 'agents.tasks.reaction', dehub_post_create: 'agents.tasks.post', dehub_comment: 'agents.tasks.comment', dehub_update_profile: 'agents.tasks.profile' };

function TaskHistory({ task, wallet }: { task: AgentTask; wallet: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const history = useQuery({ queryKey: ['agent-task-history', wallet, task.id], enabled: open,
    queryFn: () => agentTaskRequest<{ actions: AgentTaskAction[] }>(wallet, { operation: 'history', task_id: task.id }) });
  return <details onToggle={event => setOpen(event.currentTarget.open)} className="text-sm">
    <summary className="cursor-pointer text-white/60">{t('agents.tasks.activity')}</summary>
    {history.isLoading && <p>{t('agents.tasks.loadingActivity')}</p>}
    {history.error && <p role="alert">{history.error.message}</p>}
    <ul className="mt-2 space-y-2">{history.data?.actions.map(action => <li key={action.id} className="rounded-lg bg-white/5 p-3 break-words">
      <p>{t(actionNames[action.tool] || 'agents.tasks.action')} · {action.status} · {new Date(action.created_at).toLocaleString()}</p>
      {action.target !== 'single' && <p className="text-white/60 break-all">{action.target}</p>}
      {action.result?.content && <p className="whitespace-pre-wrap">{action.result.content}</p>}
      {action.result?.error && <p>{action.result.error}</p>}
      {action.result?.hint && <p>{action.result.hint}</p>}
      {action.result?.post?.url && <a className="underline" href={action.result.post.url} target="_blank" rel="noreferrer">{t('agents.tasks.viewPost')}</a>}
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
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const active = agents.filter(agent => agent.is_active);
  const agentId = active.some(agent => agent.id === chosen) ? chosen : active[0]?.id;
  const tasks = useQuery({ queryKey: ['agent-tasks', wallet],
    queryFn: () => agentTaskRequest<{ tasks: AgentTask[] }>(wallet, { operation: 'list' }) });
  const refresh = () => { client.invalidateQueries({ queryKey: ['agent-tasks', wallet] }); client.invalidateQueries({ queryKey: ['agent-task-history', wallet] }); };
  const create = useMutation({ mutationFn: () => agentTaskRequest(wallet, { operation: 'create', agent_id: agentId,
    prompt, request_id: requestId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    onSuccess: () => { setPrompt.complete(prompt, ''); setRequestId(crypto.randomUUID()); refresh(); toast.success(t('agents.tasks.queued')); },
    onError: (error: Error) => toast.error(error.message),
  });
  const control = useMutation({ mutationFn: ({ id, operation }: { id: string; operation: string }) => agentTaskRequest(wallet, { operation, task_id: id }), onSuccess: refresh, onError: (error: Error) => toast.error(error.message) });
  return <section data-kit-section className="space-y-4 border border-white/10 bg-white/5 p-4 text-white">
    <div><h2 className="font-semibold">{t('agents.tasks.title')}</h2><p className="text-sm text-white/60">{t('agents.tasks.description')}</p></div>
    {active.length ? <>
      <label className="block text-sm">{t('agents.agentName')}<select aria-label={t('agents.agentName')} className="mt-1 w-full rounded-lg border border-white/10 bg-background p-2" value={agentId} disabled={create.isPending} onChange={event => { setChosen(event.target.value); setRequestId(crypto.randomUUID()); }}>{active.map(agent => <option key={agent.id} value={agent.id}>@{agent.name}</option>)}</select></label>
      <Textarea value={prompt} disabled={create.isPending} maxLength={4000} onChange={event => { setPrompt(event.target.value); setRequestId(crypto.randomUUID()); create.reset(); }} aria-label={t('agents.tasks.instructions')} placeholder={t('agents.tasks.examples')} className="min-h-28 bg-black/20 text-white placeholder:text-white/50" />
      <Button disabled={!prompt.trim() || create.isPending} onClick={() => create.mutate()}>{create.isPending ? t('agents.tasks.preparing') : t('agents.tasks.run')}</Button>
      <p className="text-xs text-white/50">{t('agents.tasks.limits')}</p>
    </> : <p className="text-sm text-white/60">{t('agents.tasks.createFirst')}</p>}
    {create.error && <p role="alert" className="text-sm break-words">{create.error.message}</p>}
    {control.error && <p role="alert" className="text-sm break-words">{control.error.message}</p>}
    {create.isSuccess && <p role="status" className="text-sm">{t('agents.tasks.queued')}</p>}
    <div className="flex items-center justify-between"><h3 className="font-medium">{t('agents.tasks.list')}</h3><Button variant="ghost" size="sm" disabled={tasks.isFetching} onClick={refresh}>{t('agents.tasks.refresh')}</Button></div>
    {tasks.error && <p role="alert">{tasks.error.message}</p>}
    {tasks.isLoading && <p>{t('agents.tasks.loading')}</p>}
    {tasks.data?.tasks.map(task => <article key={task.id} className="space-y-2 rounded-lg border border-white/10 p-3">
      <p className="font-medium">{task.plan.summary}</p>
      <p className="text-sm text-white/60">{t('agents.tasks.meta', { agent: agents.find(agent => agent.id === task.agent_id)?.name || 'agent', status: task.status, total: task.completed_actions })}</p>
      {task.message && <p className="text-sm">{task.message}</p>}
      {task.status === 'queued' && <p className="text-xs text-white/50">{t('agents.tasks.next', { time: new Date(task.next_run_at).toLocaleString() })}</p>}
      <div className="flex gap-2">{['queued', 'running'].includes(task.status) && <Button size="sm" variant="outline" disabled={control.isPending} onClick={() => control.mutate({ id: task.id, operation: 'pause' })}>{t('agents.tasks.pause')}</Button>}
        {['paused', 'failed'].includes(task.status) && <Button size="sm" variant="outline" disabled={control.isPending} onClick={() => control.mutate({ id: task.id, operation: task.needs_review ? 'skip' : 'resume' })}>{task.needs_review ? t('agents.tasks.skip') : t('agents.tasks.resume')}</Button>}</div>
      <TaskHistory task={task} wallet={wallet} />
    </article>)}
  </section>;
}
