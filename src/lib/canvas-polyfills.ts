/**
 * Runtime polyfills for Safari 15.x (iOS 15.0–15.3)
 * ===================================================
 * Safari 15.4 introduced structuredClone, Array.prototype.at,
 * crypto.randomUUID, and other APIs. Third-party libraries
 * (wagmi, viem, RainbowKit) may call these at runtime.
 *
 * This file MUST be imported before anything else in main.tsx.
 */

type CloneableRecord = Record<PropertyKey, unknown>;

function createStructuredCloneError() {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('This value cannot be cloned.', 'DataCloneError');
  }
  return new TypeError('This value cannot be cloned.');
}

function cloneArrayBuffer(buffer: ArrayBuffer) {
  return buffer.slice(0);
}

function cloneBufferLike(buffer: ArrayBufferLike) {
  if (buffer instanceof ArrayBuffer) {
    return cloneArrayBuffer(buffer);
  }

  const cloned = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(cloned).set(new Uint8Array(buffer));
  return cloned;
}

function cloneStructuredValue<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (typeof value === 'function') {
    throw createStructuredCloneError();
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const source = value as object;
  if (seen.has(source)) {
    return seen.get(source) as T;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags) as T;
  }

  if (typeof URL !== 'undefined' && value instanceof URL) {
    return new URL(value.toString()) as T;
  }

  if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) {
    return new URLSearchParams(value.toString()) as T;
  }

  if (value instanceof ArrayBuffer) {
    const clonedBuffer = cloneArrayBuffer(value);
    seen.set(source, clonedBuffer);
    return clonedBuffer as T;
  }

  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    const clonedBuffer = cloneBufferLike(view.buffer);
    const clonedView = value instanceof DataView
      ? new DataView(clonedBuffer, view.byteOffset, view.byteLength)
      : new (value.constructor as { new(buffer: ArrayBuffer, byteOffset?: number, length?: number): unknown })(
          clonedBuffer,
          view.byteOffset,
          'length' in value ? (value as { length: number }).length : undefined,
        );
    seen.set(source, clonedView);
    return clonedView as T;
  }

  if (value instanceof Map) {
    const clonedMap = new Map();
    seen.set(source, clonedMap);
    value.forEach((mapValue, key) => {
      clonedMap.set(cloneStructuredValue(key, seen), cloneStructuredValue(mapValue, seen));
    });
    return clonedMap as T;
  }

  if (value instanceof Set) {
    const clonedSet = new Set();
    seen.set(source, clonedSet);
    value.forEach((entry) => {
      clonedSet.add(cloneStructuredValue(entry, seen));
    });
    return clonedSet as T;
  }

  if (value instanceof WeakMap || value instanceof WeakSet || value instanceof Promise) {
    throw createStructuredCloneError();
  }

  if (Array.isArray(value)) {
    const clonedArray: unknown[] = [];
    seen.set(source, clonedArray);
    value.forEach((item, index) => {
      clonedArray[index] = cloneStructuredValue(item, seen);
    });
    return clonedArray as T;
  }

  const prototype = Object.getPrototypeOf(value);
  const clonedObject = Object.create(prototype ?? Object.prototype) as CloneableRecord;
  seen.set(source, clonedObject);

  for (const key of Reflect.ownKeys(value as object)) {
    const descriptor = Object.getOwnPropertyDescriptor(value as object, key);
    if (!descriptor) continue;

    if ('value' in descriptor) {
      descriptor.value = cloneStructuredValue((value as CloneableRecord)[key], seen);
    }

    Object.defineProperty(clonedObject, key, descriptor);
  }

  return clonedObject as T;
}

// ── structuredClone (Safari 15.4+) ──────────────────────────────────
if (typeof globalThis.structuredClone === 'undefined') {
  (globalThis as any).structuredClone = function structuredClone<T>(value: T): T {
    return cloneStructuredValue(value);
  };
}

// ── queueMicrotask (Safari 13+) ─────────────────────────────────────
if (typeof globalThis.queueMicrotask === 'undefined') {
  globalThis.queueMicrotask = function queueMicrotask(callback: VoidFunction) {
    Promise.resolve()
      .then(callback)
      .catch((error) => {
        setTimeout(() => {
          throw error;
        }, 0);
      });
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
if (!(String.prototype as any).replaceAll) {
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
if (typeof (Object as any).hasOwn === 'undefined') {
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
