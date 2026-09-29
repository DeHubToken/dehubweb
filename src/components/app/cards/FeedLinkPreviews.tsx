/**
 * Feed Link Previews
 * ==================
 * Read-only link preview cards shown in feed post cards.
 * Fetches OG data for URLs found in post content.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchLinkPreview, extractUrlsFromText, type LinkPreviewData } from '@/lib/api/link-preview';
import { parseDehubLink } from '@/lib/dehub-links';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchAppByDomain, type MiniAppListing } from '@/lib/miniapp/registry';

interface FeedLinkPreviewsProps {
  text: string;
}

/** Outside links only — DeHub links are rendered as entity cards instead. */
function externalUrls(text: string): string[] {
  return extractUrlsFromText(text).filter((url) => !parseDehubLink(url));
}

export function FeedLinkPreviews({ text }: FeedLinkPreviewsProps) {
  const [previews, setPreviews] = useState<Map<string, LinkPreviewData>>(new Map());
  const [loading, setLoading] = useState(true);
  // A link to a registered mini app's own site opens the app, the way a
  // shared link does on Farcaster, rather than leaving for the browser.
  const [app, setApp] = useState<MiniAppListing | null>(null);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    const urls = externalUrls(text);
    if (urls.length === 0) { setLoading(false); return; }

    fetchedRef.current = true;

    // Fetch only the first URL to keep feed lightweight
    const url = urls[0];
    try {
      void fetchAppByDomain(new URL(url).hostname).then(setApp);
    } catch {
      /* not a URL we can read a host from */
    }
    fetchLinkPreview(url).then((preview) => {
      if (preview) {
        setPreviews(new Map([[url, preview]]));
      }
      setLoading(false);
    });
  }, [text]);

  const urls = externalUrls(text);
  if (urls.length === 0) return null;

  const visiblePreviews = [...previews.values()];

  if (visiblePreviews.length === 0 && !loading) return null;

  return (
    <div className="mt-2 space-y-2" data-no-navigate>
      <AnimatePresence mode="popLayout">
        {visiblePreviews.map((preview) => {
          const domain = new URL(preview.url).hostname.replace('www.', '');
          if (app && new URL(preview.url).hostname.toLowerCase() === app.domain) {
            const open = (e: { stopPropagation: () => void }) => {
              e.stopPropagation();
              navigate(`/apps/${app.slug}?from=feed&url=${encodeURIComponent(preview.url)}`);
            };
            return (
              <motion.div
                key={preview.url}
                role="button"
                tabIndex={0}
                onClick={open}
                onKeyDown={(e) => { if (e.key === 'Enter') open(e); }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="block cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-white/5 transition-colors hover:bg-white/[0.08]"
              >
                {preview.image && (
                  <div className="aspect-[3/2] w-full bg-white/5">
                    <img src={preview.image} alt={preview.title} className="h-full w-full object-cover" loading="lazy" />
                  </div>
                )}
                <div className="flex items-center gap-3 p-3">
                  {app.icon_url ? <img src={app.icon_url} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" /> : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{app.name}</p>
                    <p className="truncate text-xs text-white/50">{domain}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black">{t('miniApps.card.open')}</span>
                </div>
              </motion.div>
            );
          }
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
              {preview.image && (
                <div className="w-full aspect-[1.91/1] bg-white/5">
                  <img
                    src={preview.image}
                    alt={preview.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
              <div className="px-3 pb-3 pt-3.5 sm:pt-4 min-w-0">
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
            </motion.a>
          );
        })}
      </AnimatePresence>

      {loading && (
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <Skeleton className="w-full aspect-[1.91/1]" />
          <div className="px-3 pb-3 pt-3.5 sm:pt-4 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      )}
    </div>
  );
}
