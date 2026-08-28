import { supabase } from "@/integrations/supabase/client";

export interface LinkPreviewData {
  url: string;
  title: string;
  description: string;
  image: string | null;
  siteName: string;
}

const previewCache = new Map<string, LinkPreviewData>();

export async function fetchLinkPreview(url: string): Promise<LinkPreviewData | null> {
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
      image: data.image,
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

// Scheme optional, like dehub-links.ts's own ABSOLUTE_URL_RE - a bare
// "dehub.io/work" is exactly as much a link as "https://dehub.io/work" is,
// and TranslatableText's renderTextWithLinks already linkifies it that way.
// This one used to require the scheme, so a comment or caption reading
// "check this out: dehub.io/work" got no preview card at all: the text
// rendered as a clickable link just fine, but nothing here ever saw it as a
// URL worth fetching.
const URL_REGEX = /(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d+)?\/[^\s<>\u0080-\uFFFF]*/g;

export function extractUrlsFromText(text: string): string[] {
  // Match URLs but be more careful about boundaries
  const matches = text.match(URL_REGEX);
  if (!matches) return [];

  // Clean URLs - remove trailing punctuation that shouldn't be part of URLs,
  // then normalize to an absolute URL so every downstream caller (the fetch,
  // `new URL(...)` calls, cache keys) can assume a scheme is always present.
  const cleaned = matches.map(url => {
    const trimmed = url.replace(/[.,;:!?)}\]]+$/, ''); // Remove trailing punctuation
    return trimmed.match(/^https?:\/\//i) ? trimmed : `https://${trimmed}`;
  });

  return [...new Set(cleaned)];
}
