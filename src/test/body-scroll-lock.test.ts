import { beforeEach, describe, expect, it } from 'vitest';
import { bodyScrollLockDepth, bodyScrollLockOwners, lockBodyScroll, lockDocumentScroll } from '@/lib/body-scroll-lock';

/**
 * The nesting cases are the whole point. Before this existed, two habits shared
 * one `body.style.overflow`: capture-and-restore, and blind reset to ''. Open a
 * story from inside the shorts viewer and close it, and the blind reset handed
 * the page back while the viewer was still up. Do it the other way round and
 * the capture-and-restore one saved 'hidden' as the original and wrote it back
 * forever, which is the leak that leaves a page permanently unscrollable.
 */
describe('body scroll lock', () => {
  beforeEach(() => {
    // Acquiring and immediately releasing cannot drain someone else's lock.
    expect(bodyScrollLockDepth()).toBe(0);
    document.body.style.overflow = '';
  });

  it('locks on the first acquire and releases on the last', () => {
    const release = lockBodyScroll();
    expect(document.body.style.overflow).toBe('hidden');
    release();
    expect(document.body.style.overflow).toBe('');
  });

  it('stays locked while an inner overlay opens and closes over an outer one', () => {
    const outer = lockBodyScroll();
    const inner = lockBodyScroll();

    inner();
    expect(document.body.style.overflow).toBe('hidden');

    outer();
    expect(document.body.style.overflow).toBe('');
  });

  it('restores what was there rather than assuming empty', () => {
    document.body.style.overflow = 'clip';
    const release = lockBodyScroll();
    expect(document.body.style.overflow).toBe('hidden');
    release();
    expect(document.body.style.overflow).toBe('clip');
  });

  it('ignores a release called twice, so a sibling lock is not dropped', () => {
    const first = lockBodyScroll();
    const second = lockBodyScroll();

    first();
    first();
    first();

    expect(bodyScrollLockDepth()).toBe(1);
    expect(document.body.style.overflow).toBe('hidden');

    second();
    expect(document.body.style.overflow).toBe('');
  });

  it('never drops below zero', () => {
    const release = lockBodyScroll();
    release();
    release();
    expect(bodyScrollLockDepth()).toBe(0);
  });

  it('releases overlapping viewers in opening order without restoring a stale hidden value', () => {
    const image = lockBodyScroll('image');
    const comments = lockBodyScroll('comments');
    const fullscreen = lockDocumentScroll('video');
    image();
    fullscreen();
    fullscreen();
    expect(document.body.style.overflow).toBe('hidden');
    expect(bodyScrollLockOwners()).toEqual(['comments']);
    comments();
    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('holds the root until the last overlapping fullscreen player releases', () => {
    const first = lockDocumentScroll('first-video');
    const second = lockDocumentScroll('second-video');
    first();
    expect(document.documentElement.style.overflow).toBe('hidden');
    second();
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.body.style.overflow).toBe('');
  });
});
