const KEY = 'dehub-deleted-posts';
const MAX = 500;

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {}
  return new Set();
}

function save(ids: Set<string>) {
  try {
    // Keep only the last MAX entries to avoid unbounded growth
    const arr = Array.from(ids).slice(-MAX);
    localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {}
}

export function markPostDeleted(tokenId: string | number) {
  const ids = load();
  ids.add(String(tokenId));
  save(ids);
}

export function isPostDeleted(tokenId: string | number): boolean {
  return load().has(String(tokenId));
}

export function getDeletedPostIds(): Set<string> {
  return load();
}
