/**
 * Build a CSS `url("…")` value from a runtime string.
 *
 * Badge artwork reaches the mask layer as a URL that may be a bundled asset
 * path or, for a profile's stored badge, an arbitrary remote one. Both can
 * contain quotes or backslashes, which would otherwise close the CSS string
 * early and silently drop the mask — leaving the plate as a filled rectangle
 * rather than the artwork's silhouette.
 */
export function cssUrl(url: string): string {
  const escaped = url
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]/g, '');
  return `url("${escaped}")`;
}
