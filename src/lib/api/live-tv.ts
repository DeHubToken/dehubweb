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
  referrer?: string | null;
  userAgent?: string | null;
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
  channel: string | null;
  feed: string | null;
  title: string;
  url: string;
  referrer: string | null;
  user_agent: string | null;
  quality: string | null;
}

// ============================================================================
// CACHE
// ============================================================================

let channelsCache: IPTVChannel[] | null = null;
let streamsCache: IPTVStream[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate a simple hash ID from a URL for orphan streams
 */
function generateIdFromUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `orphan-${Math.abs(hash).toString(36)}`;
}

/**
 * Parse quality string to numeric value for sorting
 */
function parseQuality(quality: string | null): number {
  if (!quality) return 0;
  const match = quality.match(/(\d+)p?/i);
  return match ? parseInt(match[1], 10) : 0;
}

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
 * Build TVChannel from stream + optional channel metadata
 */
function buildTVChannel(
  stream: IPTVStream,
  channelMeta: IPTVChannel | null
): TVChannel {
  if (channelMeta) {
    // Linked stream with full metadata
    return {
      id: channelMeta.id,
      name: channelMeta.name,
      logo: channelMeta.logo || null,
      category: channelMeta.categories[0] || 'general',
      streamUrl: stream.url,
      country: channelMeta.country,
      languages: channelMeta.languages,
      referrer: stream.referrer,
      userAgent: stream.user_agent,
    };
  }
  
  // Orphan stream - create from stream data
  return {
    id: generateIdFromUrl(stream.url),
    name: stream.title || 'Unknown Channel',
    logo: null,
    category: 'general',
    streamUrl: stream.url,
    country: 'INT',
    languages: [],
    referrer: stream.referrer,
    userAgent: stream.user_agent,
  };
}

/**
 * Get TV channels by category with active streams
 * Now streams-first approach: iterate streams and enrich with channel metadata
 */
export async function getTVChannelsByCategory(
  category: TVCategoryId,
  limit: number = 50
): Promise<TVChannel[]> {
  const [channels, streams] = await Promise.all([
    fetchChannels(),
    fetchStreams(),
  ]);
  
  // Build channel metadata map by ID
  const channelMap = new Map<string, IPTVChannel>();
  for (const ch of channels) {
    channelMap.set(ch.id, ch);
  }
  
  // Track best stream per channel (prefer higher quality)
  const bestStreams = new Map<string, { stream: IPTVStream; quality: number; channelMeta: IPTVChannel | null }>();
  
  for (const stream of streams) {
    // Skip invalid URLs
    if (!stream.url) continue;
    
    const channelMeta = stream.channel ? channelMap.get(stream.channel) || null : null;
    
    // Filter out NSFW and closed channels
    if (channelMeta?.is_nsfw || channelMeta?.closed) continue;
    
    // For category filtering, only linked channels can be filtered
    if (category !== 'all' && channelMeta) {
      const hasCategory = channelMeta.categories.some(
        (cat) => cat.toLowerCase() === category.toLowerCase()
      );
      if (!hasCategory) continue;
    }
    
    // For orphan streams, only include in 'all' category
    if (category !== 'all' && !channelMeta) continue;
    
    // Use channel ID or URL as unique key
    const uniqueKey = stream.channel || stream.url;
    const quality = parseQuality(stream.quality);
    
    const existing = bestStreams.get(uniqueKey);
    if (!existing || quality > existing.quality) {
      bestStreams.set(uniqueKey, { stream, quality, channelMeta });
    }
  }
  
  // Build TVChannel array
  const result: TVChannel[] = [];
  for (const { stream, channelMeta } of bestStreams.values()) {
    result.push(buildTVChannel(stream, channelMeta));
  }
  
  // Sort: channels with logos first, then by name
  result.sort((a, b) => {
    if (a.logo && !b.logo) return -1;
    if (!a.logo && b.logo) return 1;
    return a.name.localeCompare(b.name);
  });
  
  // Limit results
  return result.slice(0, limit);
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
  
  // Build channel metadata map by ID
  const channelMap = new Map<string, IPTVChannel>();
  for (const ch of channels) {
    channelMap.set(ch.id, ch);
  }
  
  const queryLower = query.toLowerCase();
  const results: TVChannel[] = [];
  const seenUrls = new Set<string>();
  
  for (const stream of streams) {
    // Skip invalid or duplicate URLs
    if (!stream.url || seenUrls.has(stream.url)) continue;
    seenUrls.add(stream.url);
    
    const channelMeta = stream.channel ? channelMap.get(stream.channel) || null : null;
    
    // Filter out NSFW and closed channels
    if (channelMeta?.is_nsfw || channelMeta?.closed) continue;
    
    // Search match logic
    let matches = false;
    
    if (channelMeta) {
      const nameMatch = channelMeta.name.toLowerCase().includes(queryLower);
      const altMatch = channelMeta.alt_names.some((alt) => 
        alt.toLowerCase().includes(queryLower)
      );
      const networkMatch = channelMeta.network?.toLowerCase().includes(queryLower) || false;
      matches = nameMatch || altMatch || networkMatch;
    } else if (stream.title) {
      matches = stream.title.toLowerCase().includes(queryLower);
    }
    
    if (matches) {
      results.push(buildTVChannel(stream, channelMeta));
    }
  }
  
  // Sort by relevance (exact matches first, then starts with, then logos)
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
  const [channels, streams] = await Promise.all([
    fetchChannels(),
    fetchStreams(),
  ]);
  
  const channelMap = new Map<string, IPTVChannel>();
  for (const ch of channels) {
    channelMap.set(ch.id, ch);
  }
  
  const uniqueChannels = new Set<string>();
  
  for (const stream of streams) {
    if (!stream.url) continue;
    
    const channelMeta = stream.channel ? channelMap.get(stream.channel) || null : null;
    if (channelMeta?.is_nsfw || channelMeta?.closed) continue;
    
    uniqueChannels.add(stream.channel || stream.url);
  }
  
  return uniqueChannels.size;
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
