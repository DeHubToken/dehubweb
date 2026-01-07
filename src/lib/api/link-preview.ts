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
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  const matches = text.match(urlRegex);
  return matches ? [...new Set(matches)] : [];
}
