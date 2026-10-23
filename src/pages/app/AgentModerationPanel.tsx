import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { agentTaskRequest } from '@/lib/agent-tasks';

export function AgentModerationPanel({ wallet, agentId, refresh }: { wallet: string; agentId: string; refresh: () => void }) {
  const { t } = useTranslation();
  const [post, setPost] = useState('');
  const [target, setTarget] = useState('');
  const [seconds, setSeconds] = useState('300');
  const action = useMutation({ mutationFn: () => agentTaskRequest<{ message?: string }>(wallet, { operation: 'workspace_moderate', agent_id: agentId, arguments: { token_id: post, target_wallet: target, seconds: Number(seconds) } }), onSettled: refresh });
  return <details className="space-y-3 rounded-xl border border-white/15 p-4">
    <summary>{t('agents.workspace.moderation', "Stream moderation")}</summary>
    <p className="text-sm text-white/70">{t('agents.workspace.moderationHelp', "Enable moderation permission first. The account must already be the stream creator or an assigned moderator. Approval and draft modes still apply. Timeouts expire automatically.")}</p>
    <Input aria-label={t('agents.workspace.streamId', "Stream post ID")} placeholder={t('agents.workspace.streamId', "Stream post ID")} value={post} onChange={e => setPost(e.target.value)} />
    <Input aria-label={t('agents.workspace.participant', "Participant wallet")} placeholder={t('agents.workspace.participantHint', "Participant wallet (0x…)")} value={target} onChange={e => setTarget(e.target.value)} />
    <Input aria-label={t('agents.workspace.timeout', "Timeout seconds")} type="number" min={30} max={3600} value={seconds} onChange={e => setSeconds(e.target.value)} />
    <Button disabled={action.isPending || !/^\d+$/.test(post) || !/^0x[0-9a-f]{40}$/i.test(target) || Number(seconds) < 30 || Number(seconds) > 3600} onClick={() => action.mutate()}>{t('agents.workspace.submitTimeout', "Submit timeout")}</Button>
    {action.data && <p role="status">{action.data.message ?? t('agents.workspace.handled', "Request handled. See the audit log.")}</p>}
    {action.error && <p role="alert">{action.error.message}</p>}
  </details>;
}
