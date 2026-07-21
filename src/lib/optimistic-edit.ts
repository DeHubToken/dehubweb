/**
 * Optimistic Edit Helpers
 * =======================
 * Updates React Query caches immediately after a post edit,
 * so the user sees changes without a refresh.
 */

import type { QueryClient, InfiniteData } from '@tanstack/react-query';
import type { EditPostResult } from '@/components/app/modals/EditPostModal';

/**
 * Compute title/content display values using the same normalization as feeds.
 */
function normalizeEditedPost(edited: EditPostResult) {
  const trimmedName = edited.name.trim();
  const trimmedDesc = edited.description.trim();
  const hasMeaningfulTitle =
    trimmedName.length > 0 &&
    trimmedName !== trimmedDesc &&
    !trimmedDesc.startsWith(trimmedName);

  return {
    title: hasMeaningfulTitle ? trimmedName : undefined,
    content: trimmedDesc || (hasMeaningfulTitle ? '' : trimmedName) || '',
    rawName: edited.name,
    rawDescription: edited.description,
    categories: edited.categories,
    // For video/image cards that use `name` and `description` directly
    name: edited.name,
    description: edited.description,
  };
}

/**
 * Deep-patch any matching item in an infinite query cache page.
 */
function patchInfiniteQuery(
  queryClient: QueryClient,
  queryKey: string[],
  tokenId: string,
  patch: Record<string, unknown>
) {
  queryClient.setQueriesData<InfiniteData<any>>(
    { queryKey },
    (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page: any) => {
          if (!page) return page;
          // Handle array pages or pages with items/data property
          const items = Array.isArray(page) ? page : page.items || page.data || page;
          if (!Array.isArray(items)) return page;

          const updatedItems = items.map((item: any) => {
            if (String(item?.id) === String(tokenId) || String(item?.tokenId) === String(tokenId)) {
              return { ...item, ...patch };
            }
            return item;
          });

          if (Array.isArray(page)) return updatedItems;
          if (page.items) return { ...page, items: updatedItems };
          if (page.data) return { ...page, data: updatedItems };
          return page;
        }),
      };
    }
  );
}

/**
 * Optimistically update all relevant caches after a post edit.
 */
export function applyOptimisticEdit(
  queryClient: QueryClient,
  tokenId: string | number,
  edited: EditPostResult,
  additionalQueryKeys: string[][] = []
) {
  const id = String(tokenId);
  const normalized = normalizeEditedPost(edited);

  // Patch all infinite feed caches
  const feedKeys = [
    ['unified-feed'],
    // Real key family behind Shorts/Images/Live tabs (use-dehub-feed.ts) —
    // the old 'dehub-videos'/'dehub-images' names matched no query.
    ['dehub-feed'],
    ['dehub-shorts'],
    ['dehub-audio'],
    ['dehub-user-content'],
    ...additionalQueryKeys,
  ];

  for (const key of feedKeys) {
    patchInfiniteQuery(queryClient, key, id, normalized);
  }

  // Patch single-post query
  queryClient.setQueriesData<any>(
    { queryKey: ['single-post', id] },
    (old: any) => old ? { ...old, ...normalized } : old
  );

  // Patch nft-info query
  queryClient.setQueriesData<any>(
    { queryKey: ['nft-info', id] },
    (old: any) => {
      if (!old) return old;
      return {
        ...old,
        name: edited.name,
        description: edited.description,
        category: edited.categories,
      };
    }
  );
}
