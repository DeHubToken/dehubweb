/**
 * The whole client flow against the real key manager, with only the network
 * stubbed: two users set up identities from signatures, publish keys, seal
 * messages to each other and open them; a peer without a key falls back to
 * plaintext; a second device for the same wallet regenerates the same keys.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const registry = new Map<string, string>();
let caller = '';

vi.mock('@/lib/api/dehub/core', () => ({
  apiCall: vi.fn(async (endpoint: string, opts: any = {}) => {
    if (endpoint === '/api/dm/e2ee-key' && opts.method === 'POST') {
      registry.set(caller, opts.body.publicKey);
      return { address: caller, publicKey: opts.body.publicKey };
    }
    const m = endpoint.match(/^\/api\/dm\/e2ee-key\/(0x[0-9a-f]+)$/);
    if (m) return { address: m[1], publicKey: registry.get(m[1]) ?? null };
    throw new Error(`unexpected call ${endpoint}`);
  }),
}));

import {
  decryptFromPeer,
  decryptMessageInPlace,
  encryptForPeer,
  getIdentity,
  loadIdentity,
  prepareOutgoing,
  setupIdentity,
  unloadIdentity,
} from '../keys';
import { encryptionSignMessage, isEncryptedContent } from '../crypto';

const A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const C = '0xcccccccccccccccccccccccccccccccccccccccc';

/** A wallet that signs deterministically: the same text always gives the same bytes. */
const walletFor = (address: string) => async (message: string) => {
  expect(message).toBe(encryptionSignMessage(address));
  return '0x' + Buffer.from(`${address}:${message}`).toString('hex').padEnd(130, '0').slice(0, 130);
};

async function become(address: string) {
  caller = address;
  unloadIdentity();
  if (!loadIdentity(address)) await setupIdentity(address, walletFor(address));
  expect(getIdentity()?.address).toBe(address);
}

describe('dm-e2ee client flow', () => {
  beforeEach(() => {
    registry.clear();
    localStorage.clear();
    unloadIdentity();
  });

  it('two users exchange messages that only they can open', async () => {
    await become(A);
    const pubA = getIdentity()!.publicKey;
    expect(registry.get(A)).toBe(pubA);

    await become(B);
    const sealedByB = await encryptForPeer(A, 'hi from B');
    expect(sealedByB && isEncryptedContent(sealedByB)).toBe(true);
    // B can read its own sent line back.
    expect(await decryptFromPeer(A, sealedByB!)).toBe('hi from B');

    await become(A);
    expect(await decryptFromPeer(B, sealedByB!)).toBe('hi from B');
    const wire = await prepareOutgoing(B, 'hi from A');
    expect(wire.encrypted).toBe(true);

    // A third party holding neither key gets nothing out of it.
    await become(C);
    expect(await decryptFromPeer(A, sealedByB!)).toBeNull();
    expect(await decryptFromPeer(B, sealedByB!)).toBeNull();
  });

  it('falls back to plaintext for a peer without a published key', async () => {
    await become(A);
    const wire = await prepareOutgoing(C, 'hello stranger');
    expect(wire).toEqual({ content: 'hello stranger', encrypted: false });
  });

  it('marks lines it cannot open instead of exposing the envelope', async () => {
    await become(A);
    await become(B);
    const sealed = (await encryptForPeer(A, 'secret'))!;
    const opened = await decryptMessageInPlace({ content: sealed, replyTo: { content: sealed } }, A);
    expect(opened).toMatchObject({ content: 'secret', encrypted: true, undecryptable: false, replyTo: { content: 'secret' } });
    const blind = await decryptMessageInPlace({ content: sealed }, null);
    expect(blind).toMatchObject({ content: '', encrypted: true, undecryptable: true });
    expect(JSON.stringify(blind)).not.toContain(sealed.slice(6, 30));
  });

  it('a second device for the same wallet regenerates the same keys', async () => {
    await become(A);
    const pubA = getIdentity()!.publicKey;
    await become(B);
    const sealed = (await encryptForPeer(A, 'for every device'))!;

    // New device: nothing stored locally, same wallet signs the same text.
    localStorage.clear();
    unloadIdentity();
    caller = A;
    expect(loadIdentity(A)).toBe(false);
    await setupIdentity(A, walletFor(A));
    expect(getIdentity()!.publicKey).toBe(pubA);
    expect(await decryptFromPeer(B, sealed)).toBe('for every device');
  });

  it('a returning session loads the stored identity without signing again', async () => {
    await become(A);
    const pubA = getIdentity()!.publicKey;
    unloadIdentity();
    const sign = vi.fn(walletFor(A));
    expect(loadIdentity(A)).toBe(true);
    expect(getIdentity()!.publicKey).toBe(pubA);
    expect(sign).not.toHaveBeenCalled();
  });
});
