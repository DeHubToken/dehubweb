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
// COUNTRY DATA FOR LOCATION-BASED SEARCH
// ============================================================================

/** Normalize non-standard codes to ISO codes (for API compatibility) */
const COUNTRY_CODE_ALIASES: Record<string, string> = {
  UK: 'GB', // UK is commonly used but API uses GB
};

/** Map of ISO country codes to country names */
const COUNTRY_CODE_MAP: Record<string, string> = {
  US: 'United States of America',
  UK: 'United Kingdom', // Keep for display name lookup
  GB: 'United Kingdom',
  DE: 'Germany',
  FR: 'France',
  JP: 'Japan',
  BR: 'Brazil',
  IN: 'India',
  AU: 'Australia',
  CA: 'Canada',
  ES: 'Spain',
  IT: 'Italy',
  NL: 'Netherlands',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  FI: 'Finland',
  PL: 'Poland',
  RU: 'Russia',
  MX: 'Mexico',
  AR: 'Argentina',
  CL: 'Chile',
  CO: 'Colombia',
  KR: 'South Korea',
  CN: 'China',
  TW: 'Taiwan',
  TH: 'Thailand',
  ID: 'Indonesia',
  MY: 'Malaysia',
  SG: 'Singapore',
  PH: 'Philippines',
  VN: 'Vietnam',
  ZA: 'South Africa',
  EG: 'Egypt',
  NG: 'Nigeria',
  KE: 'Kenya',
  NZ: 'New Zealand',
  IE: 'Ireland',
  AT: 'Austria',
  CH: 'Switzerland',
  BE: 'Belgium',
  PT: 'Portugal',
  GR: 'Greece',
  CZ: 'Czech Republic',
  HU: 'Hungary',
  RO: 'Romania',
  UA: 'Ukraine',
  TR: 'Turkey',
  IL: 'Israel',
  PS: 'Palestine',
  AE: 'United Arab Emirates',
  SA: 'Saudi Arabia',
};

/** Country names that can be detected in search queries */
const COUNTRY_NAME_MAP: Record<string, string> = {
  'united states': 'US',
  'usa': 'US',
  'america': 'US',
  'united kingdom': 'GB',
  'england': 'GB',
  'britain': 'GB',
  'germany': 'DE',
  'france': 'FR',
  'japan': 'JP',
  'brazil': 'BR',
  'india': 'IN',
  'australia': 'AU',
  'canada': 'CA',
  'spain': 'ES',
  'italy': 'IT',
  'netherlands': 'NL',
  'holland': 'NL',
  'sweden': 'SE',
  'norway': 'NO',
  'denmark': 'DK',
  'finland': 'FI',
  'poland': 'PL',
  'russia': 'RU',
  'mexico': 'MX',
  'argentina': 'AR',
  'chile': 'CL',
  'colombia': 'CO',
  'south korea': 'KR',
  'korea': 'KR',
  'china': 'CN',
  'taiwan': 'TW',
  'thailand': 'TH',
  'indonesia': 'ID',
  'malaysia': 'MY',
  'singapore': 'SG',
  'philippines': 'PH',
  'vietnam': 'VN',
  'south africa': 'ZA',
  'egypt': 'EG',
  'nigeria': 'NG',
  'kenya': 'KE',
  'new zealand': 'NZ',
  'ireland': 'IE',
  'austria': 'AT',
  'switzerland': 'CH',
  'belgium': 'BE',
  'portugal': 'PT',
  'greece': 'GR',
  'czech republic': 'CZ',
  'czechia': 'CZ',
  'hungary': 'HU',
  'romania': 'RO',
  'ukraine': 'UA',
  'turkey': 'TR',
  'israel': 'IL',
  'palestine': 'PS',
  'gaza': 'PS',
  'uae': 'AE',
  'united arab emirates': 'AE',
  'dubai': 'AE',
  'saudi arabia': 'SA',
};

