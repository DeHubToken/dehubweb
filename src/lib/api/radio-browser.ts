/**
 * Radio Browser API Client
 * ========================
 * Free API for accessing 50,000+ radio stations worldwide.
 * No API key required, no rate limits.
 * 
 * @module lib/api/radio-browser
 * @see https://api.radio-browser.info
 */

import { translateCopy as _translateCopy } from '@/i18n/copy';

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
  { id: 'top', get label() { return _translateCopy("copy.fecfbd745662", { defaultValue: "Top Stations" }); }, tag: '' },
  { id: 'lofi', get label() { return _translateCopy("copy.6c4b0016baa4", { defaultValue: "Lo-Fi" }); }, tag: 'lofi' },
  { id: 'pop', get label() { return _translateCopy("copy.4d616d53988e", { defaultValue: "Pop" }); }, tag: 'pop' },
  { id: 'rock', get label() { return _translateCopy("copy.f302f0ea1db5", { defaultValue: "Rock" }); }, tag: 'rock' },
  { id: 'hiphop', get label() { return _translateCopy("copy.75ec15e4cd12", { defaultValue: "Hip-Hop" }); }, tag: 'hip hop' },
  { id: 'electronic', get label() { return _translateCopy("copy.a284c4f1684a", { defaultValue: "Electronic" }); }, tag: 'electronic' },
  { id: 'jazz', get label() { return _translateCopy("copy.3e284681b695", { defaultValue: "Jazz" }); }, tag: 'jazz' },
  { id: 'classical', get label() { return _translateCopy("copy.5550f80de667", { defaultValue: "Classical" }); }, tag: 'classical' },
  { id: 'rnb', get label() { return _translateCopy("copy.4d1fb2091feb", { defaultValue: "R&B" }); }, tag: 'r&b' },
  { id: 'country', label: 'Country', tag: 'country' },
  { id: 'latin', get label() { return _translateCopy("copy.2d38c456a2ec", { defaultValue: "Latin" }); }, tag: 'latin' },
  { id: 'reggae', get label() { return _translateCopy("copy.c9608139ab38", { defaultValue: "Reggae" }); }, tag: 'reggae' },
  { id: 'news', get label() { return _translateCopy("copy.69752f2313b2", { defaultValue: "News" }); }, tag: 'news' },
  { id: 'talk', get label() { return _translateCopy("copy.449f5a775762", { defaultValue: "Talk" }); }, tag: 'talk' },
  { id: 'chill', get label() { return _translateCopy("copy.106eb3ebbb80", { defaultValue: "Chill" }); }, tag: 'chillout' },
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
  get US() { return _translateCopy("copy.dbab41120f92", { defaultValue: "United States of America" }); },
  get UK() { return _translateCopy("copy.8d23a6e37e0a", { defaultValue: "United Kingdom" }); }, // Keep for display name lookup
  get GB() { return _translateCopy("copy.8d23a6e37e0a", { defaultValue: "United Kingdom" }); },
  get DE() { return _translateCopy("copy.80db4ccdca10", { defaultValue: "Germany" }); },
  get FR() { return _translateCopy("copy.7a1ca4ef7515", { defaultValue: "France" }); },
  get JP() { return _translateCopy("copy.647294383b2c", { defaultValue: "Japan" }); },
  get BR() { return _translateCopy("copy.07f62b021771", { defaultValue: "Brazil" }); },
  get IN() { return _translateCopy("copy.abd149214539", { defaultValue: "India" }); },
  get AU() { return _translateCopy("copy.c1ef40ce0484", { defaultValue: "Australia" }); },
  get CA() { return _translateCopy("copy.be55ef3f4c4e", { defaultValue: "Canada" }); },
  get ES() { return _translateCopy("copy.8ef41e6f4b07", { defaultValue: "Spain" }); },
  get IT() { return _translateCopy("copy.5a9cf672c8be", { defaultValue: "Italy" }); },
  get NL() { return _translateCopy("copy.3a386c13d283", { defaultValue: "Netherlands" }); },
  get SE() { return _translateCopy("copy.853637136575", { defaultValue: "Sweden" }); },
  get NO() { return _translateCopy("copy.bea54a349795", { defaultValue: "Norway" }); },
  get DK() { return _translateCopy("copy.c52709757760", { defaultValue: "Denmark" }); },
  get FI() { return _translateCopy("copy.aed8f531aa7e", { defaultValue: "Finland" }); },
  get PL() { return _translateCopy("copy.7f69649ad704", { defaultValue: "Poland" }); },
  get RU() { return _translateCopy("copy.33a3d8ed92b0", { defaultValue: "Russia" }); },
  get MX() { return _translateCopy("copy.a7d355b26bda", { defaultValue: "Mexico" }); },
  get AR() { return _translateCopy("copy.ea0b937ea317", { defaultValue: "Argentina" }); },
  get CL() { return _translateCopy("copy.f5273e236d49", { defaultValue: "Chile" }); },
  get CO() { return _translateCopy("copy.6b615adb1300", { defaultValue: "Colombia" }); },
  get KR() { return _translateCopy("copy.c85329e3779e", { defaultValue: "South Korea" }); },
  get CN() { return _translateCopy("copy.10436829032f", { defaultValue: "China" }); },
  get TW() { return _translateCopy("copy.dd76af196e2c", { defaultValue: "Taiwan" }); },
  get TH() { return _translateCopy("copy.6e49e65081b2", { defaultValue: "Thailand" }); },
  get ID() { return _translateCopy("copy.dbc74a36d8e7", { defaultValue: "Indonesia" }); },
  get MY() { return _translateCopy("copy.084504165b07", { defaultValue: "Malaysia" }); },
  get SG() { return _translateCopy("copy.c96dd81db196", { defaultValue: "Singapore" }); },
  get PH() { return _translateCopy("copy.c3782c86d809", { defaultValue: "Philippines" }); },
  get VN() { return _translateCopy("copy.2e5e81066a29", { defaultValue: "Vietnam" }); },
  get ZA() { return _translateCopy("copy.3e049d78d958", { defaultValue: "South Africa" }); },
  get EG() { return _translateCopy("copy.557c1599d9a0", { defaultValue: "Egypt" }); },
  get NG() { return _translateCopy("copy.04952a0f984d", { defaultValue: "Nigeria" }); },
  get KE() { return _translateCopy("copy.74e1891dc615", { defaultValue: "Kenya" }); },
  get NZ() { return _translateCopy("copy.2898e16d4e4e", { defaultValue: "New Zealand" }); },
  get IE() { return _translateCopy("copy.02bf1dfa9a03", { defaultValue: "Ireland" }); },
  get AT() { return _translateCopy("copy.c9cab0238deb", { defaultValue: "Austria" }); },
  get CH() { return _translateCopy("copy.2275583196d7", { defaultValue: "Switzerland" }); },
  get BE() { return _translateCopy("copy.348841ef53db", { defaultValue: "Belgium" }); },
  get PT() { return _translateCopy("copy.4c7de2c3da6d", { defaultValue: "Portugal" }); },
  get GR() { return _translateCopy("copy.9c93ad439373", { defaultValue: "Greece" }); },
  get CZ() { return _translateCopy("copy.1c769ecb9e80", { defaultValue: "Czech Republic" }); },
  get HU() { return _translateCopy("copy.504be3084f44", { defaultValue: "Hungary" }); },
  get RO() { return _translateCopy("copy.ea23726dd0fd", { defaultValue: "Romania" }); },
  get UA() { return _translateCopy("copy.580eedc669f3", { defaultValue: "Ukraine" }); },
  get TR() { return _translateCopy("copy.07c67d76ef92", { defaultValue: "Turkey" }); },
  get IL() { return _translateCopy("copy.3552ac0c0324", { defaultValue: "Israel" }); },
  get PS() { return _translateCopy("copy.f189744591c2", { defaultValue: "Palestine" }); },
  get AE() { return _translateCopy("copy.dd64913c8b91", { defaultValue: "United Arab Emirates" }); },
  get SA() { return _translateCopy("copy.ed9ad13611d7", { defaultValue: "Saudi Arabia" }); },
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

