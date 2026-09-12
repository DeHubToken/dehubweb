import { supabase } from '@/integrations/supabase/client';
import { ensureFreshToken } from '@/lib/api/dehub/core';
import type { GenerationJob } from '@/store/generationStore';

async function call(wallet: string, body: Record<string, unknown>) {
  const token = await ensureFreshToken();
  const { data, error } = await supabase.functions.invoke('creator-library', {
    body, headers: { 'x-dehub-token': token, 'x-wallet-address': wallet },
  });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not save your generation');
  return data;
}

export async function saveCloudGeneration(wallet: string, job: GenerationJob): Promise<void> {
  const { url, sourceImage, posterUrl, ticket, ...metadata } = job;
  const prepared = await call(wallet, { action: 'prepare', id: job.id, metadata });
  if (prepared.saved) return;
  if (!url) throw new Error('No generated media to save');
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not download the generated media for saving');
  const blob = await response.blob();
  const { error } = await supabase.storage.from('creator-assets').uploadToSignedUrl(prepared.path, prepared.token, blob, {
    contentType: blob.type || 'application/octet-stream',
  });
  if (error) throw error;
  await call(wallet, { action: 'complete', id: job.id });
}

export async function loadCloudGenerations(wallet: string): Promise<GenerationJob[]> {
  const data = await call(wallet, { action: 'list' });
  return data.jobs ?? [];
}

export async function removeCloudGeneration(wallet: string, id: string): Promise<void> {
  await call(wallet, { action: 'remove', id });
}

/** Keep bytes locally before attempting a network save, including audio blobs. */
export async function cacheGeneration(scope: string, job: GenerationJob): Promise<void> {
  let blob: Blob | undefined;
  if (job.url) {
    const response = await fetch(job.url);
    if (!response.ok) throw new Error('Could not cache this generation');
    blob = await response.blob();
  }
  await database((db) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction('results', 'readwrite');
    tx.objectStore('results').put({ key: `${scope}:${job.id}`, scope, job: { ...job, url: undefined }, blob });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

export async function loadCachedGenerations(scope: string): Promise<GenerationJob[]> {
  return database((db) => new Promise((resolve, reject) => {
    const req = db.transaction('results').objectStore('results').getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result.filter((row) => row.scope === scope)
      .map((row) => ({ ...row.job, status: 'done', url: row.blob ? URL.createObjectURL(row.blob) : undefined })));
  }));
}

export async function removeCachedGeneration(scope: string, id: string): Promise<void> {
  await database((db) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction('results', 'readwrite');
    tx.objectStore('results').delete(`${scope}:${id}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

async function database<T>(use: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('dehub-creator-results', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('results', { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try { return await use(db); } finally { db.close(); }
}
