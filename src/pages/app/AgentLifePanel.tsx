import { Link } from 'react-router-dom';
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
  events: { kind: string; content: string | null; target: string | null; created_at: string }[];
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
  const life = useQuery({ queryKey: key, staleTime: 60000,
    queryFn: () => agentTaskRequest<AgentLife>(wallet, { operation: 'life', agent_id: agentId }) });
  const toggle = useMutation({
    mutationFn: (alive: boolean) => agentTaskRequest<AgentLife>(wallet, { operation: 'set_alive', agent_id: agentId, alive }),
    onSuccess: data => client.setQueryData(key, data),
  });
  const data = life.data;
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
    {data?.sentient && <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-white/50">{t('agents.life.recent')}</p>
      {data.events.length === 0 && <p className="text-sm text-white/60">{t('agents.life.empty')}</p>}
      <ul className="space-y-1">
        {data.events.slice(0, 6).map(event => <li key={`${event.kind}-${event.created_at}`} className="text-sm break-words">
          <span className="text-white/60">{clock(event.created_at)} · {t(`agents.life.kind.${event.kind}`, { defaultValue: event.kind })}</span>
          {event.content && event.kind !== 'error' && <> {event.kind === 'post' && event.target
            ? <Link to={`/app/post/${event.target}`} className="hover:underline">{event.content}</Link>
            : event.content}</>}
        </li>)}
      </ul>
    </div>}
  </section>;
}
