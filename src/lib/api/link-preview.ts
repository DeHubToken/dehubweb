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

const previewCache = new Map<string, LinkPreviewData>();

export function getLinkPreviewFavicon(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`;
  } catch {
    return null;
  }
}

function compactPreview(url: string): LinkPreviewData {
  let domain = url;
  try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep the supplied link */ }
  return { url, title: domain, description: '', image: null, siteName: domain };
}

export async function fetchLinkPreview(url: string): Promise<LinkPreviewData | null> {
  const prediction = parsePredictionLink(url);
  if (prediction) return fetchPredictionPreview(prediction);
  const rich = parseRichLink(url);
  if (rich) return fetchRichPreview(rich);
  // Check cache first
  if (previewCache.has(url)) {
    return previewCache.get(url)!;
  }

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
      image: typeof data.image === 'string' ? data.image.replace(/&amp;/gi, '&') : null,
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
