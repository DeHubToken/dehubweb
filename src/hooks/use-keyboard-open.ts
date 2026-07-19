import { useEffect, useState } from 'react';

/**
 * True while an editable element (input / textarea / contenteditable) has
 * focus on a touch-primary device — i.e. while the on-screen keyboard is up.
 * Lets chrome (mobile bottom nav) hide so chat surfaces reclaim the space.
 */
export function useKeyboardOpen() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
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
  }, []);

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
