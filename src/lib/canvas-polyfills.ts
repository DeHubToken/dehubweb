/**
 * Runtime polyfills for Safari 15.x (iOS 15.0–15.3)
 * ===================================================
 * Safari 15.4 introduced structuredClone, Array.prototype.at,
 * crypto.randomUUID, and other APIs. Third-party libraries
 * (wagmi, viem, RainbowKit) may call these at runtime.
 *
 * This file MUST be imported before anything else in main.tsx.
 */

// ── structuredClone (Safari 15.4+) ──────────────────────────────────
if (typeof globalThis.structuredClone === 'undefined') {
  (globalThis as any).structuredClone = function structuredClone<T>(value: T): T {
    // JSON round-trip covers plain objects, arrays, strings, numbers, booleans, null.
    // Does not handle Date, RegExp, Map, Set, ArrayBuffer, etc. — but covers
    // the vast majority of library usage (config objects, state snapshots).
    return JSON.parse(JSON.stringify(value));
  };
}

// ── Array.prototype.at (Safari 15.4+) ───────────────────────────────
if (!Array.prototype.at) {
  Array.prototype.at = function (index: number) {
    const len = this.length;
    const i = index >= 0 ? index : len + index;
    return i >= 0 && i < len ? this[i] : undefined;
  };
}

// ── String.prototype.at (Safari 15.4+) ──────────────────────────────
if (!String.prototype.at) {
  (String.prototype as any).at = function (index: number) {
    const len = this.length;
    const i = index >= 0 ? index : len + index;
    return i >= 0 && i < len ? this.charAt(i) : undefined;
  };
}

// ── String.prototype.replaceAll (Safari 13.1+ has it, but guard anyway) ──
if (!String.prototype.replaceAll) {
  (String.prototype as any).replaceAll = function (
    search: string | RegExp,
    replacement: string
  ) {
    if (search instanceof RegExp) {
      if (!search.global) {
        throw new TypeError('replaceAll must be called with a global RegExp');
      }
      return this.replace(search, replacement);
    }
    return this.split(search).join(replacement);
  };
}

// ── Object.hasOwn (Safari 15.4+) ────────────────────────────────────
if (typeof Object.hasOwn === 'undefined') {
  (Object as any).hasOwn = function (obj: object, key: PropertyKey): boolean {
    return Object.prototype.hasOwnProperty.call(obj, key);
  };
}

// ── crypto.randomUUID (Safari 15.4+) ────────────────────────────────
if (typeof globalThis.crypto !== 'undefined' && !globalThis.crypto.randomUUID) {
  (globalThis.crypto as any).randomUUID = function (): string {
    // Use crypto.getRandomValues which is available since Safari 6
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // Set version 4 and variant bits
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
}

// ── CanvasRenderingContext2D.roundRect (Safari 16+) ──────────────────
if (
  typeof CanvasRenderingContext2D !== 'undefined' &&
  !CanvasRenderingContext2D.prototype.roundRect
) {
  CanvasRenderingContext2D.prototype.roundRect = function (
    x: number,
    y: number,
    w: number,
    h: number,
    radii?: number | number[]
  ) {
    const r = typeof radii === 'number' ? radii : Array.isArray(radii) ? radii[0] ?? 0 : 0;
    const clampedR = Math.min(r, w / 2, h / 2);
    this.moveTo(x + clampedR, y);
    this.lineTo(x + w - clampedR, y);
    this.arcTo(x + w, y, x + w, y + clampedR, clampedR);
    this.lineTo(x + w, y + h - clampedR);
    this.arcTo(x + w, y + h, x + w - clampedR, y + h, clampedR);
    this.lineTo(x + clampedR, y + h);
    this.arcTo(x, y + h, x, y + h - clampedR, clampedR);
    this.lineTo(x, y + clampedR);
    this.arcTo(x, y, x + clampedR, y, clampedR);
    this.closePath();
  };
}
