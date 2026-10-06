/**
 * The related posts under the phone post page's comments. They are ordinary
 * feed cards, rendered outside the stage so they keep the feed's layout.
 */
import { RelatedVideosFeed } from '@/components/app/feeds/RelatedVideosFeed';
import { RelatedImagesFeed } from '@/components/app/feeds/RelatedImagesFeed';
import { RelatedPostsFeed } from '@/components/app/feeds/RelatedPostsFeed';
import type { StageMediaKind } from './StageMiniPlayer';

export function StageRelated({ kind, postId }: { kind: StageMediaKind; postId: string }) {
  if (kind === 'video' || kind === 'audio') return <RelatedVideosFeed currentVideoId={postId} />;
  return (
    <div className="px-3">
      {kind === 'image' ? <RelatedImagesFeed currentPostId={postId} /> : <RelatedPostsFeed currentPostId={postId} />}
    </div>
  );
}
