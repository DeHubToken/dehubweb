/**
 * A posted live clip, /clip/<n>: the vertical video, who streamed it, who
 * clipped it, and the way to the Short and the stream it came from.
 *
 * Crawlers never see this: the edge worker answers /clip/<n> with the clip's
 * own title, share card and og:video from the same row.
 */
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SEOHead } from '@/components/SEOHead';
import { DeHubPageLoader } from '@/components/app/DeHubLoader';
import { supabase } from '@/integrations/supabase/client';

interface PublicClip {
  short_id: number;
  title: string;
  stream_title: string;
  stream_token_id: number;
  streamer_username: string | null;
  clipper_username: string | null;
  kind: 'viewer' | 'highlight';
  video_url: string | null;
  poster_url: string | null;
  card_url: string | null;
  duration_seconds: number | null;
  post_token_id: number | null;
  posted_at: string | null;
}

// Only the columns the anon role is granted; `*` is refused.
const COLUMNS = 'short_id, title, stream_title, stream_token_id, streamer_username, clipper_username, kind, video_url, poster_url, card_url, duration_seconds, post_token_id, posted_at';

async function loadClip(n: string): Promise<PublicClip | null> {
  if (!/^\d{1,15}$/.test(n)) return null;
  // The generated types do not know this table yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('live_clips').select(COLUMNS).eq('short_id', Number(n)).eq('status', 'posted').maybeSingle();
  if (error) throw error;
  return (data as PublicClip) ?? null;
}

export default function ClipPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { data: clip, isLoading } = useQuery({ queryKey: ['live-clip-page', id], queryFn: () => loadClip(id) });

  if (isLoading) return <DeHubPageLoader />;

  if (!clip) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center text-white">
        <SEOHead title={t('liveClips.notFoundTitle', 'Clip not found — DeHub')} noindex noCanonical />
        <p className="text-sm text-zinc-400">{t('liveClips.notFound', 'This clip is not available.')}</p>
        <Button asChild variant="secondary"><Link to="/shorts">{t('liveClips.browseShorts', 'Browse Shorts')}</Link></Button>
      </div>
    );
  }

  const streamer = clip.streamer_username ? `@${clip.streamer_username}` : t('liveClips.aStreamer', 'a DeHub streamer');
  const title = clip.title || clip.stream_title || t('liveClips.title', 'Clip');
  const description = clip.kind === 'viewer' && clip.clipper_username
    ? t('liveClips.seoDescriptionBy', 'A clip from {{streamer}}\'s live stream on DeHub, clipped by @{{clipper}}.', { streamer, clipper: clip.clipper_username })
    : t('liveClips.seoDescription', 'A clip from {{streamer}}\'s live stream on DeHub.', { streamer });

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6 text-white">
      <SEOHead
        title={`${title} — ${t('liveClips.seoSuffix', 'Clip on DeHub')}`}
        description={description}
        image={clip.card_url ?? undefined}
        url={`https://dehub.io/clip/${clip.short_id}`}
        type="video.other"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'VideoObject',
          name: title,
          description,
          thumbnailUrl: clip.poster_url ?? clip.card_url ?? undefined,
          contentUrl: clip.video_url ?? undefined,
          uploadDate: clip.posted_at ?? undefined,
          ...(clip.duration_seconds ? { duration: `PT${Math.round(clip.duration_seconds)}S` } : {}),
        }}
      />
      {clip.video_url && (
        <video
          src={clip.video_url}
          poster={clip.poster_url ?? undefined}
          className="mx-auto aspect-[9/16] max-h-[70vh] w-full rounded-xl bg-black object-contain"
          playsInline
          autoPlay
          muted
          loop
          controls
        />
      )}
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-zinc-400">
          {clip.kind === 'viewer' && clip.clipper_username
            ? t('liveClips.creditBy', 'From {{streamer}}\'s live · clipped by @{{clipper}}', { streamer, clipper: clip.clipper_username })
            : t('liveClips.credit', 'From {{streamer}}\'s live', { streamer })}
        </p>
      </div>
      <div className="flex gap-2">
        {clip.post_token_id != null && (
          <Button asChild className="flex-1"><Link to={`/post/${clip.post_token_id}`}>{t('liveClips.viewShort', 'View Short')}</Link></Button>
        )}
        <Button asChild variant="secondary" className="flex-1">
          <Link to={`/post/${clip.stream_token_id}`}>{t('liveClips.watchStream', 'Watch the stream')}</Link>
        </Button>
      </div>
    </div>
  );
}
