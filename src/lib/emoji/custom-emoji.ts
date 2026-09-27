/**
 * Custom emoji: the platform-wide :shortcode: → image set.
 *
 * Read from `custom_emojis` (public), cached for the session and shared by
 * every picker and every rendered message through a tiny subscribe/notify
 * store — a message list mounts hundreds of rows, and none of them should
 * refetch. Writes go through a wallet-scoped client so RLS can see who is
 * adding or removing.
 *
 * Adding emoji (uploads, provider links, packs) lives in custom-emoji-import,
 * which only the add form loads — this file sits on the first-paint path
 * because every rendered message can contain a :shortcode:.
 */

import { supabase } from '@/integrations/supabase/client';

export interface CustomEmoji {
  id: string;
  shortcode: string;
  image_url: string;
  animated: boolean;
  source: string;
  category: string | null;
  created_by: string;
}

let emojis: CustomEmoji[] = [];
let byCode = new Map<string, CustomEmoji>();
let loaded = false;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: CustomEmoji[]) {
  emojis = next.slice().sort((a, b) => a.shortcode.localeCompare(b.shortcode));
  byCode = new Map(emojis.map((e) => [e.shortcode, e]));
  loaded = true;
  listeners.forEach((l) => l());
}

export function subscribeCustomEmojis(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCustomEmojis(): CustomEmoji[] {
  return emojis;
}

export function getCustomEmoji(code: string): CustomEmoji | undefined {
  return byCode.get(code.toLowerCase());
}

export function customEmojisLoaded(): boolean {
  return loaded;
}

export function loadCustomEmojis(force = false): Promise<void> {
  if (loaded && !force) return Promise.resolve();
  if (!pending) {
    pending = (async () => {
      try {
        const { data, error } = await supabase
          .from('custom_emojis' as never)
          .select('id, shortcode, image_url, animated, source, category, created_by')
          .order('shortcode')
          .limit(10000);
        if (error) throw error;
        publish((data ?? []) as unknown as CustomEmoji[]);
      } catch (err) {
        // Missing table (not migrated yet) or offline: behave as an empty set
        // rather than break every message that happens to contain a colon.
        console.warn('[custom-emoji] load failed', err);
        if (!loaded) publish([]);
      } finally {
        pending = null;
      }
    })();
  }
  return pending;
}

/** Folds rows the add form just wrote into the shared set. */
export function mergeCustomEmojis(added: CustomEmoji[]) {
  publish(emojis.concat(added));
}

export function dropCustomEmoji(id: string) {
  publish(emojis.filter((e) => e.id !== id));
}
