import { useState, useEffect, useRef, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { LinkPreviewCard } from './LinkPreviewCard';
import { fetchLinkPreview, extractUrlsFromText, type LinkPreviewData } from '@/lib/api/link-preview';
import { Skeleton } from '@/components/ui/skeleton';
import { DehubLinkEmbed, MAX_EMBEDS_PER_MESSAGE } from '@/components/app/cards/DehubLinkEmbed';
import { findDehubLinks, parseDehubLink } from '@/lib/dehub-links';

interface LinkPreviewsProps {
  text: string;
  onRemoveCommunityLink?: () => void;
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
export function LinkPreviews({ text, onRemoveCommunityLink }: LinkPreviewsProps) {
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
  const currentUrls = extractUrlsFromText(text)
    .filter(url => !removedUrls.has(url) && !parseDehubLink(url));
  const visiblePreviews = currentUrls
    .map(url => previews.get(url))
    .filter((p): p is LinkPreviewData => !!p);
  const loadingUrls = currentUrls.filter(url => loading.has(url));

  const hasContent = dehubLinks.length > 0 || visiblePreviews.length > 0 || loadingUrls.length > 0;
  if (!hasContent) return null;

  return (
    <div className="mt-3 space-y-2">
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
