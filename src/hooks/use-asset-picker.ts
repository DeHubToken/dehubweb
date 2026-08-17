/**
 * useAssetPicker
 * ==============
 * `$` typeahead for the composer: type `$DH` and pick DeHub, Apple or whichever
 * of the four tokens sharing that ticker you actually meant.
 *
 * Deliberately shaped like `useMention` — same `handleInput` / `handleKeyDown` /
 * `handleSelect` contract, same "parent owns the text" arrangement — so a surface
 * that already has @mentions adds tickers by copying the wiring it already has.
 *
 * The caret maths is duplicated from that hook rather than shared. It is about
 * sixty lines, and the alternative was editing a file eight live surfaces
 * depend on to save them.
 *
 * What makes this more than a search box: a symbol is not a unique name. Four
 * tokens can trade as `$MOON`, so what the composer writes into the caption
 * depends on which one was picked — see `composerTextFor`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { composerTextFor, type AssetSuggestion } from '@/lib/api/market';

type PickerInput = HTMLTextAreaElement | HTMLInputElement | HTMLDivElement;

interface UseAssetPickerOptions {
  inputRef: React.RefObject<PickerInput | null>;
  /** Called with the whole new text, exactly like the mention hook. */
  onInsert: (suggestion: AssetSuggestion, newText: string) => void;
}

const DROPDOWN_WIDTH = 300;
const DROPDOWN_HEIGHT = 296;

/** How many characters after `$` before the dropdown opens. */
const MIN_QUERY = 1;
/** Longest thing that can still be a ticker. Past this it is prose with a `$`. */
const MAX_QUERY = 12;

function caretOffset(input: PickerInput | null, fallback: number): number {
  if (!input) return fallback;
  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    return input.selectionStart ?? fallback;
  }
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return fallback;
  const range = selection.getRangeAt(0);
  const preCaret = range.cloneRange();
  preCaret.selectNodeContents(input);
  preCaret.setEnd(range.endContainer, range.endOffset);
  return preCaret.toString().length;
}

/**
 * The `$query` being typed at the caret, if any.
 *
 * Requires whitespace or a bracket before the `$`, so `US$20` and a price
 * written mid-word never open the dropdown, and refuses a leading digit because
 * `$20` is money.
 */
function extractTickerQuery(text: string, caret: number): { query: string; startIndex: number } | null {
  for (let i = caret - 1; i >= 0; i--) {
    const char = text[i];
    if (char === '$') {
      const before = i > 0 ? text[i - 1] : ' ';
      if (!/[\s([{"'>]/.test(before)) return null;
      const query = text.slice(i + 1, caret);
      if (query.length < MIN_QUERY || query.length > MAX_QUERY) return null;
      if (!/^[A-Za-z][A-Za-z0-9.-]*$/.test(query)) return null;
      return { query, startIndex: i };
    }
    // Anything that cannot appear in a ticker means the caret is not in one.
    if (!/[A-Za-z0-9.-]/.test(char)) return null;
  }
  return null;
}

export interface UseAssetPickerReturn {
  isOpen: boolean;
  query: string;
  position: { top: number; left: number };
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  handleInput: (text: string, cursorPosition?: number) => void;
  /** True when the key was consumed and the caller should stop. */
  handleKeyDown: (e: React.KeyboardEvent, results: AssetSuggestion[]) => boolean;
  handleSelect: (suggestion: AssetSuggestion) => void;
  handleClose: () => void;
}

export function useAssetPicker({ inputRef, onInsert }: UseAssetPickerOptions): UseAssetPickerReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const startRef = useRef(-1);
  const textRef = useRef('');

  const updatePosition = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;

    let anchor: DOMRect | null = null;
    if (input instanceof HTMLDivElement) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        if (rect.height > 0 && rect.top > 0) anchor = rect;
      }
    }
    if (!anchor) anchor = input.getBoundingClientRect();

    // Above the caret by default — the composer's own action bar and, on a
    // phone, the keyboard both live below it.
    let top = anchor.top - DROPDOWN_HEIGHT - 8;
    if (top < 8) top = Math.min(anchor.bottom + 8, window.innerHeight - DROPDOWN_HEIGHT - 8);
    if (top < 8) top = 8;
    const left = Math.max(12, Math.min(anchor.left - 12, window.innerWidth - DROPDOWN_WIDTH - 12));
    setPosition({ top, left });
  }, [inputRef]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    startRef.current = -1;
  }, []);

  const handleInput = useCallback(
    (text: string, cursorPosition?: number) => {
      textRef.current = text;
      const caret = cursorPosition ?? caretOffset(inputRef.current, text.length);
      const match = extractTickerQuery(text, caret);
      if (!match) {
        close();
        return;
      }
      setQuery(match.query);
      startRef.current = match.startIndex;
      setIsOpen(true);
      setSelectedIndex(0);
      updatePosition();
    },
    [inputRef, close, updatePosition],
  );

  const handleSelect = useCallback(
    (suggestion: AssetSuggestion) => {
      const text = textRef.current;
      const start = startRef.current;
      if (start === -1) return;

      const caret = caretOffset(inputRef.current, text.length);
      const insert = `${composerTextFor(suggestion)} `;
      const newText = text.slice(0, start) + insert + text.slice(caret);

      onInsert(suggestion, newText);
      close();

      const input = inputRef.current;
      const target = start + insert.length;
      // One frame late on purpose: the parent writes the new text into the
      // element, and moving the caret before that lands puts it in the old DOM.
      setTimeout(() => {
        if (!input) return;
        input.focus();
        if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
          input.setSelectionRange(target, target);
          return;
        }
        const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT, null);
        let counted = 0;
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const length = (node.textContent || '').length;
          if (counted + length >= target) {
            const selection = window.getSelection();
            if (!selection) return;
            const range = document.createRange();
            range.setStart(node, Math.min(target - counted, length));
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            return;
          }
          counted += length;
        }
      }, 10);
    },
    [inputRef, onInsert, close],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, results: AssetSuggestion[]): boolean => {
      if (!isOpen) return false;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
          return true;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          return true;
        case 'Enter':
        case 'Tab': {
          const picked = results[selectedIndex];
          if (!picked) return false;
          e.preventDefault();
          handleSelect(picked);
          return true;
        }
        case 'Escape':
          e.preventDefault();
          close();
          return true;
        default:
          return false;
      }
    },
    [isOpen, selectedIndex, handleSelect, close],
  );

  useEffect(() => {
    if (!isOpen) return;
    const onMove = () => updatePosition();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [isOpen, updatePosition]);

  return {
    isOpen,
    query,
    position,
    selectedIndex,
    setSelectedIndex,
    handleInput,
    handleKeyDown,
    handleSelect,
    handleClose: close,
  };
}

export default useAssetPicker;
