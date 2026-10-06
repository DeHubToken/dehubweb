import { describe, expect, it } from 'vitest';
import type { DmMessage } from '@/lib/api/dehub/dm';
import { messageHistoryItems, mergeMessageHead, needsMessageHistoryRecovery, nextMessagePage, type MessageHistory, type MessagePage } from '../dm-head';

const message = (id: string, second: number, extra = {}): DmMessage => ({
  _id: id, createdAt: new Date(second * 1000).toISOString(), isRead: false, ...extra,
} as DmMessage);
const page = (items: DmMessage[], hasMore = true): MessagePage => ({ items, hasMore, totalCount: items.length });
const history = (...pages: MessagePage[]): MessageHistory => ({ pages, pageParams: pages.map((_, i) => i) });

describe('bounded message recovery', () => {
  it('preserves displaced history, pending sends and confirmed read receipts', () => {
    const old = history(page([message('temp-send', 6), message('a', 5, { isRead: true }), message('b', 4)]), page([message('c', 3), message('d', 2)]));
    const next = mergeMessageHead(old, page([message('new', 6), message('a', 5, { content: 'edited' })]), 7000);
    expect(messageHistoryItems(next.pages).map(m => m._id)).toEqual(['new', 'temp-send', 'a', 'b', 'c', 'd']);
    expect(next.pages[0].items.find(m => m._id === 'a')).toMatchObject({ content: 'edited', isRead: true });
    expect(next.pageParams).toEqual(old.pageParams);
  });

  it('removes a missing row in the returned window, preserving a socket event received during the request', () => {
    const old = history(page([message('raced', 9), message('deleted', 7), message('a', 6), message('old', 1)]));
    const next = mergeMessageHead(old, page([message('a', 6)]), 8000);
    expect(messageHistoryItems(next.pages).map(m => m._id)).toEqual(['raced', 'a', 'old']);
  });

  it('deduplicates overlapping pages and calculates the actual persisted offset', () => {
    const pages = [page([message('a', 3), message('temp-send', 4)]), page([message('a', 3), message('b', 2)])];
    expect(nextMessagePage(pages)).toBe(2 / 30);
    expect(messageHistoryItems(pages).map(m => m._id)).toEqual(['a', 'temp-send', 'b']);
    expect(nextMessagePage([page([message('a', 1)], false)])).toBeUndefined();
  });

  it('requests ordinary history recovery for a burst larger than the head window', () => {
    const old = history(page([message('old', 1)]));
    expect(needsMessageHistoryRecovery(old, page([message('new', 50)]))).toBe(true);
    expect(needsMessageHistoryRecovery(old, page([message('new', 50), message('old', 1)]))).toBe(false);
  });

  it('clears an authoritative empty thread while preserving pending sends', () => {
    const old = history(page([message('temp-send', 2), message('deleted', 1)]));
    expect(messageHistoryItems(mergeMessageHead(old, page([], false), 3000).pages).map(m => m._id)).toEqual(['temp-send']);
  });

  it('removes stale cached history when the server returns the complete remaining thread', () => {
    const old = history(page([message('a', 3)]), page([message('deleted-old', 1)]));
    expect(messageHistoryItems(mergeMessageHead(old, page([message('a', 3)], false), 4000).pages).map(m => m._id)).toEqual(['a']);
  });
});
