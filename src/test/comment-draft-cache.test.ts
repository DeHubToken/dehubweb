import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetDraftCacheForTests,
  clearDraft,
  loadDraft,
  saveDraft,
} from '@/lib/comment-draft-cache';

/**
 * The bug this store exists to stop: text typed into the composer surviving in
 * localStorage but under a key the composer never reads on its next open, so
 * the sheet comes back empty with the draft still on disk. The old shape keyed
 * on `tokenId:parentId` — one entry per reply target — and the composer only
 * ever opened on the top-level key.
 */
describe('comment draft cache', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetDraftCacheForTests();
  });

  it('gives a reply draft back on the next open, reply target and all', () => {
    saveDraft('42', { text: 'half a thought', parentId: 'c1', parentUsername: 'ada' });

    __resetDraftCacheForTests(); // as if the page had reloaded
    const draft = loadDraft('42');

    expect(draft?.text).toBe('half a thought');
    expect(draft?.parentId).toBe('c1');
    expect(draft?.parentUsername).toBe('ada');
  });

  it('keeps one draft per post, so changing reply target cannot orphan text', () => {
    saveDraft('42', { text: 'still writing', parentId: 'c1', parentUsername: 'ada' });
    saveDraft('42', { text: 'still writing', parentId: 'c2', parentUsername: 'grace' });

    expect(loadDraft('42')?.text).toBe('still writing');
    expect(loadDraft('42')?.parentId).toBe('c2');
    expect(Object.keys(JSON.parse(localStorage.getItem('dehub-comment-drafts-v2')!))).toEqual(['42']);
  });

  it('holds a GIF with no text, and drops an entry once the box is empty', () => {
    saveDraft('42', { text: '', gifUrl: 'https://giphy.test/a.gif' });
    expect(loadDraft('42')?.gifUrl).toBe('https://giphy.test/a.gif');

    saveDraft('42', { text: '   ' });
    expect(loadDraft('42')).toBeNull();
  });

  it('keeps posts apart and clears only the one that posted', () => {
    saveDraft('1', { text: 'first' });
    saveDraft('2', { text: 'second' });

    clearDraft('1');

    expect(loadDraft('1')).toBeNull();
    expect(loadDraft('2')?.text).toBe('second');
  });

  it('carries the old flat store over instead of dropping it on the floor', () => {
    localStorage.setItem(
      'dehub-comment-drafts',
      JSON.stringify({ '7': 'top level', '8:c9': 'a reply nobody could see' }),
    );

    expect(loadDraft('7')?.text).toBe('top level');
    const reply = loadDraft('8');
    expect(reply?.text).toBe('a reply nobody could see');
    expect(reply?.parentId).toBe('c9');
    expect(localStorage.getItem('dehub-comment-drafts')).toBeNull();
  });

  it('forgets a draft nobody came back to', () => {
    const ancient = Date.now() - 31 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      'dehub-comment-drafts-v2',
      JSON.stringify({ '5': { text: 'from last month', updatedAt: ancient } }),
    );

    expect(loadDraft('5')).toBeNull();
  });
});
