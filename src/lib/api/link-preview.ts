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

    if (error) {
      console.error('Error fetching link preview:', error);
      return null;
    }

    const preview: LinkPreviewData = {
      url: data.url,
      title: data.title,
      description: data.description,
      // The preview endpoint can return an HTML-escaped OG URL. Its query
      // parameters must be decoded before the image renderer receives them.
      image: typeof data.image === 'string' ? data.image.replace(/&amp;/gi, '&') : null,
      siteName: data.siteName,
    };

    // Cache the result
    previewCache.set(url, preview);

    return preview;
  } catch (error) {
    console.error('Error fetching link preview:', error);
    return null;
  }
}

export function extractUrlsFromText(text: string): string[] {
  return extractShareUrls(text);
}
