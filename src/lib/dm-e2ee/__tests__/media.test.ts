import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';

// Lets the cross-platform vector pin the nonce prefix; everything else keeps
// using real randomness.
const rng = vi.hoisted(() => ({ fixed: null as Uint8Array | null }));
vi.mock('@noble/hashes/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@noble/hashes/utils')>();
  return {
    ...actual,
    randomBytes: (n?: number) =>
      rng.fixed && n === rng.fixed.length ? rng.fixed.slice() : actual.randomBytes(n),
  };
});

vi.mock('@/lib/api/dehub/core', () => ({
  apiCall: vi.fn(),
  getMediaUrl: (u: string) => u,
}));
vi.mock('@/lib/api/dehub/dm', () => ({ uploadAndSendMedia: vi.fn() }));

import { decryptText, encryptText } from '../crypto';
import { openMediaPlaintext } from '../media-message';
import {
  CHUNK_BYTES,
  MEDIA_PREFIX,
  decodeMediaDescriptor,
  decryptMediaBytes,
  encodeMediaDescriptor,
  encryptMediaBytes,
  encryptedSize,
  fileKeyOf,
  fileKeyToString,
  isMediaDescriptor,
  newFileKey,
  type MediaDescriptor,
} from '../media';
import { uploadDmMedia, type MediaSendDeps } from '../media-send';
import type { DmMessage } from '@/lib/api/dehub/dm';

type UploadOpts = Parameters<MediaSendDeps['upload']>[3];

function pattern(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 7) & 0xff;
  return out;
}

function readBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

beforeEach(() => {
  rng.fixed = null;
});

describe('encrypted DM media bytes', () => {
  it.each([0, 1, CHUNK_BYTES, 70_000, 200_000])('round-trips %i bytes', (n) => {
    const key = newFileKey();
    const plain = pattern(n);
    const blob = encryptMediaBytes(plain, key);
    expect(blob.length).toBe(encryptedSize(n));
    expect(decryptMediaBytes(blob, key)).toEqual(plain);
  });

  it('refuses the wrong key', () => {
    const blob = encryptMediaBytes(pattern(1000), newFileKey());
    expect(() => decryptMediaBytes(blob, newFileKey())).toThrow();
  });

  it('refuses a tampered byte', () => {
    const key = newFileKey();
    const blob = encryptMediaBytes(pattern(70_000), key);
    blob[blob.length - 100] ^= 0x01;
    expect(() => decryptMediaBytes(blob, key)).toThrow();
  });

  it('refuses a blob truncated at a chunk boundary', () => {
    const key = newFileKey();
    const blob = encryptMediaBytes(pattern(200_000), key);
    // Header (magic + prefix) then three full sealed chunks; the short last one is dropped.
    const header = encryptedSize(0) - 16;
    const cut = blob.subarray(0, header + 3 * (CHUNK_BYTES + 16));
    expect(() => decryptMediaBytes(cut, key)).toThrow();
  });

  it('matches the cross-platform vector', () => {
    rng.fixed = Uint8Array.from({ length: 16 }, (_, i) => 0xa0 + i);
    const key = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
    const plain = pattern(70_000);
    const blob = encryptMediaBytes(plain, key);
    expect(blob.length).toBe(70_052);
    expect(bytesToHex(sha256(blob))).toBe('fac5c478d44e406c5debbd3d67b3283786fe9f25cc01c7f36957f92b5527aa4f');
    rng.fixed = null;
    expect(decryptMediaBytes(blob, key)).toEqual(plain);
  });
});

describe('media descriptor', () => {
  const descriptor: MediaDescriptor = {
    k: fileKeyToString(Uint8Array.from({ length: 32 }, (_, i) => i)),
    kind: 'image',
    mime: 'image/jpeg',
    size: 12345,
    name: 'beach.jpg',
    w: 2048,
    h: 1536,
    thumb: 'data:image/jpeg;base64,AAAA',
    caption: 'look 🌊',
  };

  it('encodes and decodes', () => {
    const text = encodeMediaDescriptor(descriptor);
    expect(text.startsWith(MEDIA_PREFIX)).toBe(true);
    expect(isMediaDescriptor(text)).toBe(true);
    expect(decodeMediaDescriptor(text)).toEqual(descriptor);
    expect(fileKeyOf(decodeMediaDescriptor(text)!)).toEqual(Uint8Array.from({ length: 32 }, (_, i) => i));
  });

  it('rejects anything malformed', () => {
    expect(decodeMediaDescriptor('hello')).toBeNull();
    expect(decodeMediaDescriptor(MEDIA_PREFIX + '{not json')).toBeNull();
    expect(decodeMediaDescriptor(encodeMediaDescriptor({ ...descriptor, k: fileKeyToString(new Uint8Array(16)) }))).toBeNull();
    expect(decodeMediaDescriptor(encodeMediaDescriptor({ ...descriptor, kind: 'sticker' as never }))).toBeNull();
  });

  it('opens to its caption, never the descriptor text', () => {
    expect(openMediaPlaintext(encodeMediaDescriptor(descriptor))).toEqual({ content: 'look 🌊', encMedia: descriptor });
    expect(openMediaPlaintext(encodeMediaDescriptor({ ...descriptor, caption: undefined })).content).toBe('');
    expect(openMediaPlaintext(MEDIA_PREFIX + '{broken')).toEqual({ content: '', undecryptable: true });
    expect(openMediaPlaintext('just text')).toEqual({ content: 'just text' });
  });
});

