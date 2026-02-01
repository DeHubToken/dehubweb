/**
 * Post Metadata Component
 * =======================
 * Displays timestamp and view count below post content, above action bar.
 */

import { Eye } from 'lucide-react';
import { formatTimeAgo } from '@/lib/feed-utils';

interface PostMetadataProps {
  timestamp?: string;
  viewCount?: string | number;
}

export function PostMetadata({ timestamp, viewCount }: PostMetadataProps) {
  if (!timestamp && !viewCount) return null;
  
  // Format timestamp - if it's an ISO string, convert to relative time
  const formattedTimestamp = timestamp ? (
    timestamp.includes('T') || timestamp.includes('-') 
      ? formatTimeAgo(timestamp) 
      : timestamp
  ) : undefined;

  return (
    <div className="flex items-center gap-2 text-zinc-500 text-xs">
      {formattedTimestamp && <span>{formattedTimestamp}</span>}
      {formattedTimestamp && viewCount && <span>•</span>}
      {viewCount && (
        <span className="flex items-center gap-1">
          <Eye className="w-3 h-3" />
          {viewCount}
        </span>
      )}
    </div>
  );
}
