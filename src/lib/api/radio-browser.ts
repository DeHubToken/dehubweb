/**
 * Radio Browser API Client
 * ========================
 * Free API for accessing 50,000+ radio stations worldwide.
 * No API key required, no rate limits.
 * 
 * @module lib/api/radio-browser
 * @see https://api.radio-browser.info
 */

// Use multiple servers for redundancy
const API_SERVERS = [
  'https://de1.api.radio-browser.info/json',
  'https://nl1.api.radio-browser.info/json',
  'https://at1.api.radio-browser.info/json',
];

let currentServerIndex = 0;

function getApiUrl(): string {
  return API_SERVERS[currentServerIndex];
}

function rotateServer(): void {
  currentServerIndex = (currentServerIndex + 1) % API_SERVERS.length;
}

// ============================================================================
// TYPES
// ============================================================================

export interface RadioStation {
  stationuuid: string;
  name: string;
  url: string;
  url_resolved: string;
  favicon: string;
  country: string;
  countrycode: string;
  state: string;
  language: string;
  tags: string;
  bitrate: number;
  votes: number;
  clickcount: number;
  clicktrend: number;
  codec: string;
}

export interface RadioTag {
  name: string;
  stationcount: number;
}

// ============================================================================
// GENRE CONFIGURATION
// ============================================================================

export const RADIO_GENRES = [
  { id: 'top', label: 'Top Stations', tag: '' },
  { id: 'lofi', label: 'Lo-Fi', tag: 'lofi' },
  { id: 'pop', label: 'Pop', tag: 'pop' },
  { id: 'rock', label: 'Rock', tag: 'rock' },
  { id: 'hiphop', label: 'Hip-Hop', tag: 'hip hop' },
  { id: 'electronic', label: 'Electronic', tag: 'electronic' },
  { id: 'jazz', label: 'Jazz', tag: 'jazz' },
  { id: 'classical', label: 'Classical', tag: 'classical' },
  { id: 'rnb', label: 'R&B', tag: 'r&b' },
  { id: 'country', label: 'Country', tag: 'country' },
  { id: 'latin', label: 'Latin', tag: 'latin' },
  { id: 'reggae', label: 'Reggae', tag: 'reggae' },
  { id: 'news', label: 'News', tag: 'news' },
  { id: 'talk', label: 'Talk', tag: 'talk' },
  { id: 'chill', label: 'Chill', tag: 'chillout' },
] as const;

export type RadioGenreId = typeof RADIO_GENRES[number]['id'];

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function fetchWithFallback<T>(endpoint: string): Promise<T> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < API_SERVERS.length; i++) {
    try {
      const response = await fetch(`${getApiUrl()}${endpoint}`, {
        headers: {
          'User-Agent': 'DeHub/1.0',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      lastError = error as Error;
      rotateServer();
    }
  }
  
  throw lastError || new Error('All API servers failed');
}

/**
 * Get top voted stations
 */
export async function getTopStations(limit = 50): Promise<RadioStation[]> {
  return fetchWithFallback<RadioStation[]>(
    `/stations/topvote?limit=${limit}&hidebroken=true`
  );
}

/**
 * Get stations by tag/genre
 */
export async function getStationsByTag(tag: string, limit = 50): Promise<RadioStation[]> {
  const encodedTag = encodeURIComponent(tag);
  return fetchWithFallback<RadioStation[]>(
    `/stations/bytag/${encodedTag}?limit=${limit}&hidebroken=true&order=votes&reverse=true`
  );
}

/**
 * Search stations by name
 */
export async function searchStations(query: string, limit = 50): Promise<RadioStation[]> {
  const encodedQuery = encodeURIComponent(query);
  return fetchWithFallback<RadioStation[]>(
    `/stations/search?name=${encodedQuery}&limit=${limit}&hidebroken=true&order=votes&reverse=true`
  );
}

/**
 * Get stations by genre ID
 */
export async function getStationsByGenre(genreId: RadioGenreId, limit = 50): Promise<RadioStation[]> {
  const genre = RADIO_GENRES.find(g => g.id === genreId);
  
  if (!genre || genreId === 'top') {
    return getTopStations(limit);
  }
  
  return getStationsByTag(genre.tag, limit);
}

/**
 * Register a station click (helps with station ranking)
 */
export async function registerStationClick(stationuuid: string): Promise<void> {
  try {
    await fetchWithFallback(`/url/${stationuuid}`);
  } catch {
    // Silently fail - this is just for analytics
  }
}

/**
 * Format bitrate for display
 */
export function formatBitrate(bitrate: number): string {
  if (bitrate <= 0) return '';
  return `${bitrate}kbps`;
}

/**
 * Get primary tags from comma-separated tag string
 */
export function getPrimaryTags(tags: string, maxTags = 2): string[] {
  if (!tags) return [];
  return tags
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0 && t.length < 20)
    .slice(0, maxTags);
}

/**
 * Get country flag emoji from country code
 */
export function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌐';
  
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  
  return String.fromCodePoint(...codePoints);
}
