/**
 * Toast i18n Interceptor
 * ======================
 * Monkey-patches sonner's toast methods to auto-translate messages
 * via i18n. Import this file early in the app (e.g. main.tsx) to
 * enable translation for ALL toast calls without changing any imports.
 *
 * Keys are normalized from English strings:
 *   "Failed to send message" → toasts.failed_to_send_message
 *
 * Falls back to the original English string if no translation exists.
 */

import { toast } from 'sonner';
import i18n from '@/i18n';

/** Normalize an English string to a flat i18n key */
function normalizeToKey(msg: string): string {
  return msg
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

/** Translate a toast message string via i18n */
function tr(msg: unknown): unknown {
  if (typeof msg !== 'string') return msg;
  const key = `toasts.${normalizeToKey(msg)}`;
  return i18n.t(key, { defaultValue: msg });
}

/** Translate description in options if present */
function trOpts(opts?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!opts || typeof opts !== 'object') return opts;
  if (typeof opts.description === 'string') {
    return { ...opts, description: tr(opts.description) as string };
  }
  return opts;
}

// Patch all sonner toast methods
const methodNames = ['success', 'error', 'info', 'warning', 'loading', 'message'] as const;

for (const method of methodNames) {
  const original = (toast as any)[method];
  if (typeof original === 'function') {
    (toast as any)[method] = (msg: unknown, opts?: Record<string, unknown>) => {
      return original(tr(msg), trOpts(opts));
    };
  }
}

// Note: bare toast() calls (used as a function) cannot be intercepted
// via monkey-patching since modules hold a reference to the original function.
// Only 2 such calls exist in the codebase and they use toast.info-like semantics.
