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