describe('sending an attachment', () => {
  const sessionKey = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);
  const original = pattern(5000);
  const photo = () => new File([original as BlobPart], 'photo.png', { type: 'image/png' });

  function deps(overrides: Partial<MediaSendDeps> = {}) {
    const upload = vi.fn(async (_file: File, conversationId: string, _sender: string, opts: UploadOpts) => ({
      _id: 'm1',
      conversation: conversationId,
      content: opts?.content ?? '',
      mediaUrls: [],
    }) as unknown as DmMessage);
    return {
      upload,
      deps: {
        canEncrypt: async () => true,
        seal: async (_peer: string | null | undefined, text: string) => ({ content: encryptText(text, sessionKey), encrypted: true }),
        prepare: async (file: File) => ({
          bytes: original,
          descriptor: { kind: 'image' as const, mime: file.type, size: original.length, name: file.name, w: 10, h: 10 },
        }),
        upload,
        ...overrides,
      } satisfies MediaSendDeps,
    };
  }

  function expectNoDescriptorInClear(upload: ReturnType<typeof deps>['upload']) {
    for (const [, , , opts] of upload.mock.calls) {
      expect(String(opts?.content ?? '')).not.toContain(MEDIA_PREFIX);
    }
  }

  it('uploads ciphertext with the descriptor sealed into the content', async () => {
    const { upload, deps: d } = deps();
    const { message, plain } = await uploadDmMedia(photo(), 'c1', 'u1', {
      peerAddress: '0xpeer', caption: 'hi', msgType: 'media',
    }, d);

    expect(upload).toHaveBeenCalledTimes(1);
    const [file, , , opts] = upload.mock.calls[0];
    expect(file.name).toBe('media.bin');
    expect(file.type).toBe('application/octet-stream');
    expect(opts.encryptedKind).toBe('image');
    expect(opts.content.startsWith('e2e:')).toBe(true);
    expectNoDescriptorInClear(upload);

    const descriptor = decodeMediaDescriptor(decryptText(opts.content, sessionKey))!;
    expect(descriptor.caption).toBe('hi');
    expect(decryptMediaBytes(await readBytes(file), fileKeyOf(descriptor))).toEqual(original);
    expect(message.content).toBe('hi');
    expect(message.encMedia).toEqual(descriptor);
    expect(await readBytes(plain!)).toEqual(original);
  });

  it('sends the original file the old way when the chat cannot be encrypted', async () => {
    const { upload, deps: d } = deps({
      canEncrypt: async () => false,
      seal: async (_peer, text) => ({ content: text, encrypted: false }),
    });
    const f = photo();
    await uploadDmMedia(f, 'c1', 'u1', { peerAddress: '0xpeer', caption: 'hi', msgType: 'media' }, d);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][0]).toBe(f);
    expect(upload.mock.calls[0][3].encryptedKind).toBeUndefined();
    expect(upload.mock.calls[0][3].content).toBe('hi');
    expectNoDescriptorInClear(upload);
  });

  it('never uploads the descriptor when sealing does not come back encrypted', async () => {
    const { upload, deps: d } = deps({
      // Keys looked available, but the seal fell back to plaintext.
      seal: async (_peer, text) => ({ content: text, encrypted: false }),
    });
    const f = photo();
    await uploadDmMedia(f, 'c1', 'u1', { peerAddress: '0xpeer', caption: 'hi', msgType: 'media' }, d);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][0]).toBe(f);
    expect(upload.mock.calls[0][3].encryptedKind).toBeUndefined();
    expectNoDescriptorInClear(upload);
  });

  it('falls back to the original file when preparing the attachment fails', async () => {
    const { upload, deps: d } = deps({ prepare: async () => { throw new Error('decode failed'); } });
    const f = photo();
    await uploadDmMedia(f, 'c1', 'u1', { peerAddress: '0xpeer', caption: '', msgType: 'media' }, d);
    expect(upload.mock.calls[0][0]).toBe(f);
    expect(upload.mock.calls[0][3].encryptedKind).toBeUndefined();
    expectNoDescriptorInClear(upload);
  });

  it('drops the preview rather than overrun the envelope limit', async () => {
    const { upload, deps: d } = deps({
      prepare: async (file) => ({
        bytes: original,
        descriptor: { kind: 'image', mime: file.type, size: original.length, thumb: 'data:image/jpeg;base64,' + 'A'.repeat(1400) },
      }),
    });
    await uploadDmMedia(photo(), 'c1', 'u1', { peerAddress: '0xpeer', caption: 'x'.repeat(4500), msgType: 'media' }, d);
    const opts = upload.mock.calls[0][3];
    expect(opts.encryptedKind).toBe('image');
    expect(opts.content.length).toBeLessThanOrEqual(8000);
    expect(decodeMediaDescriptor(decryptText(opts.content, sessionKey))!.thumb).toBeUndefined();
  });
});
