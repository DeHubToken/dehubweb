import { apiCall } from '@/lib/api/dehub/core';
/**
 * The whole client flow against the real key manager, with only the network
 * stubbed: two users set up identities from signatures, publish keys, seal
 * messages to each other and open them; a peer without a key falls back to
 * plaintext; a second device for the same wallet regenerates the same keys.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const registry = new Map<string, string>();
let caller = '';
// Reproduces the server fault: its auth guard overwrote the address in the
// path with the caller's own, so every key lookup answered about the caller.
let guardBug = false;

vi.mock('@/lib/api/dehub/core', () => ({
  apiCall: vi.fn(async (endpoint: string, opts: any = {}) => {
    if (endpoint === '/api/dm/e2ee-key' && opts.method === 'POST') {
      registry.set(caller, opts.body.publicKey);
      return { address: caller, publicKey: opts.body.publicKey };
    }
    const m = endpoint.match(/^\/api\/dm\/e2ee-key\/(0x[0-9a-f]+)$/);
    if (m) {
      const answered = guardBug ? caller : m[1];
      return { address: answered, publicKey: registry.get(answered) ?? null };
    }
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
import {
  decryptText,
  deriveIdentityFromSignature,
  deriveSessionKey,
  encryptText,
  encryptionSignMessage,
  isEncryptedContent,
  toBase64,
} from '../crypto';

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

  it('sends plaintext rather than encrypt to a key the server answered about someone else', async () => {
    await become(A);
    await become(B);
    guardBug = true;
    try {
      // B asks for A's key and is handed B's own. Encrypting to it would seal
      // the message to B — readable here, an unopenable envelope for A, and no
      // error anywhere. Falling back to plaintext is the safe answer.
      expect(await prepareOutgoing(A, 'hi from B')).toEqual({ content: 'hi from B', encrypted: false });
      expect(await encryptForPeer(A, 'hi from B')).toBeNull();
    } finally {
      guardBug = false;
    }
  });

  it("still opens the sender's own messages from before the server was fixed", async () => {
    // What the broken server made a device produce: the peer lookup handed back
    // the CALLER's own key, so B sealed to itself. Built here from B's own
    // keypair, because the client now refuses to encrypt that way at all.
    const sigB = '0x' + Buffer.from(`${B}:${encryptionSignMessage(B)}`).toString('hex').padEnd(130, '0').slice(0, 130);
    const idB = deriveIdentityFromSignature(sigB);
    const sealed = encryptText('sent while the server was wrong', deriveSessionKey(idB.privateKey, idB.publicKey, B, A));

    await become(A);
    await become(B);
    // B now gets A's real key, so the session key does not open its own old
    // line — but B wrote it, and should still be able to read it.
    expect(await decryptFromPeer(A, sealed)).toBe('sent while the server was wrong');

    // A never could open it, and still cannot. Nothing here changes that.
    await become(A);
    expect(await decryptFromPeer(B, sealed)).toBeNull();
  });
  it('refreshes a stale peer key and still reads old history after reload', async () => {
    await become(B);
    await become(A);
    const oldMessage = (await encryptForPeer(B, 'old history'))!;
    const mine = deriveIdentityFromSignature(awaitSignature(A));
    const rotated = deriveIdentityFromSignature('0x' + '47'.repeat(65));
    registry.set(B, toBase64(rotated.publicKey));
    const incoming = encryptText('new history', deriveSessionKey(rotated.privateKey, mine.publicKey, B, A));
    vi.mocked(apiCall).mockClear();
    expect(await Promise.all(Array.from({ length: 10 }, () => decryptFromPeer(B, incoming)))).toEqual(Array(10).fill('new history'));
    expect(vi.mocked(apiCall).mock.calls.filter(([endpoint]) => endpoint === `/api/dm/e2ee-key/${B}`).length).toBe(1);
    expect(await decryptFromPeer(B, oldMessage)).toBe('old history');
    unloadIdentity();
    await loadIdentity(A);
    expect(await decryptFromPeer(B, oldMessage)).toBe('old history');
    expect(await decryptFromPeer(B, incoming)).toBe('new history');
    // The same current session must encrypt to the refreshed key.
    const reply = (await encryptForPeer(B, 'reply'))!;
    expect(decryptText(reply, deriveSessionKey(rotated.privateKey, mine.publicKey, B, A))).toBe('reply');
  });

  it('preserves an existing identity before replacement and opens its history after reload', async () => {
    await become(B);
    unloadIdentity();
    const old = deriveIdentityFromSignature('0x' + '38'.repeat(65));
    const oldRecord = { v: 1, priv: toBase64(old.privateKey), pub: toBase64(old.publicKey) };
    localStorage.setItem('dehub-dm-e2ee:' + A, JSON.stringify(oldRecord));
    const peer = deriveIdentityFromSignature(awaitSignature(B));
    const history = encryptText('before migration', deriveSessionKey(peer.privateKey, old.publicKey, B, A));
    caller = A;
    await setupIdentity(A, walletFor(A));
    const stored = JSON.parse((localStorage.getItem('dehub-dm-e2ee:' + A))!);
    expect(stored.previous).toContainEqual({ priv: oldRecord.priv, pub: oldRecord.pub });
    unloadIdentity();
    await loadIdentity(A);
    expect(await decryptFromPeer(B, history)).toBe('before migration');
    expect(registry.get(A)).toBe(getIdentity()!.publicKey);
  });

  it('does not replace or publish over an unreadable stored identity', async () => {
    const oldRecord = { v: 1, priv: 'damaged', pub: 'damaged' };
    localStorage.setItem('dehub-dm-e2ee:' + A, JSON.stringify(oldRecord));
    caller = A;
    await expect(setupIdentity(A, walletFor(A))).rejects.toThrow('preserved');
    expect(JSON.parse((localStorage.getItem('dehub-dm-e2ee:' + A))!)).toEqual(oldRecord);
    expect(registry.has(A)).toBe(false);
    expect(getIdentity()).toBeNull();
  });

  it('keeps the identity and published key when replacement cannot be saved', async () => {
    await become(A);
    const before = localStorage.getItem('dehub-dm-e2ee:' + A);
    const publicKey = getIdentity()!.publicKey;
    const save = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('Storage full'); });
    try {
      await expect(setupIdentity(A, walletFor(A))).rejects.toThrow('Storage full');
      expect(localStorage.getItem('dehub-dm-e2ee:' + A)).toBe(before);
      expect(getIdentity()!.publicKey).toBe(publicKey);
      expect(registry.get(A)).toBe(publicKey);
    } finally { save.mockRestore(); }
  });

});

function awaitSignature(address: string): string {
  return '0x' + Buffer.from(`${address}:${encryptionSignMessage(address)}`).toString('hex').padEnd(130, '0').slice(0, 130);
}
