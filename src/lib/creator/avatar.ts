export interface AvatarSubmission {
  clientJobId?: string;
  txHash?: string;
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
    const request = indexedDB.open('creator-avatar-prepared', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('owners');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function savePreparedAvatar(owner: string, input: AvatarSubmission) {
  const db = await avatarDatabase();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('owners', 'readwrite'); tx.objectStore('owners').put(input, owner.toLowerCase()); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); }
  finally { db.close(); }
}
export async function loadPreparedAvatar(owner: string): Promise<AvatarSubmission | null> {
  const db = await avatarDatabase();
  try { return await new Promise((resolve, reject) => { const request = db.transaction('owners').objectStore('owners').get(owner.toLowerCase()); request.onsuccess = () => resolve(request.result ?? null); request.onerror = () => reject(request.error); }); }
  finally { db.close(); }
}
