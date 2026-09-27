const CDN_BASE = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com/';
const TAG = /\[soundtrack:(\d+):([^:]*):([^:\]]*):?([^\]]*)\]/;

const decodeField = (value: string) => {
  try { return decodeURIComponent(value); } catch { return value; }
};

export function parseSoundtrackTag(description?: string | null): { soundtrackUrl?: string; soundtrackTitle?: string; soundtrackCreator?: string } {
  const match = description?.match(TAG);
  if (!match) return {};
  const path = match[4]?.trim();
  let url: URL;
  try {
    url = new URL(path || `feed-audio/${match[1]}-audio.mp3`, CDN_BASE);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return {};
  } catch { return {}; }
  return {
    soundtrackUrl: url.href,
    soundtrackTitle: decodeField(match[2]) || 'Sound',
    soundtrackCreator: decodeField(match[3]),
  };
}

export function buildSoundtrackTag(sound: { tokenId: string; title: string; creator: string; url?: string }): string {
  const path = sound.url?.startsWith(CDN_BASE) ? sound.url.slice(CDN_BASE.length) : sound.url;
  // Encode delimiters in metadata, leaving the optional URL as a single tail field.
  return `[soundtrack:${sound.tokenId}:${encodeURIComponent(sound.title)}:${encodeURIComponent(sound.creator)}${path ? `:${path.replace(/\]/g, '%5D')}` : ''}]`;
}
