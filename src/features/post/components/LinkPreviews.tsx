import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { LinkPreviewCard } from './LinkPreviewCard';
import { fetchLinkPreview, extractUrlsFromText, type LinkPreviewData } from '@/lib/api/link-preview';
import { Skeleton } from '@/components/ui/skeleton';
import { CommunityLinkEmbed, extractCommunitySlug } from '@/components/app/communities/CommunityLinkEmbed';

interface LinkPreviewsProps {
  text: string;
}

export function LinkPreviews({ text }: LinkPreviewsProps) {
  const [previews, setPreviews] = useState<Map<string, LinkPreviewData>>(new Map());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [removedUrls, setRemovedUrls] = useState<Set<string>>(new Set());
  const fetchedUrls = useRef<Set<string>>(new Set());

  // Detect community slug from text
  const communitySlug = extractCommunitySlug(text);

  useEffect(() => {
    const urls = extractUrlsFromText(text);
    
    // Skip community URLs - they get their own embed
    const nonCommunityUrls = urls.filter(url => !extractCommunitySlug(url));
    
    // Filter out removed and already fetched URLs
    const newUrls = nonCommunityUrls.filter(
      url => !removedUrls.has(url) && !fetchedUrls.current.has(url) && !previews.has(url)
    );

    if (newUrls.length === 0) return;

    // Mark as loading
    setLoading(prev => {
      const next = new Set(prev);
      newUrls.forEach(url => next.add(url));
      return next;
    });

    // Fetch previews
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

  // Get URLs that should be displayed (in text, not removed, not community links)
  const currentUrls = extractUrlsFromText(text)
    .filter(url => !removedUrls.has(url) && !extractCommunitySlug(url));
  const visiblePreviews = currentUrls
    .map(url => previews.get(url))
    .filter((p): p is LinkPreviewData => !!p);
  const loadingUrls = currentUrls.filter(url => loading.has(url));

  const hasContent = communitySlug || visiblePreviews.length > 0 || loadingUrls.length > 0;
  if (!hasContent) return null;

  return (
    <div className="mt-3 space-y-2">
      {/* Community link embed */}
      {communitySlug && <CommunityLinkEmbed slug={communitySlug} />}

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