// Pinned by station UUID so the carousel is one request. It used to run a name
// search per station, which put ten requests on every home feed load. The
// names are the searches each UUID was resolved from; "ilovemusic -
// ilovechillpop", "isekoi radio chillzone", "pax lofi" and "Rocking 247 Radio"
// were also on the list but no longer match any station.
const CURATED_STATION_UUIDS = [
  '4260f1f5-d5b3-44d5-9666-355da4da0b21', // Lofi 24/7
  '6eff3484-4ab4-4d36-bf27-9172c5aac15c', // christmas vinyl
  'cd477c35-d625-11e8-a54a-52543be04c81', // miami beach radio
  '8f6646dc-222a-4cbf-9f48-4bd60fea4493', // NBC News
  '9af1536b-1acd-11ea-a620-52543be04c81', // Nightwave Plaza
  'cbd67003-0039-421f-9b59-9dd6de2b9e80', // 247 mixing
];

/**
 * Fetch the curated carousel stations in one request.
 * Returns stations in the order defined above, minus any that are down.
 */
export async function getCuratedCarouselStations(): Promise<RadioStation[]> {
  const stations = await fetchWithFallback<(RadioStation & { lastcheckok?: number })[]>(
    `/stations/byuuid?uuids=${CURATED_STATION_UUIDS.join(',')}`
  );
  const order = new Map(CURATED_STATION_UUIDS.map((uuid, i) => [uuid, i]));
  return stations
    .filter(s => order.has(s.stationuuid) && s.lastcheckok !== 0)
    .sort((a, b) => order.get(a.stationuuid)! - order.get(b.stationuuid)!);
}