export interface ParsedSearchQuery {
  name: string;
  countryCode?: string;
  countryName?: string;
}

/**
 * Parse a search query to extract country and station name
 * Examples:
 *   "jazz US" → { name: "jazz", countryCode: "US", countryName: "United States of America" }
 *   "Germany" → { name: "", countryCode: "DE", countryName: "Germany" }
 *   "rock germany" → { name: "rock", countryCode: "DE", countryName: "Germany" }
 *   "radio london" → { name: "radio london" }
 */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  const trimmedQuery = query.trim();
  const words = trimmedQuery.split(/\s+/);
  
  // Check for 2-letter country code (case-insensitive)
  for (let i = 0; i < words.length; i++) {
    const word = words[i].toUpperCase();
    if (word.length === 2 && COUNTRY_CODE_MAP[word]) {
      const remainingWords = [...words.slice(0, i), ...words.slice(i + 1)];
      // Normalize to ISO code (e.g., UK → GB)
      const normalizedCode = COUNTRY_CODE_ALIASES[word] || word;
      return {
        name: remainingWords.join(' ').trim(),
        countryCode: normalizedCode,
        countryName: COUNTRY_CODE_MAP[word],
      };
    }
  }
  
  // Check for country names (longest match first)
  const lowerQuery = trimmedQuery.toLowerCase();
  const sortedCountryNames = Object.keys(COUNTRY_NAME_MAP).sort((a, b) => b.length - a.length);
  
  for (const countryName of sortedCountryNames) {
    const regex = new RegExp(`\\b${countryName}\\b`, 'i');
    if (regex.test(lowerQuery)) {
      const countryCode = COUNTRY_NAME_MAP[countryName];
      const remainingText = lowerQuery.replace(regex, '').replace(/\s+/g, ' ').trim();
      return {
        name: remainingText,
        countryCode,
        countryName: COUNTRY_CODE_MAP[countryCode],
      };
    }
  }
  
  // No country detected
  return { name: trimmedQuery };
}

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

export interface AdvancedSearchParams {
  name?: string;
  countryCode?: string;
  limit?: number;
}

/**
 * Advanced search with country filtering
 * Uses the parsed query to search by name and/or country
 */
export async function searchStationsAdvanced(params: AdvancedSearchParams): Promise<RadioStation[]> {
  const { name, countryCode, limit = 50 } = params;
  
  const searchParams = new URLSearchParams();
  
  if (name) {
    searchParams.set('name', name);
  }
  
  if (countryCode) {
    searchParams.set('countrycode', countryCode);
  }
  
  searchParams.set('limit', limit.toString());
  searchParams.set('hidebroken', 'true');
  searchParams.set('order', 'votes');
  searchParams.set('reverse', 'true');
  
  return fetchWithFallback<RadioStation[]>(
    `/stations/search?${searchParams.toString()}`
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

// ============================================================================
// CURATED CAROUSEL STATIONS
// ============================================================================

const CURATED_STATION_NAMES = [
  'Lofi 24/7',
  'christmas vinyl',
  'miami beach radio',
  'NBC News',
  'Nightwave Plaza',
  'ilovemusic - ilovechillpop',
  'isekoi radio chillzone',
  'pax lofi',
  'Rocking 247 Radio',
  '247 mixing',
];

/**
 * Fetch curated stations for carousels by searching each name.
 * Returns stations in the order defined above.
 */
export async function getCuratedCarouselStations(): Promise<RadioStation[]> {
  const results = await Promise.allSettled(
    CURATED_STATION_NAMES.map(name => searchStations(name, 3))
  );

  const stations: RadioStation[] = [];
  const seen = new Set<string>();

  results.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      // Pick the best match (first result, highest votes)
      const match = result.value[0];
      if (!seen.has(match.stationuuid)) {
        seen.add(match.stationuuid);
        stations.push(match);
      }
    }
  });

  return stations;
}
