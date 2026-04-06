import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { LinkPreviewCard } from './LinkPreviewCard';
import { fetchLinkPreview, extractUrlsFromText, type LinkPreviewData } from '@/lib/api/link-preview';
import { Skeleton } from '@/components/ui/skeleton';
import { CommunityLinkEmbed, extractCommunitySlug } from '@/components/app/communities/CommunityLinkEmbed';
import { EventLinkEmbed, extractEventId } from '@/components/app/events/EventLinkEmbed';

interface LinkPreviewsProps {
  text: string;
  onRemoveCommunityLink?: () => void;
}

export function LinkPreviews({ text, onRemoveCommunityLink }: LinkPreviewsProps) {
  const [previews, setPreviews] = useState<Map<string, LinkPreviewData>>(new Map());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [removedUrls, setRemovedUrls] = useState<Set<string>>(new Set());
  const [communityDismissed, setCommunityDismissed] = useState(false);
  const [eventDismissed, setEventDismissed] = useState(false);
  const fetchedUrls = useRef<Set<string>>(new Set());

  // Detect community slug from text
  const communitySlug = communityDismissed ? null : extractCommunitySlug(text);
  
  // Detect event ID from text
  const eventId = eventDismissed ? null : extractEventId(text);

  // Reset dismissed state when text changes to a different community or no community
  const prevSlugRef = useRef<string | null>(null);
  useEffect(() => {
    const currentSlug = extractCommunitySlug(text);
    if (currentSlug !== prevSlugRef.current) {
      prevSlugRef.current = currentSlug;
      if (currentSlug && communityDismissed) {
        // New community link added — un-dismiss
        setCommunityDismissed(false);
      }
    }
  }, [text, communityDismissed]);

  // Reset dismissed state when text changes to a different event
  const prevEventRef = useRef<string | null>(null);
  useEffect(() => {
    const currentEid = extractEventId(text);
    if (currentEid !== prevEventRef.current) {
      prevEventRef.current = currentEid;
      if (currentEid && eventDismissed) {
        setEventDismissed(false);
      }
    }
  }, [text, eventDismissed]);

    const urls = extractUrlsFromText(text);
    
    // Skip community and event URLs - they get their own embeds
    const nonSpecialUrls = urls.filter(url => !extractCommunitySlug(url) && !extractEventId(url));
    
    // Filter out removed and already fetched URLs
    const newUrls = nonSpecialUrls.filter(
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

  const handleRemoveCommunity = () => {
    setCommunityDismissed(true);
    onRemoveCommunityLink?.();
  };

  const handleRemoveEvent = () => {
    setEventDismissed(true);
  };

  // Get URLs that should be displayed (in text, not removed, not community/event links)
  const currentUrls = extractUrlsFromText(text)
    .filter(url => !removedUrls.has(url) && !extractCommunitySlug(url) && !extractEventId(url));
  const visiblePreviews = currentUrls
    .map(url => previews.get(url))
    .filter((p): p is LinkPreviewData => !!p);
  const loadingUrls = currentUrls.filter(url => loading.has(url));

  const hasContent = communitySlug || eventId || visiblePreviews.length > 0 || loadingUrls.length > 0;
  if (!hasContent) return null;

  return (
    <div className="mt-3 space-y-2">
      {/* Community link embed with dismiss button */}
      {communitySlug && (
        <div className="relative">
          <CommunityLinkEmbed slug={communitySlug} />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRemoveCommunity();
            }}
            className="absolute top-2 right-2 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white/70 hover:text-white transition-colors z-10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Event link embed with dismiss button */}
      {eventId && (
        <div className="relative">
          <EventLinkEmbed eventId={eventId} />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRemoveEvent();
            }}
            className="absolute top-2 right-2 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white/70 hover:text-white transition-colors z-10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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
