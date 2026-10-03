/**
 * What a picture or file attached in Public Chat has to be to get posted.
 *
 * Public Chat uploads through the `dm-upload-media` edge function, which only
 * takes these image types (see supabase/functions/dm-upload-media/index.ts),
 * and the chat message type only knows how to show a picture. Documents are a
 * DM-only feature on the backend (cdn.service.ts, ALLOWED_DOCUMENT_TYPES), so
 * a PDF here used to go all the way to the upload, be refused there, and come
 * back as a bare "Failed to send message" with the typed text already gone.
 * Checking first keeps the composer intact and says what went wrong.
 */

/** Mirrors the image half of `allowedTypes` in dm-upload-media. */
export const PUBLIC_CHAT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

/** Mirrors the size cap in dm-upload-media. */
export const PUBLIC_CHAT_IMAGE_MAX_SIZE = 10 * 1024 * 1024;

export interface PublicChatMediaCheck {
  ok: boolean;
  /** Why it was refused, ready to show; set whenever ok is false. */
  error?: string;
}

export function validatePublicChatMedia(file: Pick<File, 'type' | 'size' | 'name'>): PublicChatMediaCheck {
  const type = (file.type || '').toLowerCase();
  if (!type.startsWith('image/')) {
    return {
      ok: false,
      error: 'Files can only be shared in direct messages. Public Chat accepts photos (JPG, PNG, GIF, WebP).',
    };
  }
  if (!(PUBLIC_CHAT_IMAGE_TYPES as readonly string[]).includes(type)) {
    return {
      ok: false,
      error: 'That image format isn’t supported in Public Chat. Use JPG, PNG, GIF or WebP.',
    };
  }
  if (file.size > PUBLIC_CHAT_IMAGE_MAX_SIZE) {
    return { ok: false, error: 'Image must be less than 10MB' };
  }
  return { ok: true };
}
