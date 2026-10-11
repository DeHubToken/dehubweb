import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { agentTaskRequest, type AgentTask, type AgentTaskAction } from '@/lib/agent-tasks';
import { toast } from 'sonner';

const actionNames: Record<string, string> = { dehub_follow: 'Follow', dehub_vote: 'Reaction', dehub_post_create: 'Post', dehub_comment: 'Comment', dehub_update_profile: 'Profile update' };

function TaskHistory({ task, wallet }: { task: AgentTask; wallet: string }) {
  const [open, setOpen] = useState(false);
  const history = useQuery({ queryKey: ['agent-task-history', wallet, task.id], enabled: open,
    queryFn: () => agentTaskRequest<{ actions: AgentTaskAction[] }>(wallet, { operation: 'history', task_id: task.id }) });
  return <details onToggle={event => setOpen(event.currentTarget.open)} className="text-sm">
    <summary className="cursor-pointer text-white/60">Recent activity</summary>
    {history.isLoading && <p>Loading activity…</p>}
    {history.error && <p role="alert">{history.error.message}</p>}
    <ul className="mt-2 space-y-2">{history.data?.actions.map(action => <li key={action.id} className="rounded-lg bg-white/5 p-3 break-words">
      <p>{actionNames[action.tool] || 'Action'} · {action.status} · {new Date(action.created_at).toLocaleString()}</p>
      {action.target !== 'single' && <p className="text-white/60 break-all">{action.target}</p>}
      {action.result?.content && <p className="whitespace-pre-wrap">{action.result.content}</p>}
      {action.result?.error && <p>{action.result.error}</p>}
      {action.result?.hint && <p>{action.result.hint}</p>}
      {action.result?.post?.url && <a className="underline" href={action.result.post.url} target="_blank" rel="noreferrer">View post</a>}
    </li>)}</ul>
    {history.data?.actions.length === 0 && <p className="text-white/60">No actions yet.</p>}
    {(history.data?.actions.length ?? 0) >= 100 && <p>Showing the latest 100 actions.</p>}
  </details>;
}

export function AgentTasksPanel({ wallet, agents }: { wallet: string; agents: { id: string; name: string; is_active: boolean }[] }) {
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
    onSuccess: () => { setPrompt.complete(prompt, ''); setRequestId(crypto.randomUUID()); refresh(); toast.success('Task queued'); },
    onError: (error: Error) => toast.error(error.message),
  });
  const control = useMutation({ mutationFn: ({ id, operation }: { id: string; operation: string }) => agentTaskRequest(wallet, { operation, task_id: id }), onSuccess: refresh, onError: (error: Error) => toast.error(error.message) });
  return <section data-kit-section className="space-y-4 border border-white/10 bg-white/5 p-4 text-white">
    <div><h2 className="font-semibold">Give an agent a task</h2><p className="text-sm text-white/60">Actions run as the selected agent. Scheduled tasks continue with the app closed.</p></div>
    {active.length ? <>
      <label className="block text-sm">Agent<select aria-label="Agent" className="mt-1 w-full rounded-lg border border-white/10 bg-background p-2" value={agentId} disabled={create.isPending} onChange={event => { setChosen(event.target.value); setRequestId(crypto.randomUUID()); }}>{active.map(agent => <option key={agent.id} value={agent.id}>@{agent.name}</option>)}</select></label>
      <Textarea value={prompt} disabled={create.isPending} maxLength={4000} onChange={event => { setPrompt(event.target.value); setRequestId(crypto.randomUUID()); }} aria-label="Agent instructions" placeholder={'Follow everyone who posted today.\nLike every post from the last 24 hours.\nPost 3 times per day about independent music.'} className="min-h-28" />
      <Button disabled={!prompt.trim() || create.isPending} onClick={() => create.mutate()}>{create.isPending ? 'Preparing task…' : 'Run prompt'}</Button>
      <p className="text-xs text-white/50">Supports posts, follows, reactions, comments and profile changes. Topic posts use writing credits and Base gas. Bulk actions continue at the agent’s existing limits.</p>
    </> : <p className="text-sm text-white/60">Create an agent below to give it a task.</p>}
    <div className="flex items-center justify-between"><h3 className="font-medium">Tasks</h3><Button variant="ghost" size="sm" disabled={tasks.isFetching} onClick={refresh}>Refresh</Button></div>
    {tasks.error && <p role="alert">{tasks.error.message}</p>}
    {tasks.isLoading && <p>Loading tasks…</p>}
    {tasks.data?.tasks.map(task => <article key={task.id} className="space-y-2 rounded-lg border border-white/10 p-3">
      <p className="font-medium">{task.plan.summary}</p>
      <p className="text-sm text-white/60">@{agents.find(agent => agent.id === task.agent_id)?.name || 'agent'} · {task.status} · {task.completed_actions} processed</p>
      {task.message && <p className="text-sm">{task.message}</p>}
      {task.status === 'queued' && <p className="text-xs text-white/50">Next run: {new Date(task.next_run_at).toLocaleString()}</p>}
      <div className="flex gap-2">{['queued', 'running'].includes(task.status) && <Button size="sm" variant="outline" disabled={control.isPending} onClick={() => control.mutate({ id: task.id, operation: 'pause' })}>Pause</Button>}
        {['paused', 'failed'].includes(task.status) && <Button size="sm" variant="outline" disabled={control.isPending} onClick={() => control.mutate({ id: task.id, operation: task.needs_review ? 'skip' : 'resume' })}>{task.needs_review ? 'Skip unconfirmed action and resume' : 'Resume'}</Button>}</div>
      <TaskHistory task={task} wallet={wallet} />
    </article>)}
  </section>;
}
