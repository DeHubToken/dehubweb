export function agentPostType(hasMedia: boolean, isVideo: boolean, mint: boolean): "video" | "feed-images" | "feed-simple" {
  if (isVideo) return "video";
  return hasMedia || mint ? "feed-images" : "feed-simple";
}
