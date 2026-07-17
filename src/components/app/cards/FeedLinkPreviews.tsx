/**
 * Feed Link Previews
 * ==================
 * Read-only link preview cards shown in feed post cards.
 * Fetches OG data for URLs found in post content.
 */

import { useState, useEffect, useRef } from 'react';
import { ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchLinkPreview, extractUrlsFromText, type LinkPreviewData } from '@/lib/api/link-preview';
import { Skeleton } from '@/components/ui/skeleton';

interface FeedLinkPreviewsProps {
  text: string;
}

export function FeedLinkPreviews({ text }: FeedLinkPreviewsProps) {
  const [previews, setPreviews] = useState<Map<string, LinkPreviewData>>(new Map());
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    const urls = extractUrlsFromText(text);
    if (urls.length === 0) { setLoading(false); return; }

    fetchedRef.current = true;

    // Fetch only the first URL to keep feed lightweight
    const url = urls[0];
    fetchLinkPreview(url).then((preview) => {
      if (preview) {
        setPreviews(new Map([[url, preview]]));
      }
      setLoading(false);
    });
  }, [text]);

  const urls = extractUrlsFromText(text);
  if (urls.length === 0) return null;

  const visiblePreviews = [...previews.values()];

  if (visiblePreviews.length === 0 && !loading) return null;

  return (
    <div className="mt-2 space-y-2" data-no-navigate>
      <AnimatePresence mode="popLayout">
        {visiblePreviews.map((preview) => {
          const domain = new URL(preview.url).hostname.replace('www.', '');
          return (
            <motion.a
              key={preview.url}
              href={preview.url}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="block bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:bg-white/[0.08] transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex">
                {preview.image && (
                  <div className="w-28 h-20 sm:w-32 sm:h-24 flex-shrink-0 bg-white/5">
                    <img
                      src={preview.image}
                      alt={preview.title}
                      className="w-full h-full object-cover rounded-lg"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                <div className="flex-1 p-2.5 sm:p-3 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs text-white/50 mb-0.5">
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{preview.siteName || domain}</span>
                  </div>
                  <h4 className="text-sm font-medium text-white line-clamp-1 mb-0.5">
                    {preview.title}
                  </h4>
                  {preview.description && (
                    <p className="text-xs text-white/60 line-clamp-2">
                      {preview.description}
                    </p>
                  )}
                </div>
              </div>
            </motion.a>
          );
        })}
      </AnimatePresence>

      {loading && (
        <div className="flex bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <Skeleton className="w-28 h-20 sm:w-32 sm:h-24 flex-shrink-0" />
          <div className="flex-1 p-2.5 sm:p-3 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      )}
    </div>
  );
}

