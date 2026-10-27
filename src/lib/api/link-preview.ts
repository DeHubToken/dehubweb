import { LruCache } from '../lru-cache';
import { supabase } from "@/integrations/supabase/client";
import { parseDehubLink } from '../dehub-links';
import { fetchPredictionPreview, forgetPredictionPreview, parsePredictionLink, type PredictionPreview } from '../predictions';
import { fetchRichPreview, forgetRichPreview, parseRichLink, extractShareUrls, type RichDetails } from '../rich-links';

export interface LinkPreviewData {
  url: string;
  title: string;
  description: string;
  image: string | null;
  siteName: string;
  prediction?: PredictionPreview['prediction'];
  rich?: RichDetails;
}

const previewCache = new LruCache<string, LinkPreviewData>(256);
const pendingPreviews = new Map<string, Promise<LinkPreviewData | null>>();
const refreshListeners = new Set<(url: string) => void>();

export function getLinkPreviewFavicon(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    // A missing icon must fail to load, not decode Google's default globe.
    const domain = `${parsed.protocol}//${parsed.hostname}`;
    return `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(domain)}&size=64&drop_404_icon=true`;
  } catch {
    return null;
  }
}

function compactPreview(url: string): LinkPreviewData {
  let domain = url;
  try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep the supplied link */ }
  return { url, title: domain, description: '', image: null, siteName: domain };
}

export function getLinkPreviewImage(url: string, image: unknown): string | null {
  const decodedImage = typeof image === 'string' ? image.replace(/&amp;/gi, '&') : null;
  if (!decodedImage) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    const cover = new URL(decodedImage);
    // Only C Drive's known near-empty cover needs the source-card fallback.
    if ((host === 'suno.com' || host === 'www.suno.com') &&
      cover.hostname === 'cdn2.suno.ai' &&
      cover.pathname === '/image_large_8b26dd51-6297-4403-9f25-e7e2e7d45c64.jpeg') return null;
  } catch { /* retain other preview images */ }
  return decodedImage;
}

export function fetchLinkPreview(url: string): Promise<LinkPreviewData | null> {
  const pending = pendingPreviews.get(url);
  if (pending) return pending;
  const request = loadLinkPreview(url).finally(() => pendingPreviews.delete(url));
  pendingPreviews.set(url, request);
  return request;
}

async function loadLinkPreview(url: string): Promise<LinkPreviewData | null> {
  const prediction = parsePredictionLink(url);
  if (prediction) return fetchPredictionPreview(prediction);
  const rich = parseRichLink(url);
  if (rich) return fetchRichPreview(rich);
  const cached = previewCache.get(url);
  if (cached) return cached;
  return crawlLinkPreview(url, false);
}

/**
 * A site that swaps its share image usually keeps the same image address, so
 * the browser keeps painting the old picture. A refreshed card asks for the
 * image with a one-off query mark, which sends it past every cache on the way.
 */
export function markRefreshedImage(image: string | null, stamp: number): string | null {
  if (!image) return image;
  try {
    const parsed = new URL(image);
    if (!/^https?:$/.test(parsed.protocol)) return image;
    parsed.searchParams.set('dhr', String(stamp));
    return parsed.href;
  } catch {
    return image;
  }
}

/** Cards showing a link re-read it when somebody refreshes it from a post menu. */
export function subscribeLinkPreviewRefresh(listener: (url: string) => void): () => void {
  refreshListeners.add(listener);
  return () => { refreshListeners.delete(listener); };
}

/**
 * Crawls the link again and repaints every card showing it. Returns false when
 * the site could not be read, so the menu can say so instead of claiming success.
 */
export async function refreshLinkPreview(url: string): Promise<boolean> {
  pendingPreviews.delete(url);
  let ok = true;
  const prediction = parsePredictionLink(url);
  const rich = parseRichLink(url);
  if (prediction) forgetPredictionPreview(prediction.url);
  else if (rich) await forgetRichPreview(rich.url);
  else ok = (await crawlLinkPreview(url, true)) !== null;
  refreshListeners.forEach((listener) => listener(url));
  return ok;
}

async function crawlLinkPreview(url: string, refresh: boolean): Promise<LinkPreviewData | null> {
  try {
    const { data, error } = await supabase.functions.invoke('fetch-link-preview', {
      body: refresh ? { url, refresh: true } : { url },
    });

    if (error || !data || data.error) {
      console.error('Error fetching link preview:', error);
      return refresh ? null : compactPreview(url);
    }

    const preview: LinkPreviewData = {
      url,
      title: data.title || compactPreview(url).title,
      description: data.description || '',
      // The preview endpoint can return an HTML-escaped OG URL. Its query
      // parameters must be decoded before the image renderer receives them.
      image: refresh ? markRefreshedImage(getLinkPreviewImage(url, data.image), Date.now()) : getLinkPreviewImage(url, data.image),
      siteName: data.siteName || compactPreview(url).siteName,
    };

    // Cache the result
    previewCache.set(url, preview);

    return preview;
  } catch (error) {
    console.error('Error fetching link preview:', error);
    return refresh ? null : compactPreview(url);
  }
}

export function extractUrlsFromText(text: string): string[] {
  return extractShareUrls(text);
}

/** The outside link whose card a post shows, if it shows one. DeHub links render as entity cards. */
export function previewedLinkUrl(text: string | null | undefined): string | undefined {
  return text ? extractUrlsFromText(text).find((url) => !parseDehubLink(url)) : undefined;
}
