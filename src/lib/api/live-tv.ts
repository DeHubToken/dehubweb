/**
 * Live TV API Client
 * ==================
 * Fetches and parses IPTV channels from iptv-org's publicly available streams.
 * All channels are legally free to stream.
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
  | 'news' 
  | 'entertainment' 
  | 'sports' 
  | 'music' 
  | 'movies' 
  | 'kids' 
  | 'documentary'
  | 'animation'
  | 'classic'
  | 'comedy'
  | 'cooking'
  | 'culture'
  | 'education'
  | 'family'
  | 'general'
  | 'lifestyle'
  | 'outdoor'
  | 'relax'
  | 'religious'
  | 'science'
  | 'series'
  | 'shop'
  | 'travel'
  | 'weather'
  | 'xxx';

export interface TVCategory {
  id: TVCategoryId;
  label: string;
  icon?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const IPTV_API_BASE = 'https://iptv-org.github.io/api';
const IPTV_STREAMS_BASE = 'https://iptv-org.github.io/iptv';

export const TV_CATEGORIES: TVCategory[] = [
  { id: 'all', label: 'All' },
  { id: 'news', label: 'News' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'sports', label: 'Sports' },
  { id: 'music', label: 'Music' },
  { id: 'movies', label: 'Movies' },
  { id: 'kids', label: 'Kids' },
  { id: 'documentary', label: 'Documentary' },
  { id: 'animation', label: 'Animation' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'cooking', label: 'Cooking' },
  { id: 'education', label: 'Education' },
  { id: 'lifestyle', label: 'Lifestyle' },
  { id: 'travel', label: 'Travel' },
  { id: 'science', label: 'Science' },
];

// ============================================================================
// API TYPES (from iptv-org)
// ============================================================================

interface IPTVChannel {
  id: string;
  name: string;
  alt_names: string[];
  network: string | null;
  owners: string[];
  country: string;
  subdivision: string | null;
  city: string | null;
  broadcast_area: string[];
  languages: string[];
  categories: string[];
  is_nsfw: boolean;
  launched: string | null;
  closed: string | null;
  replaced_by: string | null;
  website: string | null;
  logo: string;
}

interface IPTVStream {
  channel: string;
  url: string;
  http_referrer: string | null;
  user_agent: string | null;
}

// ============================================================================
// CACHE
// ============================================================================

let channelsCache: IPTVChannel[] | null = null;
let streamsCache: IPTVStream[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Fetch all channels metadata from iptv-org API
 */
async function fetchChannels(): Promise<IPTVChannel[]> {
  const now = Date.now();
  if (channelsCache && now - cacheTimestamp < CACHE_TTL) {
    return channelsCache;
  }
  
  const response = await fetch(`${IPTV_API_BASE}/channels.json`);
  if (!response.ok) {
    throw new Error('Failed to fetch TV channels');
  }
  
  channelsCache = await response.json();
  cacheTimestamp = now;
  return channelsCache!;
}

/**
 * Fetch all available streams from iptv-org API
 */
async function fetchStreams(): Promise<IPTVStream[]> {
  const now = Date.now();
  if (streamsCache && now - cacheTimestamp < CACHE_TTL) {
    return streamsCache;
  }
  
  const response = await fetch(`${IPTV_API_BASE}/streams.json`);
  if (!response.ok) {
    throw new Error('Failed to fetch TV streams');
  }
  
  streamsCache = await response.json();
  return streamsCache!;
}

/**
 * Map IPTV channel + stream to our TVChannel type
 */
function mapToTVChannel(channel: IPTVChannel, streamUrl: string): TVChannel {
  return {
    id: channel.id,
    name: channel.name,
    logo: channel.logo || null,
    category: channel.categories[0] || 'general',
    streamUrl,
    country: channel.country,
    languages: channel.languages,
  };
}

/**
 * Get TV channels by category with active streams
 */
export async function getTVChannelsByCategory(
  category: TVCategoryId,
  limit: number = 50
): Promise<TVChannel[]> {
  const [channels, streams] = await Promise.all([
    fetchChannels(),
    fetchStreams(),
  ]);
  
  // Create a map of channel ID to stream URL
  const streamMap = new Map<string, string>();
  for (const stream of streams) {
    if (!streamMap.has(stream.channel)) {
      streamMap.set(stream.channel, stream.url);
    }
  }
  
  // Filter channels that have streams and match category
  let filtered = channels.filter((ch) => {
    // Must have a stream
    if (!streamMap.has(ch.id)) return false;
    
    // Filter out NSFW content
    if (ch.is_nsfw) return false;
    
    // Filter out closed channels
    if (ch.closed) return false;
    
    // Filter by category
    if (category !== 'all') {
      const hasCategory = ch.categories.some(
        (cat) => cat.toLowerCase() === category.toLowerCase()
      );
      if (!hasCategory) return false;
    }
    
    return true;
  });
  
  // Sort by name for consistency
  filtered.sort((a, b) => a.name.localeCompare(b.name));
  
  // Limit results
  filtered = filtered.slice(0, limit);
  
  // Map to our format
  return filtered.map((ch) => mapToTVChannel(ch, streamMap.get(ch.id)!));
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
  
  const [channels, streams] = await Promise.all([
    fetchChannels(),
    fetchStreams(),
  ]);
  
  // Create a map of channel ID to stream URL
  const streamMap = new Map<string, string>();
  for (const stream of streams) {
    if (!streamMap.has(stream.channel)) {
      streamMap.set(stream.channel, stream.url);
    }
  }
  
  const queryLower = query.toLowerCase();
  
  // Filter channels that match search and have streams
  let filtered = channels.filter((ch) => {
    // Must have a stream
    if (!streamMap.has(ch.id)) return false;
    
    // Filter out NSFW content
    if (ch.is_nsfw) return false;
    
    // Filter out closed channels
    if (ch.closed) return false;
    
    // Match by name or alt names
    const nameMatch = ch.name.toLowerCase().includes(queryLower);
    const altMatch = ch.alt_names.some((alt) => 
      alt.toLowerCase().includes(queryLower)
    );
    const networkMatch = ch.network?.toLowerCase().includes(queryLower) || false;
    
    return nameMatch || altMatch || networkMatch;
  });
  
  // Sort by relevance (exact matches first)
  filtered.sort((a, b) => {
    const aExact = a.name.toLowerCase() === queryLower;
    const bExact = b.name.toLowerCase() === queryLower;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    
    const aStarts = a.name.toLowerCase().startsWith(queryLower);
    const bStarts = b.name.toLowerCase().startsWith(queryLower);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    
    return a.name.localeCompare(b.name);
  });
  
  // Limit results
  filtered = filtered.slice(0, limit);
  
  // Map to our format
  return filtered.map((ch) => mapToTVChannel(ch, streamMap.get(ch.id)!));
}

/**
 * Get total count of available channels
 */
export async function getTVChannelCount(): Promise<number> {
  const [channels, streams] = await Promise.all([
    fetchChannels(),
    fetchStreams(),
  ]);
  
  const streamChannelIds = new Set(streams.map((s) => s.channel));
  
  return channels.filter((ch) => 
    streamChannelIds.has(ch.id) && !ch.is_nsfw && !ch.closed
  ).length;
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
