import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { getAgentWelcomeLog, getAgentWelcomes, setAgentWelcome, type AgentWelcome, type AgentWelcomeList } from '@/lib/api/dehub/agent-welcome';

const AGENT_WELCOMES_KEY = ['agent-welcomes'] as const;

/**
 * "Welcome new members": this agent follows and/or messages people who just
 * joined, up to a daily number. Every limit lives on the server; this only
 * switches and shows what it did.
 */
export function AgentWelcomePanel({ agentName }: { agentName: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const list = useQuery({ queryKey: AGENT_WELCOMES_KEY, queryFn: getAgentWelcomes, staleTime: 60_000, retry: 1 });
  const agent = list.data?.agents.find(a => a.username?.toLowerCase() === agentName.toLowerCase());
  const [text, setText] = useState('');
  const [showLog, setShowLog] = useState(false);
  const defaultText = t('agents.welcome.defaultText');
  useEffect(() => { if (agent) setText(agent.text || defaultText); }, [agent?.address, agent?.text]);

  const save = useMutation({
    mutationFn: (change: Partial<Pick<AgentWelcome, 'follow' | 'message' | 'text' | 'perDay'>>) => setAgentWelcome(agent!.address, change),
    onSuccess: updated => client.setQueryData<AgentWelcomeList>(AGENT_WELCOMES_KEY, old => old && ({ ...old, agents: old.agents.map(a => a.address === updated.address ? updated : a) })),
  });
  const log = useQuery({ queryKey: ['agent-welcome-log', agent?.address], queryFn: () => getAgentWelcomeLog(agent!.address), enabled: showLog && !!agent, staleTime: 30_000 });

  // Agents made before accounts carried their owner, or a signed-out view: nothing to switch.
  if (!agent) return null;
  const max = list.data?.limits.maxPerDay ?? 10;
  const pending = save.isPending ? save.variables : undefined;
  const follow = pending?.follow ?? agent.follow;
  const message = pending?.message ?? agent.message;
  const perDay = pending?.perDay ?? agent.perDay;
  const id = `welcome-${agent.address}`;
  const textChanged = text.trim() !== (agent.text || '').trim();

  return <section className="mb-4 space-y-3 rounded-xl border border-white/10 p-3" aria-labelledby={id} data-agent-welcome>
    <div>
      <h3 id={id} className="font-medium">{t('agents.welcome.title')}</h3>
      <p className="text-xs text-white/60">{t('agents.welcome.help')}</p>
    </div>
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{t('agents.welcome.follow')}</span>
      <Switch checked={follow} disabled={save.isPending} onCheckedChange={value => save.mutate({ follow: value })} />
    </label>
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{t('agents.welcome.message')}</span>
      <Switch checked={message} disabled={save.isPending}
        onCheckedChange={value => save.mutate(value ? { message: true, text: text.trim() || defaultText } : { message: false })} />
    </label>
    {message && <form className="space-y-2" onSubmit={e => { e.preventDefault(); save.mutate({ text: text.trim() }); }}>
      <textarea aria-label={t('agents.welcome.text')} maxLength={list.data?.limits.maxText ?? 500} value={text} disabled={save.isPending}
        onChange={e => { setText(e.target.value); save.reset(); }}
        className="w-full min-h-20 rounded-xl border border-white/20 bg-white/5 p-3 text-sm text-inherit backdrop-blur-xl" />
      <p className="text-xs text-white/60">{t('agents.welcome.textHelp')}</p>
      {textChanged && <button type="submit" className="text-sm underline" disabled={save.isPending || !text.trim()}>{t('agents.welcome.saveText')}</button>}
    </form>}
    <div className="flex items-center justify-between gap-3 text-sm">
      <span>{t('agents.welcome.perDay')}</span>
      <div className="flex items-center gap-2" role="group" aria-label={t('agents.welcome.perDay')}>
        <button type="button" className="h-8 w-8 rounded-full border border-white/20 disabled:opacity-40" aria-label={t('agents.welcome.fewer')}
          disabled={save.isPending || perDay <= 1} onClick={() => save.mutate({ perDay: perDay - 1 })}>−</button>
        <span className="min-w-6 text-center tabular-nums" aria-live="polite">{perDay}</span>
        <button type="button" className="h-8 w-8 rounded-full border border-white/20 disabled:opacity-40" aria-label={t('agents.welcome.more')}
          disabled={save.isPending || perDay >= max} onClick={() => save.mutate({ perDay: perDay + 1 })}>+</button>
      </div>
    </div>
    {(follow || message) && <p className="text-sm text-white/80">{t('agents.welcome.today', { follows: agent.today.follows, messages: agent.today.messages })}</p>}
    <p className="text-xs text-white/50">{t('agents.welcome.limits')}</p>
    {save.error && <p role="alert" className="text-sm break-words">{save.error.message}</p>}
    <button type="button" className="text-sm underline" aria-expanded={showLog} onClick={() => setShowLog(!showLog)}>
      {t(showLog ? 'agents.welcome.hideLog' : 'agents.welcome.showLog')}</button>
    {showLog && <div className="space-y-1">
      {log.isLoading && <p className="text-sm text-white/60">{t('common.loading', { defaultValue: 'Loading…' })}</p>}
      {log.data?.length === 0 && <p className="text-sm text-white/60">{t('agents.welcome.empty')}</p>}
      <ul className="space-y-1">
        {log.data?.map(entry => <li key={`${entry.kind}-${entry.target.address}`} className="text-sm break-words">
          <span className="text-white/60">{new Date(entry.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · </span>
          {t(`agents.welcome.${entry.status === 'done' ? entry.kind === 'follow' ? 'followed' : 'messaged' : entry.status}`)}{' '}
          {entry.target.username
            ? <Link to={`/${encodeURIComponent(entry.target.username)}`} className="hover:underline">@{entry.target.username}</Link>
            : entry.target.address.slice(0, 8)}
          {entry.reason && <span className="text-white/60"> · {entry.reason}</span>}
        </li>)}
      </ul>
    </div>}
  </section>;
}
