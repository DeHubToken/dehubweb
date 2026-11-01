/**
 * What the comment / reply paperclip takes: an image, a video clip or an audio
 * file. Limits match the backend's /comment_image and /comment_media.
 */
export type CommentAttachmentKind = 'image' | 'video' | 'audio';

export const COMMENT_ATTACH_ACCEPT = 'image/*,video/*,audio/*';

export const COMMENT_ATTACH_LIMITS: Record<CommentAttachmentKind, number> = {
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
};

export function commentAttachmentKind(file: Pick<File, 'type'>): CommentAttachmentKind | null {
  const top = (file.type || '').split('/')[0];
  return top === 'image' || top === 'video' || top === 'audio' ? top : null;
}

/** The first file a drop or paste carries that the paperclip would take. */
export function firstAttachableFile(files: FileList | File[] | null | undefined): File | null {
  if (!files) return null;
  return Array.from(files).find((f) => commentAttachmentKind(f) !== null) ?? null;
}

/** A drag carrying files, as opposed to dragged text or a link. */
export function dragHasFiles(e: { dataTransfer: DataTransfer | null }): boolean {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
}
