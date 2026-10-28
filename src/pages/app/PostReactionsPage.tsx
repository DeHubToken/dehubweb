/**
 * /app/post/:postId/reactions — every reaction to a DeHub video: recorded
 * reaction posts and live streams that put it on screen. Newest first.
 */
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, MonitorPlay, Radio } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { getNFTInfo } from '@/lib/api/dehub';
import { buildImageUrl } from '@/lib/media-url';
import { getRemixCounts, listRemixes, type RemixLink } from '@/lib/remix-links';

function ReactionRow({ link }: { link: RemixLink }) {
  const { t } = useTranslation();
  const postId = link.remixTokenId ?? link.streamTokenId;
  const { data: post } = useQuery({
    queryKey: ['nft-info', String(postId)],
    queryFn: () => getNFTInfo(String(postId)),
    enabled: !!postId,
    staleTime: 5 * 60_000,
  });
  const thumb = post ? buildImageUrl(postId!, post.thumbnail_url || post.imageUrl, 480) : '';
  const name = link.remixerUsername ? `@${link.remixerUsername}` : `${link.remixerAddress.slice(0, 6)}…`;
  return (
    <li>
      <Link to={`/app/post/${postId}`} className="flex gap-3 rounded-xl p-2 hover:bg-white/5">
        <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-lg bg-white/5">
          {thumb && <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />}
          {link.kind === 'react_live' && (
            <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              <Radio className="h-3 w-3" aria-hidden="true" />
              {link.active ? t('reactions.liveNow', 'Live') : t('reactions.wasLive', 'Was live')}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium text-white">{post?.name || t('reactions.untitled', 'Reaction')}</p>
          <p className="mt-1 text-xs text-white/60">{name}</p>
          <p className="text-xs text-white/40">{new Date(link.createdAt).toLocaleDateString()}</p>
        </div>
      </Link>
    </li>
  );
}

export default function PostReactionsPage() {
  const { postId = '' } = useParams();
  const { t } = useTranslation();
  const { data: original } = useQuery({
    queryKey: ['nft-info', postId],
    queryFn: () => getNFTInfo(postId),
    enabled: /^\d+$/.test(postId),
    staleTime: 5 * 60_000,
  });
  const reactions = useInfiniteQuery({
    queryKey: ['reactions', postId],
    queryFn: ({ pageParam }) => listRemixes(postId, 'react', pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
    enabled: /^\d+$/.test(postId),
  });
  const { data: counts } = useQuery({
    queryKey: ['remix-counts', postId],
    queryFn: () => getRemixCounts([postId]),
    enabled: /^\d+$/.test(postId),
  });
  const rows = reactions.data?.pages.flatMap((p) => p.links) ?? [];
  const total = counts?.[postId]?.reactions ?? rows.length;
  const title = original?.name?.trim() || t('reactions.thisVideo', 'this video');
  const creator = original?.mintername || original?.minterUsername;
  const url = `https://dehub.io/app/post/${postId}/reactions`;
  const image = original ? buildImageUrl(postId, original.thumbnail_url || original.imageUrl, 1200) : undefined;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-4 text-white">
      <SEOHead
        title={t('reactions.pageTitle', { title, defaultValue: 'Reactions to {{title}} — DeHub' })}
        description={t('reactions.pageDescription', {
          title,
          creator: creator ? `@${creator}` : 'DeHub',
          defaultValue: 'Watch creators react to “{{title}}” by {{creator}} on DeHub, recorded and live.',
        })}
        image={image}
        url={url}
        type="website"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: `Reactions to ${title}`,
          url,
          about: { '@type': 'VideoObject', name: title, url: `https://dehub.io/app/post/${postId}` },
        }}
      />
      <Link to={`/app/post/${postId}`} className="mb-4 inline-flex items-center gap-2 text-sm text-white/70 hover:text-white">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t('reactions.backToVideo', 'Back to video')}
      </Link>
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <MonitorPlay className="h-5 w-5" aria-hidden="true" />
        {t('reactions.heading', 'Reactions')}
        {total > 0 && <span className="text-white/50">{total}</span>}
      </h1>
      <p className="mt-1 line-clamp-2 text-sm text-white/60">{creator ? `${title} · @${creator}` : title}</p>

      {reactions.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-white/60" /></div>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-white/60">{t('reactions.empty', 'No reactions yet. Open the video’s Remix menu and choose React to be the first.')}</p>
      ) : (
        <ul className="mt-4 space-y-1">
          {rows.map((link) => <ReactionRow key={link.id} link={link} />)}
        </ul>
      )}
      {reactions.hasNextPage && (
        <button type="button" className="mx-auto mt-4 block rounded-xl border border-white/15 px-4 py-2 text-sm" disabled={reactions.isFetchingNextPage} onClick={() => void reactions.fetchNextPage()}>
          {t('reactions.more', 'Show more')}
        </button>
      )}
    </main>
  );
}
