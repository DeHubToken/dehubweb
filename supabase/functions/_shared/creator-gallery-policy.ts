/** Both billing and the completed renderer must prove this is a free Poster output. */
export function freePosterPng(
  request: { bannerRenderer?: unknown; sourceImage?: unknown; referenceImageUrls?: unknown },
  priceDhb: number,
  result: { success?: unknown; renderer?: unknown; imageUrl?: unknown },
): Uint8Array | null {
  if (priceDhb !== 0 || request.bannerRenderer !== 'template' || request.sourceImage
    || (Array.isArray(request.referenceImageUrls) && request.referenceImageUrls.length)
    || result.success !== true || result.renderer !== 'template'
    || typeof result.imageUrl !== 'string' || !result.imageUrl.startsWith('data:image/png;base64,')) return null;
  const encoded = result.imageUrl.slice('data:image/png;base64,'.length);
  if (encoded.length > 14_000_000) return null;
  try {
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length > 10 * 1024 * 1024 || !signature.every((byte, i) => bytes[i] === byte)) return null;
    return bytes;
  } catch { return null; }
}
