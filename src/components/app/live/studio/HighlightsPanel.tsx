/**
 * Live Studio's highlights: the moments the room went off, cut automatically,
 * waiting for the streamer to approve — plus the clips viewers have posted.
 *
 * While the creator is on air the panel asks the function to look for a chat
 * or gift spike every minute (it only cuts when one is happening, and never two
 * within two minutes). Once the stream has ended and its replay is ready, one
 * more pass picks the best moments of the whole broadcast. Approving opens the
 * same editor a viewer gets; the Short is posted from the streamer's account.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageSection } from '@/components/app/page-kit/PageKit';
import { apiCall } from '@/lib/api/dehub/core';
import { detectHighlights, dismissLiveClip, listLiveClips, type LiveClip } from '@/lib/api/live-clips';
import { ClipEditorSheet } from '../ClipEditorSheet';

interface Props {
  address: string | null | undefined;
}

interface Target {
  tokenId: string;
  live: boolean;
}

/** The creator's stream on air now, else their last finished one. */
interface StreamRow {
  tokenId?: number | string | null;
  status?: string;
  isTest?: boolean;
}

async function currentStream(address: string): Promise<Target | null> {
  const res = await apiCall<StreamRow[] | { result?: StreamRow[] }>(`/api/live/user/${encodeURIComponent(address)}`);
  const list = Array.isArray(res) ? res : Array.isArray(res?.result) ? res.result : [];
  const rows = list.filter((s) => !s?.isTest && s?.tokenId != null);
  const status = (s: StreamRow) => String(s?.status || '').toUpperCase();
  const pick = rows.find((s) => status(s) === 'LIVE') ?? rows.find((s) => status(s) === 'ENDED');
  return pick ? { tokenId: String(pick.tokenId), live: status(pick) === 'LIVE' } : null;
}

const PENDING: LiveClip['status'][] = ['capturing', 'draft', 'rendering', 'ready'];

const at = (s: number | null) => {
  if (s == null) return '';
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${t % 60}s`;
};

export function HighlightsPanel({ address }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<LiveClip | null>(null);

  const target = useQuery({
    queryKey: ['live-clips-target', address],
    queryFn: () => currentStream(address!),
    enabled: !!address,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const tokenId = target.data?.tokenId ?? null;
  const live = !!target.data?.live;

  const clips = useQuery({
    queryKey: ['live-clips', tokenId],
    queryFn: () => listLiveClips(tokenId!, true),
    enabled: !!tokenId,
    refetchInterval: 20_000,
  });

  // On air: look for a spike every minute. Ended: one pass over the replay.
  useEffect(() => {
    if (!tokenId) return;
    let cancelled = false;
    const run = () =>
      detectHighlights(tokenId)
        .then((created) => {
          if (cancelled || !created) return;
          queryClient.invalidateQueries({ queryKey: ['live-clips', tokenId] });
          toast.success(t('liveClips.newHighlight', 'New highlight ready to review'));
        })
        .catch(() => undefined);
    run();
    if (!live) return () => { cancelled = true; };
    const timer = setInterval(run, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [tokenId, live, queryClient, t]);

  const reasonLabel = (reason: string) =>
    reason === 'gifts'
      ? t('liveClips.reasonGifts', 'gift spike')
      : reason === 'chat and gifts'
        ? t('liveClips.reasonBoth', 'chat and gift spike')
        : t('liveClips.reasonChat', 'chat spike');

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['live-clips', tokenId] });

  const dismiss = async (clip: LiveClip) => {
    try {
      await dismissLiveClip(clip.id);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!address || target.isLoading) return null;

  const all = clips.data ?? [];
  const highlights = all.filter((c) => c.kind === 'highlight' && PENDING.includes(c.status));
  const posted = all.filter((c) => c.status === 'posted');

  return (
    <PageSection title={t('liveClips.panelTitle', 'Highlights and clips')}>
      <p className="mb-3 text-xs text-zinc-500">
        {live
          ? t('liveClips.panelLive', 'While you are live, moments where chat or gifts spike are clipped for you here. Keep this page open.')
          : t('liveClips.panelEnded', 'The best moments of your last stream, found from chat and gifts. Approve one to post it to Shorts.')}
      </p>

      {!tokenId ? (
        <p className="text-sm text-zinc-500">{t('liveClips.noStream', 'Go live to start collecting highlights.')}</p>
      ) : clips.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
      ) : (
        <div className="space-y-4">
          {highlights.length === 0 ? (
            <p className="text-sm text-zinc-500">{t('liveClips.noHighlights', 'No highlights yet.')}</p>
          ) : (
            <ul className="space-y-2">
              {highlights.map((c) => (
                <li key={c.id} className="flex items-center gap-3 rounded-lg bg-zinc-800/60 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-white">{c.title || c.streamTitle}</div>
                    <div className="text-xs text-zinc-400">
                      {at(c.broadcastOffset)}
                      {c.reason ? ` · ${reasonLabel(c.reason)}` : ''}
                      {c.status === 'capturing' ? ` · ${t('liveClips.grabbing', 'grabbing…')}` : ''}
                    </div>
                  </div>
                  <Button size="sm" disabled={c.status === 'capturing'} onClick={() => setEditing(c)}>
                    {c.status === 'ready' ? t('liveClips.post', 'Post') : t('liveClips.review', 'Review')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => dismiss(c)} disabled={c.status === 'rendering' || c.status === 'ready'}>
                    {t('liveClips.dismiss', 'Dismiss')}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {posted.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                {t('liveClips.postedCount', '{{count}} clips posted', { count: posted.length })}
              </div>
              <ul className="space-y-1.5">
                {posted.slice(0, 10).map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-sm">
                    <Link to={`/clip/${c.shortId}`} className="min-w-0 flex-1 truncate text-white hover:underline">
                      {c.title || c.streamTitle}
                    </Link>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {c.kind === 'highlight' || !c.clipperUsername ? t('liveClips.byYou', 'by you') : `@${c.clipperUsername}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <ClipEditorSheet
        clip={editing}
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            refresh();
          }
        }}
      />
    </PageSection>
  );
}
