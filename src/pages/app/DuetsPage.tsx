/**
 * Every duet of one video, /app/post/<id>/duets: the original at the top and
 * the duets people made of it, newest first.
 *
 * Crawlers get the same title, description and share card from the edge
 * worker (CLOUDFLARE_WORKER_SEO.js, duets branch).
 */
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Columns2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SEOHead } from '@/components/SEOHead';
import { DeHubPageLoader } from '@/components/app/DeHubLoader';
import { getNFTInfo } from '@/lib/api/dehub';
import { getTextPostShareImageUrl } from '@/lib/api/dehub/og-image';
import { buildImageUrl } from '@/lib/media-url';
import { listRemixes } from '@/lib/remix-links';
import { duetsPath } from '@/lib/duet';

export default function DuetsPage() {
  const { t } = useTranslation();
  const { postId = '' } = useParams();
  const valid = /^[1-9]\d{0,14}$/.test(postId);
  const { data: source, isLoading } = useQuery({
    queryKey: ['nft-info', postId], enabled: valid,
    queryFn: () => getNFTInfo(postId).catch(() => null),
  });
  const duets = useInfiniteQuery({
    queryKey: ['remix-links', postId, 'duet'], enabled: valid, initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const page = await listRemixes(postId, 'duet', pageParam);
      const posts = await Promise.all(page.links.map(link => getNFTInfo(String(link.remixTokenId)).catch(() => null)));
      return { ...page, items: page.links.map((link, i) => ({ link, post: posts[i] })).filter(item => item.post) };
    },
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
  });

  if (valid && isLoading) return <DeHubPageLoader />;
  if (!valid || !source) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center text-white">
        <SEOHead title={t('duet.notFoundTitle', 'Video not found — DeHub')} noindex noCanonical />
        <p className="text-sm text-zinc-400">{t('duet.notFound', 'This video is not available.')}</p>
        <Button asChild variant="secondary"><Link to="/shorts">{t('duet.browseShorts', 'Browse Shorts')}</Link></Button>
      </div>
    );
  }

  const creator = source.minterUsername || source.mintername;
  const name = source.name || t('duet.video', 'Video');
  const title = creator
    ? t('duet.pageTitle', 'Duets of {{title}} by @{{creator}}', { title: name, creator })
    : t('duet.pageTitleNoCreator', 'Duets of {{title}}', { title: name });
  const description = t('duet.pageDescription', 'Watch every duet of this video on DeHub, or record your own side by side.');
  const items = duets.data?.pages.flatMap(page => page.items) ?? [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 text-white">
      <SEOHead
        title={`${title} — DeHub`}
        description={description}
        image={getTextPostShareImageUrl(postId)}
        url={`https://dehub.io${duetsPath(postId)}`}
        type="video.other"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: title,
          description,
          about: { '@type': 'VideoObject', name, url: `https://dehub.io/app/post/${postId}` },
        }}
      />
      <Link to={`/app/post/${postId}`} className="flex items-center gap-3 rounded-2xl bg-white/5 p-3 hover:bg-white/10">
        {source.imageUrl && <img src={buildImageUrl(postId, source.imageUrl, 320)} alt="" className="h-20 w-14 shrink-0 rounded-lg object-cover" />}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{t('duet.pageHeading', 'Duets')}</h1>
          <p className="truncate text-sm text-zinc-400">{creator ? `${name} · @${creator}` : name}</p>
        </div>
      </Link>
      {duets.isLoading ? <DeHubPageLoader /> : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-zinc-400">
          <Columns2 className="h-8 w-8" />
          <p>{t('duet.empty', 'No duets yet. Open the video’s options and choose Remix → Duet to make the first one.')}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map(({ link, post }) => (
            <li key={link.id}>
              <Link to={`/app/post/${link.remixTokenId}`} className="block overflow-hidden rounded-xl bg-white/5 hover:bg-white/10">
                <div className="aspect-[9/16] bg-black">
                  {post?.imageUrl && <img src={buildImageUrl(String(link.remixTokenId), post.imageUrl, 360)} alt={post.name || ''} loading="lazy" className="h-full w-full object-cover" />}
                </div>
                <p className="truncate px-2 py-1.5 text-xs text-zinc-300">@{link.remixerUsername || post?.minterUsername || post?.mintername || link.remixerAddress.slice(0, 8)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {duets.hasNextPage && (
        <Button variant="secondary" onClick={() => void duets.fetchNextPage()} disabled={duets.isFetchingNextPage}>
          {t('duet.loadMore', 'Load more')}
        </Button>
      )}
    </div>
  );
}
