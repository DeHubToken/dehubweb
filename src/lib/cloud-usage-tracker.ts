/**
 * Cloud Usage Tracker
 * ===================
 * Tracks Supabase REST queries, edge function invocations, and realtime subscriptions
 * to help monitor and optimize cloud spend.
 * 
 * Data is stored in localStorage and displayed in the Command Centre.
 */

export interface UsageEntry {
  type: 'rest' | 'edge_function' | 'realtime' | 'storage';
  target: string; // table name or function name
  method: string; // GET, POST, INSERT, etc.
  timestamp: number;
  durationMs?: number;
  status?: number;
  error?: boolean;
}

export interface UsageSummary {
  totalRequests: number;
  restQueries: number;
  edgeFunctionCalls: number;
  realtimeEvents: number;
  storageOps: number;
  errors: number;
  topTargets: Array<{ target: string; count: number; type: string }>;
  requestsPerMinute: number;
  entries: UsageEntry[];
}

const STORAGE_KEY = 'cloud_usage_log';
const MAX_ENTRIES = 2000;
const SESSION_START = Date.now();

let entries: UsageEntry[] = [];
let initialized = false;

function loadFromStorage(): void {
  if (initialized) return;
  initialized = true;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as UsageEntry[];
      // Only keep last 24 hours
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      entries = parsed.filter(e => e.timestamp > cutoff);
    }
  } catch {
    entries = [];
  }
}

function saveToStorage(): void {
  try {
    // Trim to max entries
    if (entries.length > MAX_ENTRIES) {
      entries = entries.slice(-MAX_ENTRIES);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full, trim aggressively
    entries = entries.slice(-500);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch { /* give up */ }
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function trackUsage(entry: Omit<UsageEntry, 'timestamp'>): void {
  loadFromStorage();
  entries.push({ ...entry, timestamp: Date.now() });
  
  // Debounce saves
  if (!saveTimer) {
    saveTimer = setTimeout(() => {
      saveToStorage();
      saveTimer = null;
    }, 5000);
  }
}

export function getUsageSummary(windowMs: number = 60 * 60 * 1000): UsageSummary {
  loadFromStorage();
  
  const cutoff = Date.now() - windowMs;
  const windowEntries = entries.filter(e => e.timestamp > cutoff);
  
  const restQueries = windowEntries.filter(e => e.type === 'rest').length;
  const edgeFunctionCalls = windowEntries.filter(e => e.type === 'edge_function').length;
  const realtimeEvents = windowEntries.filter(e => e.type === 'realtime').length;
  const storageOps = windowEntries.filter(e => e.type === 'storage').length;
  const errors = windowEntries.filter(e => e.error).length;
  
  // Calculate top targets
  const targetCounts = new Map<string, { count: number; type: string }>();
  for (const entry of windowEntries) {
    const key = `${entry.type}:${entry.target}`;
    const existing = targetCounts.get(key) || { count: 0, type: entry.type };
    existing.count++;
    targetCounts.set(key, existing);
  }
  
  const topTargets = Array.from(targetCounts.entries())
    .map(([key, val]) => ({ target: key.split(':').slice(1).join(':'), count: val.count, type: val.type }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  // Requests per minute
  const elapsedMinutes = Math.max(1, (Date.now() - Math.max(cutoff, SESSION_START)) / 60000);
  const requestsPerMinute = Math.round((windowEntries.length / elapsedMinutes) * 10) / 10;
  
  return {
    totalRequests: windowEntries.length,
    restQueries,
    edgeFunctionCalls,
    realtimeEvents,
    storageOps,
    errors,
    topTargets,
    requestsPerMinute,
    entries: windowEntries.slice(-200), // Last 200 for display
  };
}

export function getHourlyBreakdown(): Array<{ hour: string; count: number; errors: number }> {
  loadFromStorage();
  
  const buckets = new Map<string, { count: number; errors: number }>();
  
  for (const entry of entries) {
    const d = new Date(entry.timestamp);
    const key = `${d.getHours().toString().padStart(2, '0')}:00`;
    const bucket = buckets.get(key) || { count: 0, errors: 0 };
    bucket.count++;
    if (entry.error) bucket.errors++;
    buckets.set(key, bucket);
  }
  
  return Array.from(buckets.entries())
    .map(([hour, data]) => ({ hour, ...data }))
    .sort((a, b) => a.hour.localeCompare(b.hour));
}

export function clearUsageData(): void {
  entries = [];
  localStorage.removeItem(STORAGE_KEY);
}
