/**
 * Custom emoji: the platform-wide :shortcode: → image set.
 *
 * Read from `custom_emojis` (public), cached for the session and shared by
 * every picker and every rendered message through a tiny subscribe/notify
 * store — a message list mounts hundreds of rows, and none of them should
 * refetch. Writes go through a wallet-scoped client so RLS can see who is
 * adding or removing.
 *
 * Third-party sources are normalised here, so the rest of the app only ever
 * deals with "a name and an https image":
 *   Discord  <:name:id> / <a:name:id>, or a cdn.discordapp.com/emojis/… link
 *   7TV      7tv.app/emotes/<id>
 *   BTTV     betterttv.com/emotes/<id>
 *   FFZ      frankerfacez.com/emoticon/<id>-<name>
 *   Any      a direct https image link (emoji.gg, Slackmojis, a Slack export…)
 *   Packs    a Mastodon/Pleroma/Akkoma instance, a Misskey instance, or any
 *            JSON list in either shape (see importEmojiPack)
 */

import { supabase } from '@/integrations/supabase/client';
import { walletScopedClient } from '@/lib/supabase-wallet-client';
import { discordEmojiUrl, isValidShortcode } from './tokens';
import { loadShortcodes } from './shortcodes';

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

// ---------------------------------------------------------------------------
// Parsing what people paste

export interface EmojiSource {
  name?: string;
  imageUrl: string;
  animated: boolean;
  source: string;
  externalId?: string;
}

const IMAGE_EXT = /\.(png|gif|webp|apng|jpe?g|avif)(\?.*)?$/i;

/** Turns whatever was pasted — a Discord code, a provider link, an image URL — into an image. */
export function parseEmojiSource(input: string): EmojiSource | null {
  const s = input.trim();
  if (!s) return null;

  const discord = s.match(/^<(a?):([a-zA-Z0-9_~-]{1,64}):(\d{5,25})>$/);
  if (discord) {
    const animated = discord[1] === 'a';
    return { name: discord[2], imageUrl: discordEmojiUrl(discord[3], animated), animated, source: 'discord', externalId: discord[3] };
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  const host = url.hostname.replace(/^www\./, '');
  const path = url.pathname;

  if (host === 'cdn.discordapp.com' || host === 'media.discordapp.net') {
    const m = path.match(/^\/emojis\/(\d+)\.(\w+)/);
    if (m) {
      const animated = m[2] === 'gif' || url.searchParams.get('animated') === 'true';
      return { name: url.searchParams.get('name') ?? undefined, imageUrl: discordEmojiUrl(m[1], animated), animated, source: 'discord', externalId: m[1] };
    }
  }
  if (host === '7tv.app' || host === 'old.7tv.app') {
    const m = path.match(/^\/emotes\/([a-zA-Z0-9]+)/);
    if (m) return { imageUrl: `https://cdn.7tv.app/emote/${m[1]}/2x.webp`, animated: true, source: '7tv', externalId: m[1] };
  }
  if (host === 'betterttv.com') {
    const m = path.match(/^\/emotes\/([a-f0-9]+)/i);
    if (m) return { imageUrl: `https://cdn.betterttv.net/emote/${m[1]}/2x`, animated: false, source: 'bttv', externalId: m[1] };
  }
  if (host === 'frankerfacez.com') {
    const m = path.match(/^\/emoticon\/(\d+)(?:-([\w-]+))?/);
    if (m) return { name: m[2], imageUrl: `https://cdn.frankerfacez.com/emote/${m[1]}/2`, animated: false, source: 'ffz', externalId: m[1] };
  }

  const file = path.split('/').pop() ?? '';
  const guessedName = file.replace(IMAGE_EXT, '').replace(/^\d+[-_]/, '');
  return {
    name: guessedName || undefined,
    imageUrl: url.toString(),
    animated: /\.gif(\?|$)/i.test(path),
    source: /slackmojis\.com$/.test(host) ? 'slack' : /emoji\.gg$/.test(host) ? 'emoji.gg' : 'url',
  };
}

/** Lowercase, spaces → _, drop anything a shortcode cannot hold. */
export function normaliseShortcode(raw: string): string {
  return raw
    .trim()
    .replace(/^:|:$/g, '')
    .toLowerCase()
    .replace(/[\s.]+/g, '_')
    .replace(/[^a-z0-9_+-]/g, '')
    .slice(0, 64);
}

export type ShortcodeProblem = 'invalid' | 'standard' | 'taken' | null;

/** Why a name cannot be used, or null. Standard names always mean the Unicode emoji. */
export async function checkShortcode(code: string): Promise<ShortcodeProblem> {
  if (!isValidShortcode(code)) return 'invalid';
  const standard = await loadShortcodes().catch(() => null);
  if (standard && code in standard) return 'standard';
  if (getCustomEmoji(code)) return 'taken';
  return null;
}

/** Resolves once the image actually decodes — a dead link never gets registered. */
export function probeImage(src: string, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(false), timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth > 0); };
    img.onerror = () => { clearTimeout(timer); resolve(false); };
    img.referrerPolicy = 'no-referrer';
    img.src = src;
  });
}

