import { decodeMediaDescriptor, isMediaDescriptor, type MediaDescriptor } from './media';

/**
 * Split an opened envelope into what a bubble shows. An attachment's
 * descriptor carries its file key, so it never reaches `content`: the caption
 * does, and the descriptor rides alongside. A descriptor that does not parse
 * is treated as unopenable rather than shown.
 */
export function openMediaPlaintext(plain: string): {
  content: string;
  encMedia?: MediaDescriptor;
  undecryptable?: boolean;
} {
  if (!isMediaDescriptor(plain)) return { content: plain };
  const encMedia = decodeMediaDescriptor(plain);
  return encMedia ? { content: encMedia.caption || '', encMedia } : { content: '', undecryptable: true };
}
