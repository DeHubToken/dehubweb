import { useEffect, useState, type CSSProperties } from 'react';

/**
 * True while an editable element (input / textarea / contenteditable) has
 * focus on a touch-primary device — i.e. while the on-screen keyboard is up.
 * Lets chrome (mobile bottom nav) hide so chat surfaces reclaim the space.
 */
export function useKeyboardOpen(enabled = true) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Gated so a hook mounted once per feed card only listens while its own
    // surface is open — dozens of dormant focus listeners is exactly the
    // pile-up ui/drawer.tsx defers Roots to avoid.
    if (!enabled) {
      setOpen(false);
      return;
    }
    // Fine-pointer devices type on a physical keyboard — no OSK ever appears,
    // so a desktop window resized below lg must keep its nav while typing.
    if (!window.matchMedia('(pointer: coarse)').matches) return;

    const NON_TEXT_INPUTS = new Set([
      'checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image',
    ]);
    const isEditable = (el: Element | EventTarget | null): boolean => {
      if (el instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(el.type);
      if (el instanceof HTMLTextAreaElement) return true;
      return el instanceof HTMLElement && el.isContentEditable;
    };

    const onFocusIn = (e: FocusEvent) => {
      if (isEditable(e.target)) setOpen(true);
    };
    const onFocusOut = () => {
      // Focus may be hopping straight to another editable — settle first.
      requestAnimationFrame(() => {
        if (!isEditable(document.activeElement)) setOpen(false);
      });
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [enabled]);

  return open;
}

/**
 * Blur the focused editable so the on-screen keyboard dismisses — chat
 * surfaces call this from a tap on the messages area.
 */
export function dismissKeyboard() {
  const el = document.activeElement;
  if (
    el instanceof HTMLElement &&
    (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)
  ) {
    el.blur();
  }
}

/**
 * Live box of the visual viewport — the area actually visible above the
 * on-screen keyboard — while `enabled`. Android resizes the layout viewport
 * for the keyboard (interactive-widget=resizes-content) so dvh tracks it and
 * offsetTop stays 0. iOS ignores interactive-widget: the layout viewport keeps
 * its size and Safari PANS the visual viewport to reveal the focused input, so
 * offsetTop is how far the visible area has slid down past the layout origin.
 * Consumers must compensate for that pan or their keyboard-sized container
 * scrolls off-screen. Returns { height: null } until a measurement exists.
 */
export function useVisualViewportBox(enabled: boolean) {
  const [box, setBox] = useState<{ height: number | null; offsetTop: number }>({
    height: null,
    offsetTop: 0,
  });

  useEffect(() => {
    if (!enabled) {
      setBox({ height: null, offsetTop: 0 });
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      // Some iOS versions surface the keyboard pan as a window scroll instead
      // of (or on top of) vv.offsetTop — undo it so offsetTop is the whole
      // story. The chat layout fits inside the visual viewport, so there is
      // nothing legitimate to scroll to while the keyboard is up.
      if (window.scrollY > 0) window.scrollTo(0, 0);
      setBox({ height: Math.round(vv.height), offsetTop: Math.round(vv.offsetTop) });
    };
    update();
    vv.addEventListener('resize', update);
    // iOS pans the visual viewport instead of resizing — 'scroll' fires then.
    vv.addEventListener('scroll', update);
    window.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('scroll', update);
    };
  }, [enabled]);

  return enabled ? box : { height: null, offsetTop: 0 };
}

/** Breathing room between the top of a keyboard-fitted sheet and the viewport. */
const KEYBOARD_SHEET_GAP = 8;
/** Never squeeze a sheet smaller than this, whatever the keyboard leaves. */
const MIN_KEYBOARD_SHEET_HEIGHT = 180;

/**
 * Inline geometry that keeps a bottom sheet — and therefore its composer —
 * inside the area the on-screen keyboard leaves visible.
 *
 * A vaul sheet is `position: fixed; bottom: 0`, i.e. pinned to the LAYOUT
 * viewport. Android shrinks that viewport for the keyboard
 * (`interactive-widget=resizes-content`, set in index.html) so bottom-0 stays
 * where the reader can see it. iOS does not: the layout viewport keeps its
 * full height, the keyboard is drawn over the bottom of it, and Safari pans
 * the visual viewport to chase the focused field. So on iOS the sheet's whole
 * lower half — the reply box included — sits behind the keyboard, and the
 * band where the reader can still see the page is showing the scrim, which
 * dismisses the sheet on a tap. That is the "I can't see what I'm typing, and
 * it keeps closing on me" report.
 *
 * Measuring is the only portable answer: pin the sheet to the visual viewport
 * (`top` = the pan offset, `height` = what is visible) and both platforms land
 * in the same place. Positioned with top/height and never a transform —
 * vaul writes `transform: translate3d(...)` inline to drive the slide-up.
 *
 * Pass `repositionInputs={false}` on any Drawer using this: vaul has its own
 * keyboard handling that writes `height`/`bottom` straight onto the same node,
 * knows nothing about the pan offset, and only fires on `resize`.
 */
export function useKeyboardSafeSheet(enabled: boolean): {
  keyboardOpen: boolean;
  style: CSSProperties | null;
} {
  const keyboardOpen = useKeyboardOpen(enabled);
  const { height, offsetTop } = useVisualViewportBox(enabled && keyboardOpen);

  // Only step in where the keyboard actually eats into the visible area
  // without the layout viewport following — iOS. On Android the two shrink
  // together, `bottom: 0` already lands above the keyboard, and this would be
  // a resize for nothing. Also skips the beat between focus and the keyboard
  // finishing its slide-up, where the viewport still measures full height.
  const layoutHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
  const keyboardTakesSpace =
    height !== null && (offsetTop > 1 || height < layoutHeight - 40);

  if (!enabled || !keyboardOpen || !height || !keyboardTakesSpace) {
    return { keyboardOpen: enabled && keyboardOpen, style: null };
  }
  return {
    keyboardOpen: true,
    style: {
      top: offsetTop + KEYBOARD_SHEET_GAP,
      bottom: 'auto',
      height: Math.max(height - KEYBOARD_SHEET_GAP, MIN_KEYBOARD_SHEET_HEIGHT),
      maxHeight: 'none',
    },
  };
}
