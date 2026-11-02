/**
 * Composer photos upload the moment they are attached (or re-edited), while
 * the caption is still being written. At Post the composer sends the ids
 * instead of the bytes, so publishing a photo post no longer waits on the
 * upload. Anything not uploaded yet is simply sent with the post as before.
 */
import { authedUpload, UploadHttpError } from '@/lib/api/dehub/core';

type Entry = { promise: Promise<string | null>; id: string | null };

const drafts = new WeakMap<File, Entry>();
/** Off once the server says it has no draft photos (older deploy). */
let unsupported = false;

export function startDraftImage(file: File): void {
  if (unsupported || drafts.has(file) || !file.type.startsWith('image/')) return;
  const entry: Entry = { id: null, promise: Promise.resolve(null) };
  const formData = new FormData();
  formData.append('file', file);
  entry.promise = authedUpload<{ draftImageId?: string }>('/api/draft_image', formData, {
    timeoutMs: 3 * 60 * 1000,
    unwrapResult: true,
  })
    .then((res) => {
      entry.id = typeof res?.draftImageId === 'string' ? res.draftImageId : null;
      return entry.id;
    })
    .catch((err) => {
      if (err instanceof UploadHttpError && (err.status === 404 || err.status === 503)) unsupported = true;
      // A failed early upload costs nothing: the file goes with the post.
      drafts.delete(file);
      return null;
    });
  drafts.set(file, entry);
}

/**
 * The draft ids for `files` in display order (null = send that file with the
 * post) and the files that still have to go up. Waits for uploads already in
 * flight, since finishing one is never slower than starting it again.
 * Returns null when no photo was uploaded early.
 */
export async function resolveDraftImages(
  files: File[],
): Promise<{ ids: (string | null)[]; send: File[] } | null> {
  if (unsupported || files.length === 0) return null;
  const ids = await Promise.all(files.map((f) => drafts.get(f)?.promise ?? Promise.resolve(null)));
  if (!ids.some(Boolean)) return null;
  return { ids, send: files.filter((_, i) => !ids[i]) };
}

