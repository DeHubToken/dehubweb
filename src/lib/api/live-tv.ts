/**
 * Live TV API Client
 * ==================
 * Fetches verified TV channels from the database.
 * Falls back to raw playlist parsing if database is empty.
 * Includes auto-reporting of broken channels.
 * 
 * @module lib/api/live-tv
 */

import { supabase } from '@/integrations/supabase/client';

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

/** Country filter uses the raw country string from the database */
export type TVCountryFilter = string; // 'all' or the exact country name e.g. 'Italy', 'USA'

export interface TVCategory {
  id: string;
  label: string;
  count: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const FREE_TV_PLAYLIST_URL = 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8';

/** Friendly display names for countries that need cleanup */
const COUNTRY_DISPLAY_OVERRIDES: Record<string, string> = {
  '日本 / Japan': 'Japan',
  'News (AR)': 'News (Arabic)',
  'News (ES)': 'News (Spanish)',
  'Documentaries (EN)': 'Documentaries',
  'North Macedonia': 'N. Macedonia',
};

// ============================================================================
// CACHE
// ============================================================================

let channelsCache: TVChannel[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Track reported channels to avoid duplicate reports per session
const reportedChannels = new Set<string>();

// ============================================================================
// DATABASE-BACKED CHANNEL FETCHING
// ============================================================================

/**
 * Fetch verified channels from the database
 */
async function fetchVerifiedChannels(): Promise<TVChannel[]> {
  const { data, error } = await supabase
    .from('tv_channels_verified')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.warn('[live-tv] Database fetch error, will use fallback:', error.message);
    return [];
  }

  if (!data || data.length === 0) {
    console.log('[live-tv] No verified channels in database, using fallback');
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    logo: row.logo,
    category: row.category,
    streamUrl: row.stream_url,
    country: row.country,
    languages: [],
  }));
}

// ============================================================================
// FALLBACK: RAW PLAYLIST PARSING
// ============================================================================

function generateIdFromUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `ch-${Math.abs(hash).toString(36)}`;
}

function mapCountryToCategory(groupTitle: string): string {
  // For fallback parsing, just use the group title as-is
  return groupTitle;
}

function isValidStream(url: string, name: string): boolean {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('.mpd')) return false;
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) return false;
  if (lowerUrl.includes('twitch.tv')) return false;
  if (lowerUrl.includes('dailymotion.com')) return false;
  if (url.startsWith('http://')) return false;
  if (name.includes('Ⓖ')) return false;
  return lowerUrl.includes('.m3u8');
}

function parseM3U8Playlist(content: string): TVChannel[] {
  const lines = content.split('\n');
  const channels: TVChannel[] = [];
  const seenUrls = new Set<string>();
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.startsWith('#EXTINF:')) {
      const nameMatch = line.match(/tvg-name="([^"]+)"/);
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      const groupMatch = line.match(/group-title="([^"]+)"/);
      const titleMatch = line.match(/,(.+)$/);
      
      let streamUrl = '';
      for (let j = i + 1; j < lines.length && j < i + 3; j++) {
        const nextLine = lines[j]?.trim();
        if (nextLine && !nextLine.startsWith('#')) {
          streamUrl = nextLine;
          break;
        }
      }
      
      const name = nameMatch?.[1] || titleMatch?.[1] || 'Unknown Channel';
      
      if (!streamUrl || seenUrls.has(streamUrl)) continue;
      if (!isValidStream(streamUrl, name)) continue;
      
      seenUrls.add(streamUrl);
      const groupTitle = groupMatch?.[1] || 'Other';
      
      channels.push({
        id: generateIdFromUrl(streamUrl),
        name: name.trim(),
        logo: logoMatch?.[1] || null,
        category: mapCountryToCategory(groupTitle),
        streamUrl,
        country: groupTitle,
        languages: [],
      });
    }
  }
  
  return channels;
}

