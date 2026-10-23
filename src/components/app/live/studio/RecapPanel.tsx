/**
 * Live Studio's stream recap: what happened on the creator's last stream —
 * or the one they just ended, when Go Live sends them here with `?recap=`.
 *
 * Every figure is a trusted one from the stream API: gifts only once the chain
 * paid them, followers who followed during the broadcast.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageSection } from '@/components/app/page-kit/PageKit';
import { buildAvatarUrl } from '@/lib/media-url';
import { formatDuration, getLastEndedStreamId, getStreamRecap, type StreamRecap } from '@/lib/api/dehub/stream-recap';

interface Props {
  /** The creator's address, to find their last finished stream. */
  address: string | null | undefined;
  /** A stream to recap instead, e.g. the one just ended. */
  streamId?: string | null;
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-zinc-800/60 px-3 py-2.5">
      <div className="text-lg font-semibold tabular-nums text-white">{value}</div>
      <div className="text-xs text-zinc-400">{label}</div>
    </div>
  );
}

const whole = (n: number) => Math.round(n).toLocaleString();

export function RecapPanel({ address, streamId }: Props) {
  const { t } = useTranslation();
  const sectionRef = useRef<HTMLDivElement>(null);

  const target = useQuery({
    queryKey: ['stream-recap-target', address, streamId ?? null],
    queryFn: async () => streamId || (await getLastEndedStreamId(address || '')),
    enabled: !!(streamId || address),
    staleTime: 60_000,
  });
  const id = target.data ?? null;
  const recap = useQuery<StreamRecap>({
    queryKey: ['stream-recap', id],
    queryFn: () => getStreamRecap(id!),
    enabled: !!id,
    staleTime: 30_000,
    // The stream just ended: gifts can still be confirming for a minute or two.
    refetchInterval: (q) => (q.state.data && !q.state.data.endedAt ? 30_000 : false),
  });

  // Sent here straight from ending a stream: bring the recap into view.
  useEffect(() => {
    if (streamId && recap.data) sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [streamId, recap.data]);

  if (!streamId && !target.isLoading && !id) return null;

  const r = recap.data;
  const share = async () => {
    if (!r) return;
    const url = r.tokenId != null ? `https://dehub.io/app/post/${r.tokenId}` : 'https://dehub.io';
    const text = t('liveRecap.shareText', {
      title: r.title || t('liveRecap.untitled'),
      duration: formatDuration(r.durationSec),
      peak: whole(r.peakViewers),
      followers: whole(r.newFollowers),
    });
    try {
      if (navigator.share) {
        await navigator.share({ title: r.title || t('liveRecap.title'), text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast.success(t('liveRecap.copied'));
    } catch {
      /* the share sheet was dismissed */
    }
  };

  return (
    <div ref={sectionRef}>
      <PageSection
        title={streamId ? t('liveRecap.justEnded') : t('liveRecap.lastStream')}
        action={
          r ? (
            <Button size="sm" variant="outline" onClick={() => void share()}>
              <Share2 className="mr-1 h-4 w-4" />
              {t('liveRecap.share')}
            </Button>
          ) : null
        }
      >
        {target.isLoading || recap.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
        ) : recap.isError || !r ? (
          <p className="text-sm text-zinc-400">{t('liveRecap.loadFailed')}</p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="truncate text-sm font-medium text-white">{r.title || t('liveRecap.untitled')}</p>
              {r.startedAt && (
                <p className="text-xs text-zinc-500">
                  {new Date(r.startedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label={t('liveRecap.duration')} value={formatDuration(r.durationSec)} />
              <Stat label={t('liveRecap.peakViewers')} value={whole(r.peakViewers)} />
              <Stat label={t('liveRecap.gifts', { count: r.tips.count })} value={`${whole(r.tips.total)} DHB`} />
              <Stat label={t('liveRecap.newFollowers')} value={whole(r.newFollowers)} />
              <Stat label={t('liveRecap.chatMessages')} value={whole(r.chat.messages)} />
              <Stat label={t('liveRecap.chatters')} value={whole(r.chat.chatters)} />
              <Stat label={t('liveRecap.reactions')} value={whole(r.reactions)} />
              {r.shares != null && <Stat label={t('liveRecap.shares')} value={whole(r.shares)} />}
            </div>

            {r.topTippers.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">{t('liveRecap.topSupporters')}</h3>
                <ol className="space-y-1.5">
                  {r.topTippers.map((p, i) => (
                    <li key={p.address} className="flex items-center gap-3 text-sm">
                      <span className="w-4 text-center text-zinc-500">{i + 1}</span>
                      <img src={buildAvatarUrl(p.address, p.avatarImageUrl)} alt="" className="h-7 w-7 rounded-full object-cover" loading="lazy" />
                      <span className="min-w-0 flex-1 truncate text-white">{p.displayName || p.username || `${p.address.slice(0, 6)}…`}</span>
                      <span className="tabular-nums text-zinc-300">{`${whole(p.total)} DHB`}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {r.polls.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">{t('liveRecap.polls')}</h3>
                <ul className="space-y-3">
                  {r.polls.map((p, i) => {
                    const top = Math.max(0, ...p.options.map((o) => o.votes));
                    return (
                      <li key={i}>
                        <p className="mb-1 text-sm text-white">{p.question}</p>
                        <p className="text-xs text-zinc-400">
                          {p.options.map((o) => `${o.text} ${o.votes}`).join(' · ')}
                          {top > 0 && ` — ${t('liveRecap.pollWinner', { option: p.options.find((o) => o.votes === top)?.text })}`}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {!r.endedAt && <p className="text-xs text-zinc-500">{t('liveRecap.stillCounting')}</p>}
          </div>
        )}
      </PageSection>
    </div>
  );
}
