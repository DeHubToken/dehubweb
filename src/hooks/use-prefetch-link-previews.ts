import { useEffect, useRef } from 'react';
import { prefetchLinkPreviews, previewedLinkUrl } from '@/lib/api/link-preview';

type FeedRow = { tokenId?: unknown; id?: unknown; description?: unknown; stream?: { description?: unknown } | null } | null | undefined;

/**
 * Read the link preview of every post in these feed rows as soon as they
 * arrive, a few at a time, so each card draws its preview at full height when
 * it mounts instead of growing under the reader a moment later.
 */
export function usePrefetchLinkPreviews(rows: readonly unknown[]): void {
  const seen = useRef(new Set<string>());
  useEffect(() => {
    const urls: string[] = [];
    for (const row of rows as readonly FeedRow[]) {
      const key = String(row?.tokenId ?? row?.id ?? '');
      if (!key || seen.current.has(key)) continue;
      seen.current.add(key);
      const text = typeof row?.description === 'string' ? row.description
        : typeof row?.stream?.description === 'string' ? row.stream.description : '';
      const url = previewedLinkUrl(text);
      if (url) urls.push(url);
    }
    if (urls.length) prefetchLinkPreviews(urls);
  }, [rows]);
}
