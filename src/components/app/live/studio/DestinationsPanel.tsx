/**
 * Live Studio's multistream destinations: go live once on DeHub and the
 * broadcast is pushed to every platform switched on here — Twitch, YouTube,
 * Kick, X, Facebook, TikTok or any RTMP server.
 *
 * Stream keys are sent once and stay on the server; a row only ever shows the
 * last four characters. The list refreshes every few seconds so each row's
 * light follows what the relay is actually doing.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageSection } from '@/components/app/page-kit/PageKit';
import { cn } from '@/lib/utils';
import {
  DESTINATION_PLATFORMS,
  DESTINATION_PRESETS,
  addDestination,
  listDestinations,
  removeDestination,
  updateDestination,
  type DestinationPlatform,
  type DestinationState,
  type StreamDestination,
} from '@/lib/api/dehub/live-destinations';

const QUERY_KEY = ['live-destinations'];

const DOT: Record<DestinationState, string> = {
  off: 'bg-zinc-600',
  idle: 'bg-zinc-500',
  connecting: 'bg-amber-400 animate-pulse',
  live: 'bg-emerald-400',
  error: 'bg-red-500',
};

const host = (server: string) => {
  try {
    return new URL(server).host;
  } catch {
    return server;
  }
};

export function DestinationsPanel({ address }: { address: string | null | undefined }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: listDestinations,
    enabled: !!address,
    refetchInterval: 5_000,
  });

  const replaceRow = (row: StreamDestination) =>
    queryClient.setQueryData<StreamDestination[]>(QUERY_KEY, (prev = []) => prev.map((r) => (r.id === row.id ? row : r)));

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => updateDestination(id, { enabled }),
    onSuccess: replaceRow,
    onError: (e: Error) => toast.error(e.message || t('liveStudio.destinations.saveFailed')),
  });

  const remove = useMutation({
    mutationFn: removeDestination,
    onSuccess: (_, id) =>
      queryClient.setQueryData<StreamDestination[]>(QUERY_KEY, (prev = []) => prev.filter((r) => r.id !== id)),
    onError: (e: Error) => toast.error(e.message || t('liveStudio.destinations.saveFailed')),
  });

  return (
    <PageSection
      title={t('liveStudio.destinations.title')}
      action={
        !adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t('liveStudio.destinations.add')}
          </Button>
        )
      }
    >
      <p className="mb-3 text-xs text-zinc-500">{t('liveStudio.destinations.intro')}</p>

      {adding && (
        <AddDestination
          onCancel={() => setAdding(false)}
          onAdded={(row) => {
            queryClient.setQueryData<StreamDestination[]>(QUERY_KEY, (prev = []) => [...prev, row]);
            setAdding(false);
          }}
        />
      )}

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
      ) : rows.length === 0 ? (
        !adding && <p className="text-sm text-zinc-500">{t('liveStudio.destinations.empty')}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-zinc-800/60">
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', DOT[row.state] ?? DOT.idle)} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">
                  {row.label || DESTINATION_PRESETS[row.platform]?.name || row.platform}
                  <span className="ml-2 text-xs text-zinc-500">{t(`liveStudio.destinations.states.${row.state}`)}</span>
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {host(row.server)} · {row.keyHint}
                </p>
                {row.state === 'error' && row.lastError && <p className="text-xs text-red-400">{row.lastError}</p>}
              </div>
              <Switch
                checked={row.enabled}
                onCheckedChange={(enabled) => toggle.mutate({ id: row.id, enabled })}
                aria-label={t('liveStudio.destinations.toggle')}
              />
              <button
                onClick={() => remove.mutate(row.id)}
                aria-label={t('liveStudio.remove')}
                className="rounded-md p-1 text-zinc-500 hover:bg-zinc-700 hover:text-white"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </PageSection>
  );
}

function AddDestination({ onCancel, onAdded }: { onCancel: () => void; onAdded: (row: StreamDestination) => void }) {
  const { t } = useTranslation();
  const [platform, setPlatform] = useState<DestinationPlatform>('twitch');
  const [server, setServer] = useState(DESTINATION_PRESETS.twitch.server);
  const [streamKey, setStreamKey] = useState('');
  const [label, setLabel] = useState('');
  const preset = DESTINATION_PRESETS[platform];

  const save = useMutation({
    mutationFn: () => addDestination({ platform, server: server.trim(), streamKey: streamKey.trim(), label: label.trim() }),
    onSuccess: (row) => {
      toast.success(t('liveStudio.destinations.added', { name: preset.name }));
      onAdded(row);
    },
    onError: (e: Error) => toast.error(e.message || t('liveStudio.destinations.saveFailed')),
  });

  const pick = (next: DestinationPlatform) => {
    setPlatform(next);
    setServer(DESTINATION_PRESETS[next].server);
  };

  return (
    <form
      className="mb-4 space-y-3 rounded-lg border border-zinc-700 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-zinc-400">
          <span>{t('liveStudio.destinations.platform')}</span>
          <Select value={platform} onValueChange={(v) => pick(v as DestinationPlatform)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DESTINATION_PLATFORMS.map((p) => (
                <SelectItem key={p} value={p}>
                  {DESTINATION_PRESETS[p].name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-xs text-zinc-400">
          <span>{t('liveStudio.destinations.label')}</span>
          <Input value={label} maxLength={60} placeholder={preset.name} onChange={(e) => setLabel(e.target.value)} />
        </label>
      </div>
      <label className="block space-y-1 text-xs text-zinc-400">
        <span>{t('liveStudio.destinations.server')}</span>
        <Input
          value={server}
          required
          placeholder="rtmp://…"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setServer(e.target.value)}
        />
      </label>
      <label className="block space-y-1 text-xs text-zinc-400">
        <span>{t('liveStudio.destinations.key')}</span>
        <Input
          type="password"
          value={streamKey}
          required
          autoComplete="new-password"
          spellCheck={false}
          onChange={(e) => setStreamKey(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {preset.keyUrl ? (
          <a
            href={preset.keyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
          >
            {t('liveStudio.destinations.findKey', { name: preset.name })}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-xs text-zinc-500">{t('liveStudio.destinations.customHint')}</span>
        )}
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            {t('liveStudio.destinations.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={save.isPending || !server.trim() || !streamKey.trim()}>
            {save.isPending ? t('liveStudio.saving') : t('liveStudio.destinations.save')}
          </Button>
        </div>
      </div>
      <p className="text-xs text-zinc-500">{t('liveStudio.destinations.keyNote')}</p>
    </form>
  );
}
