/**
 * One-line label for an encrypted attachment, for places that show a message
 * as text (conversation list, reply quotes, pinned bar). The descriptor holds
 * the file key, so it must never be shown itself.
 */
import type { MediaDescriptor } from './media';

type Translate = (key: string, opts: { defaultValue: string }) => string;

export function encryptedMediaLabel(media: Pick<MediaDescriptor, 'kind' | 'name'>, t: Translate): string {
  switch (media.kind) {
    case 'image':
      return t('copy.1b13ff986443', { defaultValue: '📷 Photo' });
    case 'video':
      return `🎥 ${t('copy.d534be829e32', { defaultValue: 'Video' })}`;
    case 'audio':
      return t('copy.68981d194d79', { defaultValue: '🎤 Voice message' });
    default:
      return `📎 ${media.name || t('copy.040d2b3689dd', { defaultValue: 'Attachment' })}`;
  }
}
