import { useState, useEffect, useRef, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useTranslation as _useCopy } from 'react-i18next';
import X from "@/components/ui/cut-icons/close";

import { LinkPreviewCard } from './LinkPreviewCard';
import { fetchLinkPreview, extractUrlsFromText, type LinkPreviewData } from '@/lib/api/link-preview';
import { Skeleton } from '@/components/ui/skeleton';
import { DehubLinkEmbed, MAX_EMBEDS_PER_MESSAGE } from '@/components/app/cards/DehubLinkEmbed';
import { AssetRefCards, useAssetRefsInText } from '@/components/app/cards/AssetRefCards';
import { findDehubLinks, parseDehubLink } from '@/lib/dehub-links';

interface LinkPreviewsProps {
  text: string;
  onRemoveCommunityLink?: () => void;
  /**
   * The poster closed the market card. Owned by the composer because it goes
   * out with the post — a closed card stays closed in the feed too. Without a
   * handler the X still works, for this draft only.
   */
  hideAssetCards?: boolean;
  onHideAssetCardsChange?: (hidden: boolean) => void;
}

/**
 * What the composer shows under the text box: a card per DeHub entity link, and
 * OG previews for outside links.
 *
 * This used to keep one piece of dismissal state per entity KIND — a
 * `communityDismissed`, an `eventDismissed`, a `storeDismissed` — which meant
 * dismissing one community link and then pasting a different one showed the new
 * one only because of a dedicated effect written to undo the flag, and there was
 * no such effect for stores. Dismissal is now keyed by the link itself, so it
 * survives an edit elsewhere in the text and clears when that exact link goes.
 */
/**
 * The text the cards follow: a paste lands at once, typing only after a short
 * pause. Reading it on every keystroke fetched a preview for each half-typed
 * address (`https://exa`, `https://exam`, …) and flashed a skeleton for each,
 * which is what made adding a link feel frozen and jumpy.
 */
