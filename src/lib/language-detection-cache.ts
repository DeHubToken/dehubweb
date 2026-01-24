/**
 * Language Detection Cache
 * ========================
 * In-memory + sessionStorage cache for detected languages.
 * Minimizes API calls for repeated text content.
 */

const CACHE_KEY_PREFIX = 'lang_detect_';
const MAX_MEMORY_CACHE_SIZE = 500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  lang: string;
  timestamp: number;
}

// In-memory cache for instant lookups
const memoryCache = new Map<string, CacheEntry>();

/**
 * Generate a simple hash for text content
 */
function hashText(text: string): string {
  // Use first 100 chars for consistency with backend
  const sample = text.slice(0, 100).trim();
  let hash = 0;
  for (let i = 0; i < sample.length; i++) {
    const char = sample.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Get cached language for text
 */
export function getCachedLanguage(text: string): string | null {
  const hash = hashText(text);
  
  // Check memory cache first (fastest)
  const memEntry = memoryCache.get(hash);
  if (memEntry) {
    if (Date.now() - memEntry.timestamp < CACHE_TTL_MS) {
      return memEntry.lang;
    }
    memoryCache.delete(hash);
  }
  
  // Check sessionStorage (persists across page navigation)
  try {
    const stored = sessionStorage.getItem(CACHE_KEY_PREFIX + hash);
    if (stored) {
      const entry: CacheEntry = JSON.parse(stored);
      if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
        // Promote to memory cache
        memoryCache.set(hash, entry);
        return entry.lang;
      }
      sessionStorage.removeItem(CACHE_KEY_PREFIX + hash);
    }
  } catch {
    // sessionStorage might be unavailable
  }
  
  return null;
}

/**
 * Cache detected language for text
 */
export function cacheLanguage(text: string, lang: string): void {
  const hash = hashText(text);
  const entry: CacheEntry = { lang, timestamp: Date.now() };
  
  // Add to memory cache with LRU-style eviction
  if (memoryCache.size >= MAX_MEMORY_CACHE_SIZE) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }
  memoryCache.set(hash, entry);
  
  // Also persist to sessionStorage
  try {
    sessionStorage.setItem(CACHE_KEY_PREFIX + hash, JSON.stringify(entry));
  } catch {
    // sessionStorage might be full or unavailable
  }
}

/**
 * Clear all cached language detections
 */
export function clearLanguageCache(): void {
  memoryCache.clear();
  try {
    const keys = Object.keys(sessionStorage);
    keys.forEach(key => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    });
  } catch {
    // sessionStorage might be unavailable
  }
}
