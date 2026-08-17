/**
 * New Post Page
 * =============
 * The page behind dehub.io/newpost/<n> — an off-chain post's own URL.
 *
 * The slug is resolved to its internal tokenId (everything renders by that),
 * and then:
 *
 * - still off-chain → the post renders HERE, at the /newpost URL. That is the
 *   point of the slug: an unminted post never presents under the NFT-style
 *   /post/<tokenId>.
 * - minted since → replace-navigate to /app/post/<tokenId>. The slug mapping
 *   is kept server-side forever, so every link shared pre-mint lands right.
 */

import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { resolveNewPost } from '@/lib/api/dehub';
import SinglePostPage from './SinglePostPage';

export default function NewPostPage() {
  const { n } = useParams<{ n: string }>();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['newpost-resolve', n],
    queryFn: () => resolveNewPost(n!),
    enabled: !!n && /^\d+$/.test(n),
    // The slug→tokenId mapping never changes; whether it is minted can, so
    // let a revisit re-check without hammering.
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-white font-medium">This post doesn't exist</p>
        <p className="text-white/50 text-sm">The link may be wrong, or the post was deleted.</p>
        <button
          onClick={() => navigate('/app')}
          className="mt-2 px-6 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl text-sm font-medium transition-colors"
        >
          Go to feed
        </button>
      </div>
    );
  }

  if (data.minted) {
    return <Navigate to={`/app/post/${data.tokenId}`} replace />;
  }

  return <SinglePostPage overrideId={String(data.tokenId)} />;
}
