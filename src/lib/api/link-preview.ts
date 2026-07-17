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

export function extractUrlsFromText(text: string): string[] {
  // Match URLs but be more careful about boundaries
  const urlRegex = /(https?:\/\/[^\s<>\u0080-\uFFFF]+)/g;
  const matches = text.match(urlRegex);
  if (!matches) return [];
  
  // Clean URLs - remove trailing punctuation that shouldn't be part of URLs
  const cleaned = matches.map(url => 
    url.replace(/[.,;:!?)}\]]+$/, '') // Remove trailing punctuation
  );
  
  return [...new Set(cleaned)];
}
