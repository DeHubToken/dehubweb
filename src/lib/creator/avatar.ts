export interface AvatarSubmission {
  clientJobId?: string;
  txHash?: string;
  phase?: 'prepared' | 'paying' | 'signed';
  prompt?: string;
  imageDataUrl: string;
  audioDataUrl: string;
  rightsConfirmed: boolean;
  inputDigest?: string;
  acceptedPriceDhb?: number;
}
export interface AvatarQuote { priceDhb: number; priceUsd: number; inputDigest: string; durationSeconds: number }
export const avatarRequestKey = (owner: string | null | undefined, prompt: string, input: AvatarSubmission) => JSON.stringify([owner?.toLowerCase(), prompt, input.imageDataUrl, input.audioDataUrl, input.rightsConfirmed]);
export function matchingAvatarQuote(a: AvatarQuote, b: AvatarQuote) {
  return /^[a-f0-9]{64}$/.test(a.inputDigest) && a.inputDigest === b.inputDigest && a.priceDhb > 0 && a.priceDhb === b.priceDhb && a.durationSeconds === b.durationSeconds;
}

export function readAvatarFile(file: File, kind: 'image' | 'audio'): Promise<string> {
  const max = kind === 'image' ? 5 * 1024 * 1024 : 30 * 48000 + 4096;
  if (!file.size || file.size > max) throw new Error('creator.avatarRequirements');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('creator.avatarRequirements'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

/** Prepared private input survives a reload between payment and queue acknowledgement. */
async function avatarDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('creator-avatar-prepared', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('owners')) { db.createObjectStore('owners'); return; }
      const store = request.transaction!.objectStore('owners'), cursor = store.openCursor();
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (!row) return;
        const key = String(row.key), saved = row.value as AvatarSubmission;
        if (!key.includes(':active') && !key.includes(':job:') && saved.clientJobId) {
          store.put(saved, `${key}:job:${saved.clientJobId}`);
          store.put(saved, `${key}:active`);
          row.delete();
        }
        row.continue();
      };
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function savePreparedAvatar(owner: string, input: AvatarSubmission) {
  if (!input.clientJobId) throw new Error('creatorFlow.recoveryPending');
  const db = await avatarDatabase();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('owners', 'readwrite'), store = tx.objectStore('owners'), prefix = owner.toLowerCase();
    const active = store.get(`${prefix}:active`);
    active.onsuccess = () => {
      const previous = active.result as AvatarSubmission | undefined;
      if (previous?.clientJobId && previous.clientJobId !== input.clientJobId && previous.phase !== 'prepared') { tx.abort(); return; }
      const job = store.get(`${prefix}:job:${input.clientJobId}`);
      job.onsuccess = () => {
        const saved = job.result as AvatarSubmission | undefined;
        if (saved && (saved.inputDigest !== input.inputDigest || saved.imageDataUrl !== input.imageDataUrl || saved.audioDataUrl !== input.audioDataUrl || saved.prompt !== input.prompt || saved.rightsConfirmed !== input.rightsConfirmed || saved.phase !== 'prepared' && saved.acceptedPriceDhb !== input.acceptedPriceDhb || saved.txHash && saved.txHash !== input.txHash)) { tx.abort(); return; }
        store.put(input, `${prefix}:job:${input.clientJobId}`);
        store.put(input, `${prefix}:active`);
      };
    };
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(new Error('creatorFlow.recoveryPending'));
  }); }
  finally { db.close(); }
}
export async function loadPreparedAvatar(owner: string): Promise<AvatarSubmission | null> {
  const db = await avatarDatabase();
  try { return await new Promise((resolve, reject) => { const request = db.transaction('owners').objectStore('owners').get(`${owner.toLowerCase()}:active`); request.onsuccess = () => resolve(request.result ?? null); request.onerror = () => reject(request.error); }); }
  finally { db.close(); }
}
export async function clearPreparedAvatar(owner: string, id: string) {
  const db = await avatarDatabase();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('owners','readwrite'), store = tx.objectStore('owners'), key = `${owner.toLowerCase()}:active`, request = store.get(key);
    request.onsuccess = () => { if (request.result?.clientJobId === id) store.delete(key); };
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  }); } finally { db.close(); }
}
