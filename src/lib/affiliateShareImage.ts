const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/affiliate-share-image`;

export function getAffiliateShareImageUrl(
  code: string | null | undefined,
  width = 1200,
  height = 630,
  format: "png" | "svg" = "png",
): string {
  const params = new URLSearchParams();
  if (code) params.set("code", code);
  params.set("width", String(width));
  params.set("height", String(height));
  params.set("format", format);
  return `${FUNCTIONS_BASE}?${params.toString()}`;
}