async function fetchFallbackChannels(): Promise<TVChannel[]> {
  const response = await fetch(`${FREE_TV_PLAYLIST_URL}?_=${Date.now()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch TV channels');
  }
  const content = await response.text();
  return parseM3U8Playlist(content);
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Fetch all channels — tries database first, falls back to raw playlist
 */
async function fetchAllChannels(): Promise<TVChannel[]> {
  const now = Date.now();
  if (channelsCache && channelsCache.length > 0 && now - cacheTimestamp < CACHE_TTL) {
    return channelsCache;
  }
  
  // Try database first
  let channels = await fetchVerifiedChannels();
  
  // Fallback to raw playlist if database is empty
  if (channels.length === 0) {
    console.log('[live-tv] Falling back to raw playlist parsing');
    channels = await fetchFallbackChannels();
  }
  
  channelsCache = channels;
  cacheTimestamp = now;
  
  return channelsCache;
}

/**
 * Get TV channels by country filter
 */
export async function getTVChannelsByCountry(
  country: TVCountryFilter,
  limit: number = 50
): Promise<TVChannel[]> {
  const allChannels = await fetchAllChannels();
  
  let filtered: TVChannel[];
  
  if (country === 'all') {
    filtered = allChannels;
  } else {
    filtered = allChannels.filter((ch) => ch.country === country);
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
    return getTVChannelsByCountry('all', limit);
  }
  
  const allChannels = await fetchAllChannels();
  const queryLower = query.toLowerCase();
  
  const results = allChannels.filter((ch) => {
    return (
      ch.name.toLowerCase().includes(queryLower) ||
      ch.country.toLowerCase().includes(queryLower)
    );
  });
  
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
 * Get available countries with channel counts, sorted by count descending.
 * Returns TVCategory[] with 'All' as the first entry.
 */
export async function getAvailableCountries(): Promise<TVCategory[]> {
  const allChannels = await fetchAllChannels();
  const countMap = new Map<string, number>();

  for (const ch of allChannels) {
    countMap.set(ch.country, (countMap.get(ch.country) || 0) + 1);
  }

  const countries: TVCategory[] = [
    { id: 'all', label: 'All', count: allChannels.length },
  ];

  // Sort by channel count descending
  const sorted = [...countMap.entries()].sort((a, b) => b[1] - a[1]);

  for (const [country, count] of sorted) {
    const displayName = COUNTRY_DISPLAY_OVERRIDES[country] || country;
    countries.push({ id: country, label: displayName, count });
  }

  return countries;
}

/**
 * Get total count of available channels
 */
export async function getTVChannelCount(): Promise<number> {
  const allChannels = await fetchAllChannels();
  return allChannels.length;
}

/**
 * Report a broken channel (called automatically on playback failure)
 */
export async function reportBrokenChannel(channelId: string): Promise<void> {
  // Avoid duplicate reports in the same session
  if (reportedChannels.has(channelId)) return;
  reportedChannels.add(channelId);
  
  try {
    await supabase.functions.invoke('report-broken-channel', {
      body: { channel_id: channelId },
    });
    console.log(`[live-tv] Reported broken channel: ${channelId}`);
  } catch (error) {
    console.warn('[live-tv] Failed to report broken channel:', error);
  }
}

/** Map country names / codes to 2-letter ISO codes for flag rendering */
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  usa: 'US', uk: 'GB', us: 'US', gb: 'GB',
  'united states': 'US', 'united kingdom': 'GB',
  germany: 'DE', deutschland: 'DE', france: 'FR',
  spain: 'ES', 'españa': 'ES', italy: 'IT', italia: 'IT',
  india: 'IN', brazil: 'BR', brasil: 'BR',
  mexico: 'MX', 'méxico': 'MX', canada: 'CA', australia: 'AU',
  japan: 'JP', china: 'CN', russia: 'RU', 'south korea': 'KR',
  argentina: 'AR', chile: 'CL', colombia: 'CO', peru: 'PE',
  portugal: 'PT', netherlands: 'NL', belgium: 'BE', switzerland: 'CH',
  austria: 'AT', sweden: 'SE', norway: 'NO', denmark: 'DK',
  finland: 'FI', poland: 'PL', 'czech republic': 'CZ', romania: 'RO',
  greece: 'GR', turkey: 'TR', ukraine: 'UA', ireland: 'IE',
  albania: 'AL', croatia: 'HR', serbia: 'RS', bulgaria: 'BG',
  hungary: 'HU', slovakia: 'SK', slovenia: 'SI',
  'bosnia and herzegovina': 'BA', belarus: 'BY', azerbaijan: 'AZ',
  philippines: 'PH', indonesia: 'ID', thailand: 'TH', vietnam: 'VN',
  malaysia: 'MY', pakistan: 'PK', bangladesh: 'BD', iran: 'IR',
  iraq: 'IQ', 'saudi arabia': 'SA', 'united arab emirates': 'AE',
  egypt: 'EG', 'south africa': 'ZA', nigeria: 'NG', kenya: 'KE',
  morocco: 'MA', tunisia: 'TN', algeria: 'DZ', chad: 'TD',
};

/**
 * Get country flag emoji from country name or code
 */
export function getCountryFlag(country: string): string {
  if (!country) return '🌍';

  // If already a 2-letter code
  const normalized = country.toLowerCase().trim();
  const iso = normalized.length === 2
    ? normalized.toUpperCase()
    : COUNTRY_NAME_TO_ISO[normalized];

  if (!iso || iso.length !== 2) return '🌍';
  
  const codePoints = iso
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  
  return String.fromCodePoint(...codePoints);
}

