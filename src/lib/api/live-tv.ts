/**
 * Live TV API Client
 * ==================
 * Fetches and parses IPTV channels from Free-TV curated playlist.
 * All channels are legally free to stream and actively maintained.
 * 
 * @module lib/api/live-tv
 */

// ============================================================================
// TYPES
// ============================================================================

export interface TVChannel {
  id: string;
  name: string;
  logo: string | null;
  category: string;
  streamUrl: string;
  country: string;
  languages: string[];
}

export type TVCategoryId = 
  | 'all'
  | 'us'
  | 'uk'
  | 'de'
  | 'fr'
  | 'es'
  | 'it'
  | 'in'
  | 'br'
  | 'mx'
  | 'ca'
  | 'au'
  | 'other';

export interface TVCategory {
  id: TVCategoryId;
  label: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const FREE_TV_PLAYLIST_URL = 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8';

export const TV_CATEGORIES: TVCategory[] = [
  { id: 'all', label: 'All' },
  { id: 'us', label: '🇺🇸 USA' },
  { id: 'uk', label: '🇬🇧 UK' },
  { id: 'de', label: '🇩🇪 Germany' },
  { id: 'fr', label: '🇫🇷 France' },
  { id: 'es', label: '🇪🇸 Spain' },
  { id: 'it', label: '🇮🇹 Italy' },
  { id: 'in', label: '🇮🇳 India' },
  { id: 'br', label: '🇧🇷 Brazil' },
  { id: 'mx', label: '🇲🇽 Mexico' },
  { id: 'ca', label: '🇨🇦 Canada' },
  { id: 'au', label: '🇦🇺 Australia' },
  { id: 'other', label: '🌍 Other' },
];

// Country name to category ID mapping
const COUNTRY_TO_CATEGORY: Record<string, TVCategoryId> = {
  'united states': 'us',
  'usa': 'us',
  'united kingdom': 'uk',
  'uk': 'uk',
  'germany': 'de',
  'deutschland': 'de',
  'france': 'fr',
  'spain': 'es',
  'españa': 'es',
  'italy': 'it',
  'italia': 'it',
  'india': 'in',
  'brazil': 'br',
  'brasil': 'br',
  'mexico': 'mx',
  'méxico': 'mx',
  'canada': 'ca',
  'australia': 'au',
};

// ============================================================================
// CACHE
// ============================================================================

let channelsCache: TVChannel[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate a simple hash ID from a URL
 */
function generateIdFromUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `ch-${Math.abs(hash).toString(36)}`;
}

/**
 * Map group-title (country name) to category ID
 */
function mapCountryToCategory(groupTitle: string): TVCategoryId {
  const normalized = groupTitle.toLowerCase().trim();
  return COUNTRY_TO_CATEGORY[normalized] || 'other';
}

/**
 * Check if URL is a valid, playable stream
 * Filters out problematic stream types
 */
function isValidStream(url: string, name: string): boolean {
  const lowerUrl = url.toLowerCase();
  
  // Skip non-HLS formats (DASH not supported by HLS.js)
  if (lowerUrl.includes('.mpd')) return false;
  
  // Skip YouTube/Twitch/Dailymotion (require special handling)
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) return false;
  if (lowerUrl.includes('twitch.tv')) return false;
  if (lowerUrl.includes('dailymotion.com')) return false;
  
  // Skip HTTP streams (mixed content issues in HTTPS pages)
  if (url.startsWith('http://')) return false;
  
  // Skip geo-restricted channels (marked with Ⓖ in Free-TV)
  if (name.includes('Ⓖ')) return false;
  
  // Only allow HLS streams for reliable playback
  return lowerUrl.includes('.m3u8');
}

/**
 * Parse M3U8 playlist content into TVChannel array
 */
