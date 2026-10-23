import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import { trackShare } from '@/lib/analytics';

/**
 * The code a site pastes to embed a post. The worker serves the page it
 * frames (server/post-embed.js), and embed.js, which the code loads, fits the
 * frame to the post.
 *
 * Written out here rather than imported from server/post-embed.js: every card
 * imports this, so the whole worker module would ride the boot path for one
 * string. src/test/post-embed.test.ts holds the two to the same output.
 */
export const POST_EMBED_WIDTH = 550;

export function postEmbedCode(tokenId: string | number, height = 480): string {
  const id = Number(tokenId);
  return `<iframe src="https://dehub.io/app/post/${id}/embed" class="dehub-embed" style="max-width: 100%; border: 0" width="${POST_EMBED_WIDTH}" height="${height}" allowfullscreen="allowfullscreen" allow="fullscreen; picture-in-picture" loading="lazy"></iframe><script src="https://dehub.io/embed.js" async="async"></script>`;
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
