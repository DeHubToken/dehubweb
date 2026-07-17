/**
 * Unlocked Tokens Store
 * =====================
 * Persists PPV/unlocked token IDs in sessionStorage so unlock state
 * survives navigation (e.g. feed → single post page).
 */

const STORAGE_KEY = 'dehub_unlocked_tokens';

function getStored(): Set<string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function setStored(ids: Set<string>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Ignore quota errors
  }
}

export function isTokenUnlocked(tokenId: string): boolean {
  return getStored().has(String(tokenId));
}

export function markTokenUnlocked(tokenId: string): void {
  const set = getStored();
  set.add(String(tokenId));
  setStored(set);
}

export function getUnlockedTokenIds(): string[] {
  return [...getStored()];
}