function parseM3U8Playlist(content: string): TVChannel[] {
  const lines = content.split('\n');
  const channels: TVChannel[] = [];
  const seenUrls = new Set<string>();
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.startsWith('#EXTINF:')) {
      // Extract metadata from EXTINF line
      const nameMatch = line.match(/tvg-name="([^"]+)"/);
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      const groupMatch = line.match(/group-title="([^"]+)"/);
      const titleMatch = line.match(/,(.+)$/);
      
      // Next non-comment line is the stream URL
      let streamUrl = '';
      for (let j = i + 1; j < lines.length && j < i + 3; j++) {
        const nextLine = lines[j]?.trim();
        if (nextLine && !nextLine.startsWith('#')) {
          streamUrl = nextLine;
          break;
        }
      }
      
      const name = nameMatch?.[1] || titleMatch?.[1] || 'Unknown Channel';
      
      // Validate stream URL
      if (!streamUrl || seenUrls.has(streamUrl)) continue;
      if (!isValidStream(streamUrl, name)) continue;
      
      seenUrls.add(streamUrl);
      
      // name already extracted above
      const groupTitle = groupMatch?.[1] || 'Other';
      
      channels.push({
        id: generateIdFromUrl(streamUrl),
        name: name.trim(),
        logo: logoMatch?.[1] || null,
        category: mapCountryToCategory(groupTitle),
        streamUrl: streamUrl,
        country: groupTitle,
        languages: [],
      });
    }
  }
  
  return channels;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Fetch all channels from Free-TV playlist
 */
async function fetchAllChannels(): Promise<TVChannel[]> {
  const now = Date.now();
  // Check cache (but force refresh if cache is from old session)
  if (channelsCache && channelsCache.length > 0 && now - cacheTimestamp < CACHE_TTL) {
    return channelsCache;
  }
  
  // Add cache-bust to force fresh playlist data
  const response = await fetch(`${FREE_TV_PLAYLIST_URL}?_=${now}`);
  if (!response.ok) {
    throw new Error('Failed to fetch TV channels');
  }
  
  const content = await response.text();
  channelsCache = parseM3U8Playlist(content);
  cacheTimestamp = now;
  
  return channelsCache;
}

/**
 * Get TV channels by country category
 */
export async function getTVChannelsByCategory(
  category: TVCategoryId,
  limit: number = 50
): Promise<TVChannel[]> {
  const allChannels = await fetchAllChannels();
  
  let filtered: TVChannel[];
  
  if (category === 'all') {
    filtered = allChannels;
  } else {
    filtered = allChannels.filter((ch) => ch.category === category);
  }
  
  // Sort: channels with logos first, then by name
  filtered.sort((a, b) => {
    if (a.logo && !b.logo) return -1;
    if (!a.logo && b.logo) return 1;
    return a.name.localeCompare(b.name);
  });
  
  return filtered.slice(0, limit);
}

/**
 * Search TV channels by name
 */
export async function searchTVChannels(
  query: string,
  limit: number = 50
): Promise<TVChannel[]> {
  if (!query.trim()) {
    return getTVChannelsByCategory('all', limit);
  }
  
  const allChannels = await fetchAllChannels();
  const queryLower = query.toLowerCase();
  
  const results = allChannels.filter((ch) => {
    return (
      ch.name.toLowerCase().includes(queryLower) ||
      ch.country.toLowerCase().includes(queryLower)
    );
  });
  
  // Sort by relevance
  results.sort((a, b) => {
    const aExact = a.name.toLowerCase() === queryLower;
    const bExact = b.name.toLowerCase() === queryLower;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    
    const aStarts = a.name.toLowerCase().startsWith(queryLower);
    const bStarts = b.name.toLowerCase().startsWith(queryLower);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    
    if (a.logo && !b.logo) return -1;
    if (!a.logo && b.logo) return 1;
    
    return a.name.localeCompare(b.name);
  });
  
  return results.slice(0, limit);
}

/**
 * Get total count of available channels
 */
export async function getTVChannelCount(): Promise<number> {
  const allChannels = await fetchAllChannels();
  return allChannels.length;
}

/**
 * Get country flag emoji from country code
 */
export function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  
  return String.fromCodePoint(...codePoints);
}
