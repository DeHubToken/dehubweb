import { describe, expect, it, vi } from 'vitest';
import { createReplicaOperations, removeReplicaFile } from './depin-erasure';

describe('replica erasure', () => {
  it('waits for a download already writing, removes it, and suppresses late assignments', async () => {
    const operations = createReplicaOperations();
    let release!: () => void;
    const downloading = new Promise<void>(resolve => { release = resolve; });
    const events: string[] = [];
    let started!: () => void;
    const start = new Promise<void>(resolve => { started = resolve; });
    const write = operations.store('images/a', async () => { started(); await downloading; events.push('write'); });
    await start;
    const erase = operations.erase('images/a', async () => { events.push('remove'); });
    const late = operations.store('images/a', async () => { events.push('late write'); });
    release();
    await Promise.all([write, erase, late]);
    expect(events).toEqual(['write', 'remove']);
  });

  it('retries failed removal and permits storage of unrelated assets', async () => {
    const operations = createReplicaOperations();
    await expect(operations.erase('a', async () => { throw new Error('disk'); })).rejects.toThrow('disk');
    const retry = vi.fn().mockResolvedValue(undefined);
    const store = vi.fn().mockResolvedValue(undefined);
    await operations.erase('a', retry);
    await operations.store('b', store);
    expect(retry).toHaveBeenCalledOnce();
    expect(store).toHaveBeenCalledOnce();
  });

  it('accepts an already absent file but never acknowledges a storage failure', async () => {
    const removeEntry = vi.fn().mockRejectedValue({ name: 'NotFoundError' });
    const dir = { removeEntry } as unknown as FileSystemDirectoryHandle;
    await expect(removeReplicaFile(dir, 'a')).resolves.toBeUndefined();
    removeEntry.mockRejectedValue(new Error('permission denied'));
    await expect(removeReplicaFile(dir, 'a')).rejects.toThrow('permission denied');
  });
});
