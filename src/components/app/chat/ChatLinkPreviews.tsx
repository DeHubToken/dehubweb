/**
 * Chat Link Previews
 * ==================
 * Fetches and displays OG preview cards for URLs found in chat messages.
 * Shows only the first URL to keep chat lightweight.
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { fetchLinkPreview, extractUrlsFromText, type LinkPreviewData } from '@/lib/api/link-preview';
import { parseDehubLink } from '@/lib/dehub-links';
import { Skeleton } from '@/components/ui/skeleton';
import { LinkPreviewContent } from '@/components/app/cards/LinkPreviewContent';
import { RichLinkCard } from '@/components/app/cards/RichLinkCardLazy';

// Reuse the URL regex from TranslatableText to match the same URLs shown as 🔗
const URL_REGEX = /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%_+~#=]+(?:\.[-a-zA-Z0-9@:%_+~#=]+)*\.(?:com|org|net|io|co|app|dev|ai|me|tv|xyz|info|gg|cc|ly|fm|sh|site|tech|live|space|link|page|pro|art|club|world|social|store|online|digital|media|studio|agency|blog|shop|network|land|zone|fund|games|gaming|vc|nft|crypto|dao|eth|web3|defi|music|video|news|chat|cloud|host|money|finance|trade|market|exchange|lol|meme|cool|to|uk|de|fr|jp|cn|ru|br|in|au|ca|es|it|nl|se|no|fi|dk|pl|pt|cz|at|ch|be|ie|nz|za|kr|mx|ar|cl|hu|ro|bg|hr|sk|si|lt|lv|ee|is)\b(?:[-a-zA-Z0-9()@:%_+.~#?&\/=]*)/gi;

function extractFirstUrl(text: string): string | null {
  URL_REGEX.lastIndex = 0;
  const match = URL_REGEX.exec(text);
  if (!match) return null;
  const url = match[0];
  // Anything inside DeHub gets its own entity card — scraping our own OG tags
  // to draw a second, worse card under it is pure noise.
  if (parseDehubLink(url)) return null;
  return url.match(/^https?:\/\//i) ? url : `https://${url}`;
}

interface ChatLinkPreviewsProps {
  content: string;
}

export function ChatLinkPreviews({ content }: ChatLinkPreviewsProps) {
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const url = extractUrlsFromText(content).find(value => !parseDehubLink(value)) ?? extractFirstUrl(content);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setLoading(!!url);
    if (!url) return;
    fetchLinkPreview(url).then((data) => {
      if (cancelled) return;
      if (data) setPreview(data);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [url]);

  if (!url) return null;
  if (!preview && !loading) return null;

  return (
    <div className="mt-1.5" data-no-navigate="true">
      {preview?.rich ? <RichLinkCard preview={{ ...preview, rich: preview.rich }} /> : preview ? (
        <motion.a
          href={preview.url}
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="block w-full max-w-sm bg-white/5 border border-white/10 rounded-lg overflow-hidden hover:bg-white/[0.08] transition-colors cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            window.open(preview.url, '_blank', 'noopener,noreferrer');
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <LinkPreviewContent key={preview.url} preview={preview} chat />
        </motion.a>
      ) : loading ? (
        <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-lg overflow-hidden">
          <div className="p-2.5 space-y-1.5">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-2.5 w-3/4" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
