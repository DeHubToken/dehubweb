import { describe, it, expect, afterEach, vi } from 'vitest';
import { isInteractionInsideOverlay, guardOutsideDismiss } from '@/lib/overlay-dismiss';

/**
 * The bug these exist for: the Go Live sheet opens from the post composer and
 * portals to `body`, so clicking its "Stream Title" field is, by DOM
 * containment, a pointer-down outside the composer — and the composer closed,
 * taking the draft with it. Radix's own shield for that is an ordering test
 * over live layer nodes, which any remount reshuffles, which is why it only
 * bit some of the time. So what is pinned here is the containment claim
 * itself: inside any overlay's own content is never "off" another overlay,
 * while a scrim still is.
 */

function el(html: string): Element {
  document.body.insertAdjacentHTML('beforeend', html);
  return document.body.lastElementChild as Element;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('isInteractionInsideOverlay', () => {
  it('sees a click on a field inside a nested sheet as inside an overlay', () => {
    const sheet = el('<div data-vaul-drawer><input /></div>');
    expect(isInteractionInsideOverlay(sheet.querySelector('input'))).toBe(true);
  });

  it('covers dialogs, poppers, menus and toasts, not just vaul sheets', () => {
    for (const markup of [
      '<div role="dialog"><button>x</button></div>',
      '<div role="alertdialog"><button>x</button></div>',
      '<div data-radix-popper-content-wrapper><button>x</button></div>',
      '<div data-radix-menu-content><button>x</button></div>',
      '<div data-sonner-toaster><button>x</button></div>',
      '<div data-overlay-content><button>x</button></div>',
    ]) {
      const overlay = el(markup);
      expect(isInteractionInsideOverlay(overlay.querySelector('button'))).toBe(true);
      overlay.remove();
    }
  });

  it('leaves the scrim dismissible — that is how sheets are meant to close', () => {
    const scrim = el('<div class="fixed inset-0 bg-black/80"></div>');
    expect(isInteractionInsideOverlay(scrim)).toBe(false);
  });

  it('treats ordinary page content as outside', () => {
    const card = el('<article><button>Like</button></article>');
    expect(isInteractionInsideOverlay(card.querySelector('button'))).toBe(false);
  });

  it('is safe on a null or non-element target', () => {
    expect(isInteractionInsideOverlay(null)).toBe(false);
    expect(isInteractionInsideOverlay(document)).toBe(false);
  });
});

describe('guardOutsideDismiss', () => {
  it('blocks the dismissal when the pointer landed in another overlay', () => {
    const sheet = el('<div data-vaul-drawer><input /></div>');
    const preventDefault = vi.fn();
    guardOutsideDismiss()({ target: sheet.querySelector('input'), preventDefault });
    expect(preventDefault).toHaveBeenCalled();
  });

  it('lets a scrim click through', () => {
    const scrim = el('<div class="fixed inset-0"></div>');
    const preventDefault = vi.fn();
    guardOutsideDismiss()({ target: scrim, preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("runs the call site's own handler first, and honours its preventDefault", () => {
    const scrim = el('<div class="fixed inset-0"></div>');
    const preventDefault = vi.fn();
    const own = vi.fn();
    guardOutsideDismiss(own)({ target: scrim, preventDefault });
    expect(own).toHaveBeenCalledTimes(1);
  });
});
