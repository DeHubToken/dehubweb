/**
 * Chat Link Previews
 * ==================
 * Fetches and displays OG preview cards for URLs found in chat messages.
 * Shows only the first URL to keep chat lightweight.
 */

import { useState, useEffect, useRef } from 'react';
import { ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { fetchLinkPreview, type LinkPreviewData } from '@/lib/api/link-preview';
import { Skeleton } from '@/components/ui/skeleton';

// Reuse the URL regex from TranslatableText to match the same URLs shown as 🔗
const URL_REGEX = /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%_+~#=]+(?:\.[-a-zA-Z0-9@:%_+~#=]+)*\.(?:com|org|net|io|co|app|dev|ai|me|tv|xyz|info|gg|cc|ly|fm|sh|site|tech|live|space|link|page|pro|art|club|world|social|store|online|digital|media|studio|agency|blog|shop|network|land|zone|fund|games|gaming|vc|nft|crypto|dao|eth|web3|defi|music|video|news|chat|cloud|host|money|finance|trade|market|exchange|lol|meme|cool|to|uk|de|fr|jp|cn|ru|br|in|au|ca|es|it|nl|se|no|fi|dk|pl|pt|cz|at|ch|be|ie|nz|za|kr|mx|ar|cl|hu|ro|bg|hr|sk|si|lt|lv|ee|is)\b(?:[-a-zA-Z0-9()@:%_+.~#?&\/=]*)/gi;

function extractFirstUrl(text: string): string | null {
  URL_REGEX.lastIndex = 0;
  const match = URL_REGEX.exec(text);
  if (!match) return null;
  const url = match[0];
  // Skip community links
  if (/\/app\/communities\/[a-zA-Z0-9_-]+/.test(url)) return null;
  return url.match(/^https?:\/\//i) ? url : `https://${url}`;
}

interface ChatLinkPreviewsProps {
  content: string;
}

export function ChatLinkPreviews({ content }: ChatLinkPreviewsProps) {
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  const url = extractFirstUrl(content);

  useEffect(() => {
    if (fetchedRef.current || !url) {
      setLoading(false);
      return;
    }
    fetchedRef.current = true;

    fetchLinkPreview(url).then((data) => {
      if (data) setPreview(data);
      setLoading(false);
    });
  }, [url]);

  if (!url) return null;
  if (!preview && !loading) return null;

  return (
    <div className="mt-1.5" data-no-navigate="true">
      {preview ? (
        <motion.a
          href={preview.url}
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="block max-w-sm bg-white/5 border border-white/10 rounded-lg overflow-hidden hover:bg-white/[0.08] transition-colors cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            window.open(preview.url, '_blank', 'noopener,noreferrer');
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {preview.image && (
            <div className="w-full h-32 bg-white/5">
              <img
                src={preview.image}
                alt={preview.title}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}
          <div className="p-2.5 min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] text-white/40 mb-0.5">
              <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
              <span className="truncate">{preview.siteName || new URL(preview.url).hostname.replace('www.', '')}</span>
            </div>
            <h4 className="text-xs font-medium text-white line-clamp-1 mb-0.5">
              {preview.title}
            </h4>
            {preview.description && (
              <p className="text-[11px] text-white/50 line-clamp-2">
                {preview.description}
              </p>
            )}
          </div>
        </motion.a>
      ) : loading ? (
        <div className="max-w-sm bg-white/5 border border-white/10 rounded-lg overflow-hidden">
          <Skeleton className="w-full h-24" />
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