// ---------------------------------------------------------------------------
// Writes

export const MAX_EMOJI_UPLOAD_BYTES = 2 * 1024 * 1024;
export const EMOJI_UPLOAD_TYPES = ['image/png', 'image/gif', 'image/webp', 'image/jpeg'];

export async function uploadEmojiImage(file: File, wallet: string): Promise<string> {
  if (!EMOJI_UPLOAD_TYPES.includes(file.type)) throw new Error('unsupported_type');
  if (file.size > MAX_EMOJI_UPLOAD_BYTES) throw new Error('too_large');
  const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
  const path = `custom-emojis/${wallet.toLowerCase()}/${crypto.randomUUID()}.${ext}`;
  const client = walletScopedClient(wallet);
  const { error } = await client.storage
    .from('community-media')
    .upload(path, file, { cacheControl: '31536000', contentType: file.type });
  if (error) throw error;
  return client.storage.from('community-media').getPublicUrl(path).data.publicUrl;
}

export interface NewCustomEmoji {
  shortcode: string;
  imageUrl: string;
  animated: boolean;
  source: string;
  externalId?: string;
  category?: string;
}

export async function addCustomEmojis(items: NewCustomEmoji[], wallet: string): Promise<CustomEmoji[]> {
  if (!items.length) return [];
  const rows = items.map((i) => ({
    shortcode: i.shortcode,
    image_url: i.imageUrl,
    animated: i.animated,
    source: i.source,
    external_id: i.externalId ?? null,
    category: i.category ?? null,
    created_by: wallet.toLowerCase(),
  }));
  const { data, error } = await walletScopedClient(wallet)
    .from('custom_emojis' as never)
    .insert(rows as never)
    .select('id, shortcode, image_url, animated, source, category, created_by');
  if (error) throw error;
  const added = (data ?? []) as unknown as CustomEmoji[];
  publish(emojis.concat(added));
  return added;
}

export async function removeCustomEmoji(id: string, wallet: string): Promise<void> {
  const { error } = await walletScopedClient(wallet).from('custom_emojis' as never).delete().eq('id', id);
  if (error) throw error;
  publish(emojis.filter((e) => e.id !== id));
}

// ---------------------------------------------------------------------------
// Packs

interface PackItem { shortcode: string; imageUrl: string; animated: boolean; category?: string }

/**
 * Reads an emoji pack from another service. Accepts:
 *   - a bare instance ("mastodon.social", "misskey.io") — tries Mastodon's
 *     /api/v1/custom_emojis, then Misskey's /api/emojis
 *   - any URL returning either JSON shape, or a plain array of
 *     { name|shortcode, url|static_url }
 */
export async function fetchEmojiPack(input: string): Promise<PackItem[]> {
  const raw = input.trim();
  const candidates: string[] = [];
  if (/^https?:\/\/[^/]+\/.+/i.test(raw)) candidates.push(raw);
  else {
    const host = raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    candidates.push(`https://${host}/api/v1/custom_emojis`, `https://${host}/api/emojis`);
  }
  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      const json = await res.json();
      const list: unknown[] = Array.isArray(json) ? json : Array.isArray(json?.emojis) ? json.emojis : [];
      const items: PackItem[] = [];
      for (const it of list as Record<string, unknown>[]) {
        const name = String(it.shortcode ?? it.name ?? '');
        const img = String(it.url ?? it.static_url ?? it.image ?? '');
        const shortcode = normaliseShortcode(name);
        if (!isValidShortcode(shortcode) || !/^https?:\/\//i.test(img)) continue;
        items.push({
          shortcode,
          imageUrl: img.replace(/^http:/i, 'https:'),
          animated: /\.gif(\?|$)/i.test(img) || it.animated === true,
          category: typeof it.category === 'string' ? it.category : undefined,
        });
      }
      if (items.length) return items;
    } catch {
      // CORS refusal or not JSON: try the next shape.
    }
  }
  return [];
}
