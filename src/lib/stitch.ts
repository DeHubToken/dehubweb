/**
 * Stitches: up to 5 seconds of someone's video, then your own clip, posted as
 * one video. The link back to the original (credit, the Stitches list and
 * count, the "Allow stitches" setting, the notification and the tip split)
 * lives in remix-links.
 */

export function stitchCaption(creator?: string): string {
  return creator ? `Stitched from @${creator} #stitch` : 'Stitch #stitch';
}
