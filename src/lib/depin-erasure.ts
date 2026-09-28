/** Serialize writes and erasure so a late download cannot recreate an erased copy. */
export function createReplicaOperations() {
  const pending = new Map<string, Promise<unknown>>();
  const erased = new Set<string>();
  const enqueue = (key: string, work: () => Promise<void>) => {
    const next = (pending.get(key) || Promise.resolve()).catch(() => {}).then(work);
    pending.set(key, next);
    void next.finally(() => { if (pending.get(key) === next) pending.delete(key); }).catch(() => {});
    return next;
  };
  return {
    store(key: string, write: () => Promise<void>) {
      return enqueue(key, async () => { if (!erased.has(key)) await write(); });
    },
    erase(key: string, remove: () => Promise<void>) {
      erased.add(key);
      return enqueue(key, remove);
    },
  };
}

export async function removeReplicaFile(dir: FileSystemDirectoryHandle, filename: string): Promise<void> {
  try { await dir.removeEntry(filename); }
  catch (error) {
    if (!(error && typeof error === 'object' && 'name' in error && error.name === 'NotFoundError')) throw error;
  }
}
