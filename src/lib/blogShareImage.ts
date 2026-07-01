// Helper for building per-blog social share image URLs.
// Backed by the `blog-share-image` edge function so every blog post gets
// a custom OG/Twitter card that includes its banner, title, author and date.

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/blog-share-image`;

export interface BlogShareImageInput {
  slug: string;
  title: string;
  author?: string;
  date?: string; // human-readable string
  banner?: string | null; // absolute URL to the post banner
}

function absolutize(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (typeof window === "undefined") return url;
  return `${window.location.origin}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function getBlogShareImageUrl(
  input: BlogShareImageInput,
  width = 1200,
  height = 630,
  format: "png" | "svg" = "png",
): string {
  const params = new URLSearchParams();
  params.set("slug", input.slug);
  params.set("title", input.title.slice(0, 240));
  if (input.author) params.set("author", input.author.slice(0, 60));
  if (input.date) params.set("date", input.date.slice(0, 40));
  const banner = absolutize(input.banner ?? null);
  if (banner) params.set("banner", banner);
  params.set("width", String(width));
  params.set("height", String(height));
  params.set("format", format);
  return `${FUNCTIONS_BASE}?${params.toString()}`;
}
