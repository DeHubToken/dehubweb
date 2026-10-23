import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import { EMBED_WIDTH, embedSnippet } from '../../server/post-embed.js';
import { trackShare } from '@/lib/analytics';

/**
 * The code a site pastes to embed a post (server/post-embed.js serves the
 * page it frames). The height is a starting point: embed.js, which the code
 * loads, fits the frame to the post.
 */
export function postEmbedCode(tokenId: string | number): string {
  return embedSnippet('https://dehub.io', tokenId, { width: EMBED_WIDTH, height: 480 });
}

/** Copies a post's embed code and says so. `t` is the caller's i18next t. */
export function copyPostEmbedCode(tokenId: string | number, t: TFunction): void {
  navigator.clipboard.writeText(postEmbedCode(tokenId))
    .then(() => {
      trackShare('embed', { kind: 'post' });
      toast.success(t('postOptions.embedCodeCopied'));
    })
    .catch(() => toast.error(t('postOptions.copyFailed')));
}
