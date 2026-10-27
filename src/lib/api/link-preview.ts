import { LruCache } from '../lru-cache';
import { supabase } from "@/integrations/supabase/client";
import { fetchPredictionPreview, parsePredictionLink, type PredictionPreview } from '../predictions';
import { fetchRichPreview, parseRichLink, extractShareUrls, type RichDetails } from '../rich-links';

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

  try {
    const { data, error } = await supabase.functions.invoke('fetch-link-preview', {
      body: { url },
    });

    if (error || !data || data.error) {
      console.error('Error fetching link preview:', error);
      return compactPreview(url);
    }

    const preview: LinkPreviewData = {
      url,
      title: data.title || compactPreview(url).title,
      description: data.description || '',
      // The preview endpoint can return an HTML-escaped OG URL. Its query
      // parameters must be decoded before the image renderer receives them.
      image: getLinkPreviewImage(url, data.image),
      siteName: data.siteName || compactPreview(url).siteName,
    };

    // Cache the result
    previewCache.set(url, preview);

    return preview;
  } catch (error) {
    console.error('Error fetching link preview:', error);
    return compactPreview(url);
  }
}

export function extractUrlsFromText(text: string): string[] {
  return extractShareUrls(text);
}
