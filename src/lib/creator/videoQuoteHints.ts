/** Media is staged to HTTPS before these callers submit a paid job. */
export function videoQuoteHints(options: { endFrameUrl?: string; audioUrls?: string[]; videoUrls?: string[] }) {
  return { hasEndFrame: !!options.endFrameUrl, hasAudioReferences: !!options.audioUrls?.length,
    hasVideoReferences: !!options.videoUrls?.length };
}
