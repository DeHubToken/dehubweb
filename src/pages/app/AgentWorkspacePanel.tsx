import { AgentModerationPanel } from './AgentModerationPanel';
import { useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { agentTaskRequest } from '@/lib/agent-tasks';
import type { GrowthReport } from '@/lib/agent-workspace';
import { PERMISSIONS, NEWS_TOPICS, BUILDER_ACTIONS, buildAgentPrompt, workspaceCounts, workspaceAvailable, type BuilderAction, type AgentSettings, type WorkspaceOverview, type PlanPreview } from '@/lib/agent-workspace';

const fieldClass = 'mt-1.5 rounded-xl border-white/20 bg-black/35 text-white placeholder:text-white/50 focus-visible:ring-2 focus-visible:ring-white/40';
const labelClass = 'block text-sm font-medium text-white/80';

/** Native select with the same height, rounding and dark surface as the inputs, and a padded chevron. */
function FieldSelect({ wrapperClassName = '', className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }) {
  return <div className={`relative mt-1.5 ${wrapperClassName}`}>
    <select data-theme-control-surface className={`block h-11 w-full appearance-none rounded-xl border border-white/20 bg-black/35 pl-3 pr-10 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-black ${className}`} {...props} />
    <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
  </div>;
}

/** Collapsible header with a chevron instead of the browser's default triangle. Parent <details> needs the group class. */
function Summary({ children }: { children: ReactNode }) {
  return <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-white [&::-webkit-details-marker]:hidden"><span>{children}</span><ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-white/60 transition-transform group-open:rotate-180" /></summary>;
}

function Settings({ wallet, agentId }: { wallet: string; agentId: string }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<AgentSettings | null>(null);
  const settings = useQuery({ queryKey: ['agent-controls', wallet, agentId], queryFn: () => agentTaskRequest<{ settings: AgentSettings }>(wallet, { operation: 'workspace_settings', agent_id: agentId }) });
  const value = draft ?? settings.data?.settings;
  const save = useMutation({ mutationFn: () => agentTaskRequest<{ settings: AgentSettings }>(wallet, { operation: 'workspace_save_settings', agent_id: agentId, settings: value }), onSuccess: () => { void settings.refetch(); } });
  const change = (patch: Partial<AgentSettings>) => { if (value) setDraft({ ...value, ...patch }); save.reset(); };
  if (!value) return <p role="status">{settings.error?.message ?? t('common.loading', 'Loading…')}</p>;
  return <details className="group space-y-4 rounded-xl border border-white/15 bg-white/[0.03] p-4">
    <Summary>{t('agents.workspace.controls', 'Voice, permissions and news')}</Summary>
    <div className="flex flex-wrap gap-2">{(['autonomous', 'approval', 'draft'] as const).map(mode => <Button key={mode} size="sm" variant={value.mode === mode ? 'default' : 'outline'} aria-pressed={value.mode === mode} onClick={() => change({ mode })}>{t(`agents.workspace.${mode}`, { defaultValue: mode === 'autonomous' ? 'Autonomous' : mode === 'approval' ? 'Approve first' : 'Draft only' })}</Button>)}</div>
    <p className="text-sm text-white/70">{t('agents.workspace.scope', 'These controls apply to scheduled tasks, autonomous life and connected assistants. Drafts remain private until you approve them.')}</p>
    <div className="grid gap-2 sm:grid-cols-2">{PERMISSIONS.map(([tool, label]) => <label key={tool} className="flex items-center gap-2.5 text-sm text-white/85"><input type="checkbox" className="h-4 w-4 shrink-0 accent-white" checked={value.permissions.includes(tool)} onChange={event => change({ permissions: event.target.checked ? [...value.permissions, tool] : value.permissions.filter(item => item !== tool) })} />{t(`agents.workspace.${tool}`, label)}</label>)}</div>
    <label className={labelClass}>{t('agents.workspace.voice', 'Voice and tone')}<Textarea data-theme-control-surface className={fieldClass} value={value.voice} maxLength={1000} onChange={event => change({ voice: event.target.value })} /></label>
    <label className={labelClass}>{t('agents.workspace.knowledge', 'Reference material')}<Textarea data-theme-control-surface className={fieldClass} value={value.knowledge} maxLength={12000} onChange={event => change({ knowledge: event.target.value })} /></label>
    <label className={labelClass}>{t('agents.workspace.blocked', 'Blocked topics, separated by commas')}<Input data-theme-control-surface className={`h-11 ${fieldClass}`} value={value.blocked_topics.join(', ')} onChange={event => change({ blocked_topics: event.target.value.split(',').map(item => item.trim()).filter(Boolean) })} /></label>
    <label className="flex items-center gap-2.5 text-sm text-white/85"><input type="checkbox" className="h-4 w-4 shrink-0 accent-white" checked={value.news_enabled} onChange={event => change({ news_enabled: event.target.checked })} />{t('agents.workspace.liveNews', 'React to current news during autonomous life')}</label>
    <div className="flex flex-wrap gap-2">{NEWS_TOPICS.map(topic => <Button key={topic} size="sm" variant={value.news_topics.includes(topic) ? 'default' : 'outline'} aria-pressed={value.news_topics.includes(topic)} onClick={() => change({ news_topics: value.news_topics.includes(topic) ? value.news_topics.length > 1 ? value.news_topics.filter(item => item !== topic) : value.news_topics : value.news_topics.length < 3 ? [...value.news_topics, topic] : value.news_topics })}>{t(`agents.workspace.news.${topic}`, topic)}</Button>)}</div>
    <p className="text-sm text-white/70">{t('agents.workspace.newsHelp', 'Choose up to three topics. Publisher reports from the last 24 hours are cached for 15 minutes. News reactions include a source link; unavailable or stale news is skipped.')}</p>
    <label className={labelClass}>{t('agents.workspace.webhook', "Discord alert webhook (optional)")}<Input data-theme-control-surface className={`h-11 ${fieldClass}`} type="password" autoComplete="off" value={value.alert_webhook} maxLength={300} onChange={event => change({ alert_webhook: event.target.value })} /></label>
    <p className="text-sm text-white/70">{t('agents.workspace.webhookHelp', "Approval requests and action failures send a generic alert, at most once per hour. No draft text or wallet details are sent. Leave blank to disable; delivery results appear in the audit log.")}</p>
    <Button disabled={save.isPending} onClick={() => save.mutate()}>{t('common.save', 'Save')}</Button>
    {save.isSuccess && <p role="status">{t('agents.workspace.saved', 'Settings saved.')}</p>}
    {(save.error || settings.error) && <p role="alert">{(save.error || settings.error)?.message}</p>}
  </details>;
}

export function AgentWorkspacePanel({ wallet }: { wallet: string }) {
  const capability = useQuery({
    queryKey: ['agent-workspace-capabilities', wallet],
    queryFn: async () => {
      try {
        return await agentTaskRequest<{ workspace: boolean; version: number }>(wallet, { operation: 'workspace_capabilities' });
      } catch {
        // Production may still run the older function, or its migration may
        // not be available yet. Existing agent/task controls remain mounted.
        return null;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
  return workspaceAvailable(capability.data) ? <AgentWorkspaceContent wallet={wallet} /> : null;
}

function AgentWorkspaceContent({ wallet }: { wallet: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [selected, setSelected] = useState('');
  const [prompt, setPrompt] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [published, setPublished] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [filter, setFilter] = useState('all');
  const [action, setAction] = useState<BuilderAction>('post');
  const [topic, setTopic] = useState('');
  const [cadence, setCadence] = useState('daily');
  const overview = useQuery({ queryKey: ['agent-workspace', wallet], queryFn: () => agentTaskRequest<WorkspaceOverview>(wallet, { operation: 'workspace_overview' }) });
  const agentId = overview.data?.agents.some(agent => agent.id === selected) ? selected : overview.data?.agents[0]?.id;
  const counts = workspaceCounts(overview.data);
  const report = useMutation({ mutationFn: () => agentTaskRequest<GrowthReport>(wallet, { operation: 'workspace_report', agent_id: agentId }) });
  const refresh = () => { void overview.refetch(); client.invalidateQueries({ queryKey: ['agent-tasks', wallet] }); };
  const preview = useMutation({ mutationFn: () => agentTaskRequest<PlanPreview>(wallet, { operation: 'workspace_preview', agent_id: agentId, prompt, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
  const run = useMutation({ mutationFn: () => agentTaskRequest(wallet, { operation: 'create', agent_id: agentId, prompt, template_id: templateId, request_id: requestId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }), onSuccess: refresh });
  const template = useMutation({ mutationFn: () => agentTaskRequest(wallet, { operation: 'workspace_save_template', agent_id: agentId, name, prompt, published }), onSuccess: refresh });
  const review = useMutation({ mutationFn: ({ id, agent, approve }: { id: string; agent: string; approve: boolean }) => agentTaskRequest(wallet, { operation: approve ? 'workspace_approve' : 'workspace_reject', agent_id: agent, receipt_id: id }), onSettled: refresh });
  const reverse = useMutation({ mutationFn: ({ id, agent }: { id: string; agent: string }) => agentTaskRequest(wallet, { operation: 'workspace_reverse', agent_id: agent, receipt_id: id }), onSettled: refresh });
  const changePrompt = (text: string) => { setPrompt(text); setTemplateId(null); setRequestId(crypto.randomUUID()); preview.reset(); run.reset(); template.reset(); };
  const receipts = overview.data?.receipts.filter(receipt => (filter === 'all' || receipt.status === filter) && (!selected || receipt.agent_id === selected)) ?? [];
  return <section data-kit-section className="space-y-5 rounded-2xl border border-white/20 bg-black/35 p-5 text-white">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{t('agents.workspace.title', 'Agent workspace')}</h2><Button size="sm" variant="ghost" disabled={overview.isFetching} onClick={refresh}>{t('common.refresh', 'Refresh')}</Button></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries(counts).map(([key, count]) => <div key={key} className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-2xl font-semibold leading-none">{count}</p><p className="mt-2 text-sm leading-snug text-white/70">{t(`agents.workspace.count.${key}`, { defaultValue: key === 'pending' ? 'Drafts to review' : key === 'succeeded' ? 'Recent successes' : key === 'scheduled' ? 'Scheduled tasks' : 'Active agents' })}</p></div>)}</div>
    <p className="text-xs text-white/60">{t('agents.workspace.sample', 'Activity and alerts cover the latest 100 actions and 200 tasks. Counts are not lifetime totals or billing usage.')}</p>
    {overview.data?.alerts.length ? <details open className="group space-y-2 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4"><Summary>{t('agents.workspace.alerts', 'Needs attention')} ({overview.data.alerts.length})</Summary>{overview.data.alerts.map(alert => <p key={alert.id} role="alert" className="py-1 text-sm">{alert.message}</p>)}</details> : null}
    <label className={labelClass}>{t('agents.workspace.agent', 'Agent')}<FieldSelect disabled={!overview.data?.agents.length} value={agentId ?? ''} onChange={event => { setSelected(event.target.value); preview.reset(); run.reset(); report.reset(); setRequestId(crypto.randomUUID()); }}>{overview.data?.agents.map(agent => <option key={agent.id} value={agent.id}>@{agent.name}</option>)}{!overview.data?.agents.length && <option value="">{t('agents.tasks.createFirst')}</option>}</FieldSelect></label>
    {agentId && <Settings key={agentId} wallet={wallet} agentId={agentId} />}
    {agentId && <AgentModerationPanel key={`moderate-${agentId}`} wallet={wallet} agentId={agentId} refresh={refresh} />}
    <Button variant="outline" size="sm" disabled={!agentId || report.isPending} onClick={() => report.mutate()}>{t('agents.workspace.growth', 'Capture growth report')}</Button>
    {report.data && <p className="text-sm">{t('agents.workspace.growthResult', { defaultValue: '{{followers}} followers · {{following}} following', ...report.data })} · {report.data.follower_change === null ? t('agents.workspace.baseline', 'First snapshot; capture another later to compare.') : t('agents.workspace.growthChange', { defaultValue: 'Follower change: {{count}} since {{time}}', count: report.data.follower_change, time: new Date(report.data.previous_at!).toLocaleString() })}</p>}
    {report.error && <p role="alert">{report.error.message}</p>}
    <details className="group space-y-4 rounded-xl border border-white/15 bg-white/[0.03] p-4" open><Summary>{t('agents.workspace.library', 'Templates and task builder')}</Summary>
      <div className="grid gap-2 sm:grid-cols-2">{overview.data?.templates.filter(item => item.id !== 'growth').map(item => <div key={item.id} className="flex flex-col items-start gap-2 rounded-xl border border-white/15 bg-black/20 p-4"><Button size="sm" variant="outline" onClick={() => { changePrompt(item.prompt); setTemplateId(item.id); }}>{item.name}{item.published ? ' · ' + t('agents.workspace.shared', 'Shared') : ''}</Button><p className="text-xs text-white/70">{t('agents.workspace.runs', { defaultValue: '{{runs}} recent runs · {{completed}} completed · {{failed}} failed', runs: item.runs ?? 0, completed: item.completed ?? 0, failed: item.failed ?? 0 })}</p>{item.evaluation?.checked_at && <p className="text-xs text-white/70">{t('agents.workspace.planValidated', 'Plan validated')} · {item.evaluation.tools?.join(', ')}</p>}</div>)}</div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className={labelClass}>{t('agents.workspace.action', 'Action')}<FieldSelect value={action} onChange={event => setAction(event.target.value as BuilderAction)}>{BUILDER_ACTIONS.map(item => <option key={item} value={item}>{t(`agents.workspace.builder.${item}`, { defaultValue: item === 'news' ? 'React to news' : item === 'reply' ? 'Reply to recent posts' : item === 'curate' ? 'Like relevant posts' : 'Write a post' })}</option>)}</FieldSelect></label>
        <label className={labelClass}>{t('agents.workspace.subject', 'Topic or reply style')}<Input data-theme-control-surface className={`h-11 ${fieldClass}`} value={topic} maxLength={500} onChange={event => setTopic(event.target.value)} /></label>
        <label className={labelClass}>{t('agents.workspace.schedule', 'Schedule')}<FieldSelect disabled={action === 'reply'} value={action === 'reply' ? 'once' : cadence} onChange={event => setCadence(event.target.value)}>{['once', 'daily', ...(action === 'curate' ? [] : ['twice'])].map(item => <option key={item} value={item}>{t(`agents.workspace.cadence.${item}`, { defaultValue: item === 'once' ? 'Once' : item === 'daily' ? 'Daily' : 'Twice daily' })}</option>)}</FieldSelect></label>
      </div>
      <Button variant="outline" size="sm" disabled={!topic.trim()} onClick={() => changePrompt(buildAgentPrompt(action, topic, cadence))}>{t('agents.workspace.useBuilder', 'Use these instructions')}</Button>
      <p className="text-sm text-white/70">{t('agents.workspace.builderHelp', 'Choose a template, describe the action, audience and schedule, then simulate before running. Shared templates are instructions from their authors, not verified capabilities.')}</p>
      <Textarea data-theme-control-surface className={`min-h-28 ${fieldClass}`} aria-label={t('agents.tasks.instructions', 'Instructions')} placeholder={t('agents.tasks.examples')} value={prompt} maxLength={4000} onChange={event => changePrompt(event.target.value)} />
      <div className="flex flex-wrap gap-2"><Button disabled={!agentId || !prompt.trim() || preview.isPending} onClick={() => preview.mutate()}>{t('agents.workspace.simulate', 'Simulate plan')}</Button><Button variant="outline" disabled={!agentId || !prompt.trim() || run.isPending || run.isSuccess} onClick={() => run.mutate()}>{t('agents.tasks.run', 'Run task')}</Button></div>
      {preview.data && <div className="rounded-xl bg-white/5 p-3 text-sm"><p>{preview.data.plan.summary}</p><p>{preview.data.message}</p>{preview.data.checks.map((check, index) => <p key={index}>{check.tool} · {check.audience} · {check.permission ?? t('agents.workspace.allowed', 'Allowed')}</p>)}</div>}
      {run.isSuccess && <p role="status">{t('agents.tasks.queued', 'Task queued.')}</p>}
      {preview.data?.draft && <blockquote className="whitespace-pre-wrap rounded-xl bg-white/5 p-4">{preview.data.draft}</blockquote>}
      <Input data-theme-control-surface className={`h-11 ${fieldClass}`} aria-label={t('agents.workspace.templateName', 'Template name')} placeholder={t('agents.workspace.templateName', 'Template name')} value={name} maxLength={80} onChange={event => setName(event.target.value)} />
      <label className="flex items-center gap-2.5 text-sm text-white/85"><input type="checkbox" className="h-4 w-4 shrink-0 accent-white" checked={published} onChange={event => setPublished(event.target.checked)} />{t('agents.workspace.share', 'Share this template with other Agents users')}</label>
      <Button size="sm" variant="outline" disabled={!name.trim() || !prompt.trim() || template.isPending || template.isSuccess} onClick={() => template.mutate()}>{t('agents.workspace.saveTemplate', 'Save template')}</Button>
      {template.isSuccess && <p role="status">{t('agents.workspace.templateSaved', 'Template saved.')}</p>}
    </details>
    <details className="group space-y-4 rounded-xl border border-white/15 bg-white/[0.03] p-4"><Summary>{t('agents.workspace.history', 'Draft inbox and audit log')}</Summary>
      <FieldSelect wrapperClassName="w-full sm:w-56" aria-label={t('agents.workspace.filter', 'Filter activity')} value={filter} onChange={event => setFilter(event.target.value)}>{['all', 'draft', 'approval', 'succeeded', 'failed', 'uncertain', 'blocked', 'rejected'].map(status => <option key={status}>{status}</option>)}</FieldSelect>
      <p className="text-sm text-white/70">{t('agents.workspace.reversalHelp', "Reversals hide posts, permanently delete comments, restore reactions and profile text, or undo new follows. Views, delivered notifications, minted transactions, profile images and expired timeouts cannot be erased. Hidden posts remain recoverable from their visibility controls.")}</p>
      {!receipts.length && <p className="text-sm">{t('agents.workspace.empty', 'No matching activity yet.')}</p>}
      {receipts.map(receipt => <article key={receipt.id} className="space-y-2 rounded-xl border border-white/15 p-3 text-sm"><p>{receipt.tool} · {receipt.status} · {new Date(receipt.created_at).toLocaleString()}</p><pre className="whitespace-pre-wrap break-words font-sans">{JSON.stringify(receipt.arguments, null, 2)}</pre>{receipt.result?.error && <p>{receipt.result.error}</p>}{receipt.reversal && <Button size="sm" variant="outline" disabled={reverse.isPending} onClick={() => { if (window.confirm(receipt.reversal + '? ' + t('agents.workspace.confirmCorrection', 'This changes the published activity. Comment deletion cannot be undone.'))) reverse.mutate({ id: receipt.id, agent: receipt.agent_id }); }}>{receipt.reversal}</Button>}{receipt.rollback_status && <p>{t('agents.workspace.correction', 'Correction')}: {receipt.rollback_status}</p>}{receipt.alert_delivery && <p>{t('agents.workspace.alert', 'Alert')}: {receipt.alert_delivery}</p>}{['draft', 'approval'].includes(receipt.status) && <div className="flex gap-2"><Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ id: receipt.id, agent: receipt.agent_id, approve: true })}>{t('agents.workspace.approve', 'Approve and execute')}</Button><Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ id: receipt.id, agent: receipt.agent_id, approve: false })}>{t('agents.workspace.reject', 'Reject')}</Button></div>}</article>)}
    </details>
    {[overview.error, preview.error, run.error, template.error, review.error, reverse.error].filter(Boolean).map((error, index) => <p key={index} role="alert">{error?.message}</p>)}
  </section>;
}
