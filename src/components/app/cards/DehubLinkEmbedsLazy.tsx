/**
 * DeHub link embeds, split off the boot path.
 * ==========================================
 * Every surface that prints user-written text calls `useDehubLinks` and then
 * renders `<DehubLinkEmbeds>`. The hook is a regex over a string; the embeds
 * are a switchboard onto community, store, event, stage, profile and shared-post
 * cards and everything those import — around 120 KB that used to be statically
 * reachable from `src/main.tsx` because the feed cards sit on the first-paint
 * path. See `scripts/boot-path-report.mjs`.
 *
 * So the hook lives here, next to nothing, and the switchboard is reached
 * through `React.lazy`. A post with no DeHub link in it — the overwhelming
 * majority — renders `null` without ever asking for the chunk, and one that has
 * a link pays for it at the moment it is rendered rather than at boot.
 *
 * Import both from here. `DehubLinkEmbed.tsx` is the implementation.
 */
import { lazy, Suspense, useMemo } from 'react';
import type { DehubLinkMatch } from '@/lib/dehub-links';
import { MAX_EMBEDS_PER_MESSAGE, findDehubLinks, stripDehubLinkMatches } from '@/lib/dehub-links';

const DehubLinkEmbedsImpl = lazy(() =>
  import('./DehubLinkEmbed').then((m) => ({ default: m.DehubLinkEmbeds })),
);

export function DehubLinkEmbeds({
  links,
  compact = false,
}: {
  links: DehubLinkMatch[];
  compact?: boolean;
}) {
  // The empty case is the common one and must not touch the lazy component at
  // all, or every card in the feed queues a chunk it has no use for.
  if (links.length === 0) return null;
  return (
    <Suspense fallback={null}>
      <DehubLinkEmbedsImpl links={links} compact={compact} />
    </Suspense>
  );
}

/**
 * The one call a surface needs: what to card, and what text to print now that
 * those links are being carded.
 *
 * Returns only the links that will actually be rendered, and text stripped of
 * exactly those — so a body with five links keeps three of them as readable
 * text instead of silently losing them to the cap.
 */
export function useDehubLinks(text?: string | null): {
  links: DehubLinkMatch[];
  displayText: string;
} {
  return useMemo(() => {
    const links = findDehubLinks(text).slice(0, MAX_EMBEDS_PER_MESSAGE);
    return { links, displayText: stripDehubLinkMatches(text, links) };
  }, [text]);
}
