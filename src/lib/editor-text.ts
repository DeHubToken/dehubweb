/**
 * Reading and placing the caret in a contentEditable post editor in terms of
 * the post's own text.
 *
 * The editor shows a link as a 🔗 chip, but the post text holds the whole
 * address. Counting caret positions in what the screen shows (the DOM text)
 * and then using them against the post text put the caret, a mention or a
 * ticker in the wrong spot as soon as a link sat before it — and turning a
 * typed link into a chip sent the caret back to the start of the post.
 * Everything here counts the way the saved text does: a chip counts as the
 * address it stands for, a <br> or a new line block as one "\n".
 */

/** The text a chip stands for in the post, or null when the element is not a chip. */
export function chipText(el: Element): string | null {
  if (el.hasAttribute('data-link-chip')) {
    const url = el.getAttribute('data-url') || '';
    return el.getAttribute('data-link-mode') === 'text' ? `<${url}>` : url;
  }
  if (el.hasAttribute('data-cashtag-chip')) {
    return el.getAttribute('data-cashtag') || el.textContent || '';
  }
  return null;
}

type Piece =
  | { kind: 'text'; node: Text; start: number; length: number }
  | { kind: 'chip'; node: Element; start: number; length: number }
  | { kind: 'break'; node: Element; start: number; length: number };

/**
 * Walks the editor in post-text order. `visit` returning true stops the walk.
 * Returns the post text up to where the walk stopped.
 */
function walk(root: Node, visit?: (piece: Piece) => boolean | void): string {
  let out = '';
  let stopped = false;

  const visitNode = (node: Node, isFirst: boolean) => {
    if (stopped) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent || '';
      if (visit?.({ kind: 'text', node: node as Text, start: out.length, length: value.length })) { stopped = true; return; }
      out += value;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    const el = node as Element;
    if (node.nodeType === Node.ELEMENT_NODE) {
      const chip = chipText(el);
      if (chip !== null) {
        if (visit?.({ kind: 'chip', node: el, start: out.length, length: chip.length })) { stopped = true; return; }
        out += chip;
        return;
      }
      const tag = el.tagName.toUpperCase();
      if (tag === 'BR') {
        if (visit?.({ kind: 'break', node: el, start: out.length, length: 1 })) { stopped = true; return; }
        out += '\n';
        return;
      }
      // A new line block starts a new line, except the very first one.
      if ((tag === 'DIV' || tag === 'P') && !isFirst && out.length > 0 && !out.endsWith('\n')) {
        out += '\n';
      }
    }
    let first = true;
    for (const child of Array.from(node.childNodes)) {
      visitNode(child, first && isFirst);
      if (stopped) return;
      first = false;
    }
  };

  let first = true;
  for (const child of Array.from(root.childNodes)) {
    visitNode(child, first);
    if (stopped) break;
    first = false;
  }
  return out;
}

/** The post text the editor holds, links as full addresses. */
export function serializeEditor(root: Node): string {
  return walk(root);
}

/** Every text node outside a chip, with where it starts in the post text. */
export function editorTextNodes(root: Node): { node: Text; start: number }[] {
  const nodes: { node: Text; start: number }[] = [];
  walk(root, (piece) => {
    if (piece.kind === 'text') nodes.push({ node: piece.node, start: piece.start });
  });
  return nodes;
}

/** Where the caret (the end of the selection) sits in the post text, or null when it is not in `root`. */
export function getEditorCaret(root: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.endContainer)) return null;
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.endContainer, range.endOffset);
  return walk(before.cloneContents()).length;
}

/** Puts a collapsed caret at `offset` in the post text. */
export function setEditorCaret(root: HTMLElement, offset: number): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  let placed = false;
  walk(root, (piece) => {
    const end = piece.start + piece.length;
    if (piece.kind === 'text' && offset <= end) {
      range.setStart(piece.node, Math.max(0, offset - piece.start));
      placed = true;
    } else if (piece.kind === 'chip' && offset <= end) {
      // A chip is one unit: the caret goes before or after it, never inside.
      if (offset <= piece.start) range.setStartBefore(piece.node);
      else range.setStartAfter(piece.node);
      placed = true;
    } else if (piece.kind === 'break' && offset <= piece.start) {
      range.setStartBefore(piece.node);
      placed = true;
    }
    return placed;
  });
  if (!placed) {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}
