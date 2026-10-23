import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { twitchMirror } from '@/lib/api/dehub/twitch-mirror';
import { SETTINGS_CONTROL_CLASS } from './SettingsRow';
import { useAuth } from '@/contexts/AuthContext';

export function TwitchMirrorSettings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const status = useQuery({ queryKey: ['twitch-mirror', user?.address], queryFn: twitchMirror.status, enabled: !!user?.address, staleTime: 10_000 });
  const data = status.data;
  const action = async (run: () => Promise<unknown>) => {
    setBusy(true);
    try { await run(); await status.refetch(); }
    catch { toast.error(t('twitchMirror.failed')); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4">
    <p className="text-sm text-zinc-400">{t('twitchMirror.intro')}</p>
    {status.isPending ? <p className="text-sm text-zinc-400">{t('common.loading')}</p> : status.isError ?
      <p role="alert" className="text-sm text-zinc-400">{t('twitchMirror.failed')}</p> :
      !data?.available ? <p className="text-sm text-zinc-400">{t('twitchMirror.unavailable')}</p> : null}
    {data?.connected ? <>
      <p className="text-sm text-white">{data.displayName || data.login}</p>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="twitch-auto-mirror" className="text-sm text-white">{t('twitchMirror.auto')}</label>
        <Switch id="twitch-auto-mirror" checked={data.enabled} disabled={busy || (!data.available && !data.enabled)}
          onCheckedChange={enabled => void action(() => twitchMirror.enable(enabled))} />
      </div>
      <p role="status" className="text-sm text-zinc-400">{t(data.live ? 'twitchMirror.live' : data.state === 'error' ? 'twitchMirror.error' :
        data.state === 'starting' ? 'twitchMirror.starting' : data.enabled ? 'twitchMirror.waiting' : 'twitchMirror.disabled')}</p>
      {data.lastError ? <p className="text-sm text-zinc-400">{data.lastError}</p> : null}
      <div className="flex flex-wrap gap-2">
        {data.postUrl && data.live ? <Button asChild className={SETTINGS_CONTROL_CLASS}><a href={data.postUrl}>{t('twitchMirror.open')}</a></Button> : null}
        {data.enabled && data.state === 'error' ? <Button className={SETTINGS_CONTROL_CLASS} disabled={busy || !data.available}
          onClick={() => void action(() => twitchMirror.enable(true))}>{t('twitchMirror.retry')}</Button> : null}
        <Button className={SETTINGS_CONTROL_CLASS} disabled={busy} onClick={() => void action(twitchMirror.disconnect)}>{t('twitchMirror.disconnect')}</Button>
      </div>
    </> : <>
      <p className="text-sm text-zinc-400">{t('twitchMirror.consent')}</p>
      <Button className={SETTINGS_CONTROL_CLASS} disabled={busy || !data?.available}
        onClick={() => void action(async () => { window.location.assign(await twitchMirror.connect()); })}>{t('twitchMirror.connect')}</Button>
    </>}
    <Button className={SETTINGS_CONTROL_CLASS} disabled={busy || status.isFetching} onClick={() => void status.refetch()}>{t('twitchMirror.refresh')}</Button>
  </div>;
}
