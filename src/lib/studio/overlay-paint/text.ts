/**
 * Text for the canvas overlay painter: the fonts, and fitting a line into a
 * width the way the DOM widgets' `text-overflow: ellipsis` and
 * `-webkit-line-clamp` do.
 *
 * measureText is the expensive call on a 2D canvas — it shapes the string
 * every time — and a 30fps overlay with a chat box, a feed and a few counters
 * would otherwise measure hundreds of strings a frame that have not changed
 * since the last one. Every width and every fitted line is cached by font and
 * text; the caches are bounded and simply dropped when they fill, because the
 * set of strings on screen at once is small and rebuilds in a frame.
 */

/** The app's font stack (index.css), emoji fonts included so names with emoji draw in colour. */
export const FONT_FAMILY =
  "Exo, 'Exo Fallback', 'DeHub Pistol', 'Apple Color Emoji', 'Noto Color Emoji', 'Segoe UI Emoji', sans-serif";

/** CSS `line-height: 1.15` on every widget. */
export const LINE_HEIGHT = 1.15;

const ELLIPSIS = '…';

export type Measure = (text: string) => number;

/**
 * The longest start of `text` that fits `maxWidth` with an ellipsis after it,
 * or `text` itself when it fits. Cut on code points, so an emoji or an accent
 * is never split in half.
 */
export function ellipsize(text: string, maxWidth: number, measure: Measure): string {
  if (!text || maxWidth <= 0) return '';
  if (measure(text) <= maxWidth) return text;
  if (measure(ELLIPSIS) > maxWidth) return '';
  const chars = Array.from(text);
  let lo = 0;
  let hi = chars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measure(chars.slice(0, mid).join('').trimEnd() + ELLIPSIS) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return chars.slice(0, lo).join('').trimEnd() + ELLIPSIS;
}

/**
 * Greedy word wrap into at most `maxLines` lines, the last one ellipsized when
 * the text runs on — `-webkit-line-clamp`. A word wider than the line is broken
 * where it overflows, as `overflow-wrap: anywhere` would.
 */
export function wrapLines(text: string, maxWidth: number, maxLines: number, measure: Measure): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length || maxWidth <= 0 || maxLines < 1) return [];
  const lines: string[] = [];
  let line = '';
  let i = 0;
  while (i < words.length) {
    const word = words[i];
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      i += 1;
      continue;
    }
    if (line) {
      lines.push(line);
      line = '';
    } else {
      // One word wider than the whole line: take as much of it as fits.
      const chars = Array.from(word);
      let n = 1;
      while (n < chars.length && measure(chars.slice(0, n + 1).join('')) <= maxWidth) n += 1;
      lines.push(chars.slice(0, n).join(''));
      words[i] = chars.slice(n).join('');
    }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines) {
    if (line) lines.push(line);
    return lines;
  }
  // Out of lines with words left over: the last line carries the rest, cut short.
  const rest = [lines[maxLines - 1], line, ...words.slice(i)].filter(Boolean).join(' ');
  lines[maxLines - 1] = ellipsize(rest, maxWidth, measure);
  return lines;
}

const fonts = new Map<number, string>();

/**
 * A canvas font string. Sizes are rounded to half a pixel so a widget being
 * resized does not mint a new font (and a new cache) every frame.
 */
export function fontOf(weight: number, px: number): string {
  const half = Math.max(1, Math.round(px * 2));
  const key = weight * 100_000 + half;
  let font = fonts.get(key);
  if (!font) {
    font = `${weight} ${half / 2}px ${FONT_FAMILY}`;
    fonts.set(key, font);
  }
  return font;
}

const MAX_CACHED = 4000;
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Measures and fits text on one context, caching by font. `font(f)` before
 * measuring or drawing.
 */
export class TextKit {
  private ctx: CanvasRenderingContext2D | null = null;
  private current = '';
  private widths = new Map<string, Map<string, number>>();
  private fitted = new Map<string, string>();
  private wrapped = new Map<string, string[]>();
  private cells = new Map<string, number>();
  private widthCount = 0;
  private readonly measureFn: Measure = (text) => this.width(text);

  /**
   * Bind to a context, forgetting which font it has: call at the start of a
   * frame and after any `restore()` that undid a font change, or the next
   * `font()` would skip setting a font the context no longer has.
   */
  use(ctx: CanvasRenderingContext2D): void {
    this.ctx = ctx;
    this.current = '';
  }

  font(font: string): void {
    if (this.current !== font && this.ctx) {
      this.ctx.font = font;
      this.current = font;
    }
  }

  width(text: string): number {
    if (!text || !this.ctx) return 0;
    let byText = this.widths.get(this.current);
    if (!byText) {
      byText = new Map();
      this.widths.set(this.current, byText);
    }
    let w = byText.get(text);
    if (w === undefined) {
      if (this.widthCount > MAX_CACHED) this.flush();
      w = this.ctx.measureText(text).width;
      byText.set(text, w);
      this.widthCount += 1;
    }
    return w;
  }

  /** `text` ellipsized into `maxWidth` in the current font. */
  fit(text: string, maxWidth: number): string {
    if (!text) return '';
    const key = `${this.current}\u0000${Math.floor(maxWidth)}\u0000${text}`;
    let out = this.fitted.get(key);
    if (out === undefined) {
      if (this.fitted.size > MAX_CACHED) this.fitted.clear();
      out = ellipsize(text, Math.floor(maxWidth), this.measureFn);
      this.fitted.set(key, out);
    }
    return out;
  }

  /** `text` wrapped into at most `maxLines` lines of `maxWidth` in the current font. */
  wrap(text: string, maxWidth: number, maxLines: number): string[] {
    const key = `${this.current}\u0000${Math.floor(maxWidth)}\u0000${maxLines}\u0000${text}`;
    let out = this.wrapped.get(key);
    if (!out) {
      if (this.wrapped.size > MAX_CACHED) this.wrapped.clear();
      out = wrapLines(text, Math.floor(maxWidth), maxLines, this.measureFn);
      this.wrapped.set(key, out);
    }
    return out;
  }

  /**
   * Width of `text` with every digit in a cell as wide as the widest digit —
   * `font-variant-numeric: tabular-nums`, which canvas has no switch for. A
   * clock drawn this way does not shuffle sideways every second.
   */
  tabularWidth(text: string): number {
    const cell = this.digitCell();
    let w = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      w += c >= 48 && c <= 57 ? cell : this.width(text[i]);
    }
    return w;
  }

  /** Draw `text` left-aligned at x with tabular digits. Returns the width drawn. */
  drawTabular(text: string, x: number, y: number): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const cell = this.digitCell();
    let at = x;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const c = text.charCodeAt(i);
      if (c >= 48 && c <= 57) {
        const w = this.width(ch);
        ctx.fillText(ch, at + (cell - w) / 2, y);
        at += cell;
      } else {
        ctx.fillText(ch, at, y);
        at += this.width(ch);
      }
    }
    return at - x;
  }

  /** Drop everything: a new translator or a font that finished loading changes every width. */
  flush(): void {
    this.widths.clear();
    this.fitted.clear();
    this.wrapped.clear();
    this.cells.clear();
    this.widthCount = 0;
  }

  private digitCell(): number {
    let cell = this.cells.get(this.current);
    if (cell === undefined) {
      cell = 0;
      for (const d of DIGITS) cell = Math.max(cell, this.width(d));
      this.cells.set(this.current, cell);
    }
    return cell;
  }
}
