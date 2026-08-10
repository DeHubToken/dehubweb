/**
 * Feature Request Attachments
 * ===========================
 * A request carries its attachments in `image_urls`, with `image_url` mirroring
 * the first one for clients that predate the column. Reads go through
 * `featureAttachments` so both shapes resolve to one list and neither caller has
 * to know which era a row was written in.
 */

/** Matches the cardinality bound on feature_requests.image_urls. */
export const MAX_FEATURE_ATTACHMENTS = 6;

/** Per-file ceiling, unchanged from when the board took a single attachment. */
export const MAX_FEATURE_ATTACHMENT_BYTES = 20 * 1024 * 1024;

interface AttachmentSource {
  image_url?: string | null;
  image_urls?: string[] | null;
}

/**
 * Every attachment on a request, oldest-first.
 *
 * `image_urls` wins when present. Rows written before the column existed only
 * have `image_url`; rows written after have both, and the mirror can drift if a
 * client updates one without the other, so the array is the authority rather
 * than a source to merge.
 */
export function featureAttachments(feature: AttachmentSource | null | undefined): string[] {
  if (!feature) return [];

  const many = feature.image_urls;
  if (Array.isArray(many)) {
    const urls = many.filter((url): url is string => typeof url === 'string' && url.length > 0);
    if (urls.length > 0) return urls;
  }

  return typeof feature.image_url === 'string' && feature.image_url.length > 0
    ? [feature.image_url]
    : [];
}

const VIDEO_EXTENSIONS = /\.(mp4|mov|webm|ogg)(\?|#|$)/i;

/** Whether an attachment should render in a <video> rather than an <img>. */
export function isVideoAttachment(url: string): boolean {
  return VIDEO_EXTENSIONS.test(url);
}
