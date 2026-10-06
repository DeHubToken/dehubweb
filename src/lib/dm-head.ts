import type { DmMessage } from '@/lib/api/dehub/dm';

export interface MessagePage {
  items: DmMessage[];
  totalCount: number;
  hasMore: boolean;
}

export interface MessageHistory {
  pages: MessagePage[];
  pageParams: number[];
}

export function messageHistoryItems(pages: MessagePage[]): DmMessage[] {
  const seen = new Set<string>();
  return pages.flatMap(page => page.items).filter(message => {
    if (seen.has(message._id)) return false;
    seen.add(message._id);
    return true;
  });
}

/** A full head with no overlap needs ordinary pagination to recover a burst. */
export function needsMessageHistoryRecovery(old: MessageHistory, head: MessagePage): boolean {
  const stored = new Set(messageHistoryItems(old.pages)
    .filter(message => !message._id.startsWith('temp-')).map(message => message._id));
  return head.hasMore && stored.size > 0 && head.items.length > 0
    && !head.items.some(message => stored.has(message._id));
}

/** Merge a newest-page refresh without replacing loaded history or pending sends. */
export function mergeMessageHead(old: MessageHistory, head: MessagePage, startedAt: number): MessageHistory {
  if (!old.pages.length) return { pages: [head], pageParams: [0] };
  const stored = new Map(messageHistoryItems(old.pages).map(message => [message._id, message]));
  const freshIds = new Set(head.items.map(message => message._id));
  const times = head.items.map(message => Date.parse(message.createdAt)).filter(Number.isFinite);
  const oldest = head.hasMore ? (times.length ? Math.min(...times) : Infinity) : -Infinity;
  const keepMissing = (message: DmMessage) => {
    const time = Date.parse(message.createdAt);
    return message._id.startsWith('temp-') || !Number.isFinite(time) || time < oldest || time > startedAt;
  };
  const fresh = head.items.map(message => {
    const previous = stored.get(message._id);
    return previous?.isRead && !message.isRead ? { ...message, isRead: true } : message;
  });
  const first = [...fresh, ...old.pages[0].items.filter(message => !freshIds.has(message._id) && keepMissing(message))]
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  const seen = new Set<string>();
  const pages = old.pages.map((page, index) => ({
    ...page,
    ...(index === 0 ? { totalCount: head.totalCount, hasMore: head.hasMore } : {}),
    items: (index === 0 ? first : page.items.filter(message => !freshIds.has(message._id) && keepMissing(message)))
      .filter(message => {
        if (seen.has(message._id)) return false;
        seen.add(message._id);
        return true;
      }),
  }));
  return { ...old, pages };
}

/** New messages shift offset pagination; count unique persisted rows, not pages. */
export function nextMessagePage(pages: MessagePage[]): number | undefined {
  if (!pages[pages.length - 1]?.hasMore) return undefined;
  return messageHistoryItems(pages).filter(message => !message._id.startsWith('temp-')).length / 30;
}
