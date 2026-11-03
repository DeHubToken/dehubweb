/**
 * Sending an attachment in a DM, encrypted when the conversation is.
 *
 * The rule is the text rule: an attachment is sealed exactly when a text line
 * to the same peer would be. The descriptor holds the file key, so it only
 * ever leaves this device inside an `e2e:` envelope — if sealing does not come
 * back encrypted for any reason, the original file goes out the way it always
 * has (caption encrypted if it can be) and the descriptor is dropped.
 */
import { uploadAndSendMedia, type DmMessage } from '@/lib/api/dehub/dm';
import { isAllowedAttachment } from '@/lib/attachments';
import type { DmDestructChoice } from '@/lib/dm-destruct';
import type { DmVideoOptions } from '@/lib/dm-video-options';
import { isEncryptedContent } from './crypto';
import { canEncryptToPeer, prepareOutgoing } from './keys';
import {
  encodeMediaDescriptor,
  encryptMediaBytes,
  fileKeyToString,
  newFileKey,
  type MediaDescriptor,
  type MediaKind,
} from './media';
import { mediaKindOf, prepareMediaPlaintext, type PreparedMedia } from './media-prepare';

/** The server's ceiling for an encrypted `content`. */
export const MAX_ENVELOPE_CHARS = 8000;

export interface SealedMedia {
  /** Ciphertext, ready for the upload form. */
  file: File;
  /** The sealed descriptor. */
  content: string;
  encryptedKind: MediaKind;
  descriptor: MediaDescriptor;
  /** What the recipient will see once it opens, for showing locally. */
  plain: Blob;
}

export interface MediaSendDeps {
  canEncrypt: (peer: string) => Promise<boolean>;
  seal: (peer: string | null | undefined, plaintext: string) => Promise<{ content: string; encrypted: boolean }>;
  prepare: (file: File, kind: MediaKind, opts: { voiceDuration?: number; coverAt?: number }) => Promise<PreparedMedia>;
  upload: typeof uploadAndSendMedia;
}

const defaultDeps: MediaSendDeps = {
  canEncrypt: (peer) => canEncryptToPeer(peer),
  seal: (peer, plaintext) => prepareOutgoing(peer, plaintext),
  prepare: (file, kind, opts) => prepareMediaPlaintext(file, kind, opts),
  upload: (...args) => uploadAndSendMedia(...args),
};

/** Null whenever the attachment cannot (or should not) travel encrypted. */
export async function sealMediaForPeer(
  file: File,
  opts: { peerAddress: string | null | undefined; caption?: string; msgType: 'media' | 'voice'; voiceDuration?: number; mediaOptions?: DmVideoOptions },
  deps: Partial<MediaSendDeps> = {},
): Promise<SealedMedia | null> {
  const d = { ...defaultDeps, ...deps };
  const peer = opts.peerAddress;
  if (!peer) return null;
  try {
    if (!(await d.canEncrypt(peer))) return null;
    const kind = mediaKindOf(file, opts.msgType, isAllowedAttachment(file.name));
    const prepared = await d.prepare(file, kind, { voiceDuration: opts.voiceDuration, coverAt: opts.mediaOptions?.coverAt ?? opts.mediaOptions?.trimStart });
    const key = newFileKey();
    let descriptor: MediaDescriptor = {
      k: fileKeyToString(key),
      ...prepared.descriptor,
      ...(opts.caption ? { caption: opts.caption } : {}),
      ...(opts.mediaOptions && kind === 'video' ? { opts: opts.mediaOptions } : {}),
    };
    let wire = await d.seal(peer, encodeMediaDescriptor(descriptor));
    // A long caption plus a preview can overrun the envelope limit; the
    // preview is the part that can go.
    if (wire.encrypted && wire.content.length > MAX_ENVELOPE_CHARS && descriptor.thumb) {
      const { thumb: _thumb, ...rest } = descriptor;
      descriptor = rest;
      wire = await d.seal(peer, encodeMediaDescriptor(descriptor));
    }
    if (!wire.encrypted || !isEncryptedContent(wire.content) || wire.content.length > MAX_ENVELOPE_CHARS) return null;
    const ct = encryptMediaBytes(prepared.bytes, key);
    return {
      file: new File([ct as BlobPart], 'media.bin', { type: 'application/octet-stream' }),
      content: wire.content,
      encryptedKind: kind,
      descriptor,
      plain: new Blob([prepared.bytes as BlobPart], { type: descriptor.mime }),
    };
  } catch (err) {
    console.warn('[DM] Attachment could not be encrypted, sending as before:', err);
    return null;
  }
}

/**
 * Upload an attachment and create its message. Encrypted when the chat is,
 * otherwise exactly the old upload. The returned message carries the
 * plaintext caption (and the descriptor) rather than the envelope.
 */
export async function uploadDmMedia(
  file: File,
  conversationId: string,
  senderId: string,
  opts: {
    peerAddress: string | null | undefined;
    caption: string;
    msgType: 'media' | 'voice';
    voiceDuration?: number;
    replyTo?: string;
    txHash?: string;
    mediaOptions?: DmVideoOptions;
    destruct?: DmDestructChoice;
    /**
     * Pay-to-unlock price. A locked file is never sealed: the server has to
     * hold it to hand it over once the payment lands. The caption still is.
     */
    lockPrice?: number;
  },
  deps: Partial<MediaSendDeps> = {},
): Promise<{ message: DmMessage; plain?: Blob }> {
  const d = { ...defaultDeps, ...deps };
  const { peerAddress, caption, msgType, voiceDuration, replyTo, txHash, mediaOptions, destruct } = opts;
  const lockPrice = opts.lockPrice && opts.lockPrice > 0 && msgType === 'media' ? opts.lockPrice : undefined;

  const sealed = lockPrice ? null : await sealMediaForPeer(file, { peerAddress, caption, msgType, voiceDuration, mediaOptions }, d);
  if (sealed) {
    const sent = await d.upload(sealed.file, conversationId, senderId, {
      content: sealed.content,
      msgType,
      voiceDuration,
      replyTo,
      txHash,
      encryptedKind: sealed.encryptedKind,
      ...(destruct ? { destruct } : {}),
    });
    return {
      message: { ...sent, content: caption, encrypted: true, undecryptable: false, encMedia: sealed.descriptor },
      plain: sealed.plain,
    };
  }

  const wire = await d.seal(peerAddress, caption);
  const sent = await d.upload(file, conversationId, senderId, {
    content: wire.content,
    msgType,
    voiceDuration,
    replyTo,
    txHash,
    ...(mediaOptions ? { mediaOptions } : {}),
    ...(destruct ? { destruct } : {}),
    ...(lockPrice ? { lockPrice } : {}),
  });
  // The upload response echoes what we sent; keep the plaintext caption.
  const withOptions = mediaOptions && !sent.mediaOptions ? { ...sent, mediaOptions } : sent;
  return { message: wire.encrypted ? { ...withOptions, content: caption, encrypted: true } : withOptions };
}
