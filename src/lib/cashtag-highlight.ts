import { editorTextNodes } from './editor-text';

/**
 * Tickers ($DHB) in the post editor are painted with the CSS Custom Highlight
 * API instead of being wrapped in non-editable chips. A chip is a wall the
 * caret and selection cannot cross cleanly: select-all, shift+arrow and
 * long-press selection stopped or jumped at every ticker. A highlight only
 * changes how the letters look, so the text stays plain, editable text.
 *
 * Browsers without the API (older Safari/Firefox) show tickers as plain text.
 */

const HIGHLIGHT_NAME = 'dehub-cashtag';
const CASHTAG = /\$[a-zA-Z]{1,20}/g;

type HighlightCtor = new (...ranges: Range[]) => unknown;
type HighlightRegistry = { set(name: string, value: unknown): void; delete(name: string): void };

const rangesByEditor = new Map<HTMLElement, Range[]>();

function registry(): { registry: HighlightRegistry; Highlight: HighlightCtor } | null {
  if (typeof window === 'undefined') return null;
  const css = (window as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  const Highlight = (window as unknown as { Highlight?: HighlightCtor }).Highlight;
  if (!css?.highlights || !Highlight) return null;
  return { registry: css.highlights, Highlight };
}

function publish(): void {
  const api = registry();
  if (!api) return;
  const all = [...rangesByEditor.values()].flat();
  if (all.length === 0) api.registry.delete(HIGHLIGHT_NAME);
  else api.registry.set(HIGHLIGHT_NAME, new api.Highlight(...all));
}

/**
 * Re-marks every ticker in `editor`. `skip` leaves out spans of the post text
 * that are something else (an address not yet turned into a link chip).
 */
export function paintCashtags(editor: HTMLElement, skip: (start: number, end: number) => boolean = () => false): void {
  if (!registry()) return;
  const ranges: Range[] = [];
  for (const { node, start } of editorTextNodes(editor)) {
    const value = node.textContent || '';
    for (const match of value.matchAll(CASHTAG)) {
      const at = match.index ?? 0;
      if (skip(start + at, start + at + match[0].length)) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + match[0].length);
      ranges.push(range);
    }
  }
  rangesByEditor.set(editor, ranges);
  publish();
}

export function clearCashtags(editor: HTMLElement): void {
  if (!rangesByEditor.delete(editor)) return;
  publish();
}