const TYPING_SETTLE_MS = 600;
function useSettledText(text: string): string {
  const [settled, setSettled] = useState(text);
  const previous = useRef(text);
  useEffect(() => {
    const before = previous.current;
    previous.current = text;
    // More than one character at once is a paste, a draft or a reset.
    if (Math.abs(text.length - before.length) > 1 || text === '') {
      setSettled(text);
      return;
    }
    const timer = setTimeout(() => setSettled(text), TYPING_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [text]);
  return settled;
}

export function LinkPreviews({ text: liveText, onRemoveCommunityLink, hideAssetCards, onHideAssetCardsChange }: LinkPreviewsProps) {
  const { t: _copy } = _useCopy();
  const text = useSettledText(liveText);
  const [previews, setPreviews] = useState<Map<string, LinkPreviewData>>(new Map());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [removedUrls, setRemovedUrls] = useState<Set<string>>(new Set());
  const [dismissedLinks, setDismissedLinks] = useState<Set<string>>(new Set());
  const fetchedUrls = useRef<Set<string>>(new Set());

  const dehubLinks = useMemo(
    () => findDehubLinks(text)
      .filter((link) => !dismissedLinks.has(link.path))
      .slice(0, MAX_EMBEDS_PER_MESSAGE),
    [text, dismissedLinks],
  );

  // The market cards the post will carry, shown while it is still a draft — the
  // poster chose an asset from a dropdown, so they should see which one they got
  // before they publish it.
  // before they publish it. They can also close it: not every $TICKER wants a
  // price card under it.
  const { refs: foundAssetRefs } = useAssetRefsInText(text);
  const [localAssetCardsHidden, setLocalAssetCardsHidden] = useState(false);
  const assetCardsHidden = hideAssetCards ?? localAssetCardsHidden;
  const setAssetCardsHidden = onHideAssetCardsChange ?? setLocalAssetCardsHidden;
  const assetRefs = assetCardsHidden ? [] : foundAssetRefs;

  // Closing is for the tickers in the text now. Once they are all gone, the
  // next one typed gets its card back.
  useEffect(() => {
    if (assetCardsHidden && foundAssetRefs.length === 0) setAssetCardsHidden(false);
  }, [assetCardsHidden, foundAssetRefs.length, setAssetCardsHidden]);

  useEffect(() => {
    // Outside links only — DeHub links get their own cards above.
    const urls = extractUrlsFromText(text).filter((url) => !parseDehubLink(url));

    const newUrls = urls.filter(
      url => !removedUrls.has(url) && !fetchedUrls.current.has(url) && !previews.has(url)
    );

    if (newUrls.length === 0) return;

    setLoading(prev => {
      const next = new Set(prev);
      newUrls.forEach(url => next.add(url));
      return next;
    });

    newUrls.forEach(async (url) => {
      fetchedUrls.current.add(url);

      const preview = await fetchLinkPreview(url);

      setLoading(prev => {
        const next = new Set(prev);
        next.delete(url);
        return next;
      });

      if (preview) {
        setPreviews(prev => new Map(prev).set(url, preview));
      }
    });
  }, [text, removedUrls, previews]);

  const handleRemove = (url: string) => {
    setRemovedUrls(prev => new Set(prev).add(url));
    setPreviews(prev => {
      const next = new Map(prev);
      next.delete(url);
      return next;
    });
  };

  // Get URLs that should be displayed (in text, not removed, not DeHub links)
  const currentUrls = useMemo(
    () => extractUrlsFromText(text).filter(url => !removedUrls.has(url) && !parseDehubLink(url)),
    [text, removedUrls],
  );
  const visiblePreviews = currentUrls
    .map(url => previews.get(url))
    .filter((p): p is LinkPreviewData => !!p);
  const loadingUrls = currentUrls.filter(url => loading.has(url));

  const hasContent =
    dehubLinks.length > 0 || assetRefs.length > 0 || visiblePreviews.length > 0 || loadingUrls.length > 0;
  if (!hasContent) return null;

  return (
    <div className="mt-3 space-y-2">
      {assetRefs.length > 0 && (
        <div className="relative">
          <AssetRefCards refs={assetRefs} className="mt-0" />
          <button
            type="button"
            aria-label={_copy("copy.removeTickerCard", { defaultValue: "Remove ticker card" })}
            onClick={(e) => {
              e.stopPropagation();
              setAssetCardsHidden(true);
            }}
            // On the corner, not inside it: the price sits top right.
            // Inline colours: the light themes remap black/white utility classes,
            // which left a white X on a white dot there.
            className="absolute -top-2 -right-2 p-1 rounded-full opacity-90 hover:opacity-100 transition-opacity z-10"
            style={{ background: 'rgba(0,0,0,0.72)', color: '#fff', boxShadow: '0 0 0 1px rgba(255,255,255,0.25)' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {dehubLinks.map((link) => (
        <div className="relative" key={`${link.kind}-${link.path}`}>
          <DehubLinkEmbed link={link} />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDismissedLinks(prev => new Set(prev).add(link.path));
              // The composer strips the community URL out of the draft when its
              // card is dismissed; kept to that one kind because it is the only
              // one the caller knows how to remove from the text.
              if (link.kind === 'community') onRemoveCommunityLink?.();
            }}
            className="absolute top-2 right-2 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white/70 hover:text-white transition-colors z-10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      <AnimatePresence mode="popLayout">
        {visiblePreviews.map((preview) => (
          <LinkPreviewCard
            key={preview.url}
            preview={preview}
            onRemove={() => handleRemove(preview.url)}
          />
        ))}
      </AnimatePresence>

      {/* Loading skeletons */}
      {loadingUrls.map((url) => (
        <div key={url} className="flex bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <Skeleton className="w-32 h-24 flex-shrink-0" />
          <div className="flex-1 p-3 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
