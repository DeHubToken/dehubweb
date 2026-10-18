/**
 * Open an end-to-end encrypted DM attachment for display.
 *
 * Returns a local object URL once the file is downloaded and opened, plus a
 * status for the placeholder (blurred preview while loading, a "couldn't
 * open" state with retry on failure). `enabled: false` defers the download
 * until `load()` is called — used for videos and files, which are fetched on
 * tap rather than while scrolling past them.
 */
import { useCallback, useEffect, useState } from 'react';
import type { MediaDescriptor } from '@/lib/dm-e2ee/media';
import { getCachedMedia, getSeededMedia, loadDecryptedMedia } from '@/lib/dm-e2ee/media-cache';

export type DecryptedMediaStatus = 'idle' | 'loading' | 'ready' | 'error';

export function useDecryptedMedia(
  mediaUrl: string | undefined,
  descriptor: MediaDescriptor | undefined,
  opts: { messageId?: string; enabled?: boolean } = {},
) {
  const { messageId, enabled = true } = opts;
  const initial = () => getCachedMedia(mediaUrl) ?? (messageId && !mediaUrl ? getSeededMedia(messageId) : undefined);
  const [url, setUrl] = useState<string | undefined>(initial);
  const [status, setStatus] = useState<DecryptedMediaStatus>(() => (url ? 'ready' : 'idle'));
  const [requested, setRequested] = useState(enabled);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (enabled) setRequested(true);
  }, [enabled]);

  useEffect(() => {
    if (!descriptor) return;
    if (!mediaUrl) {
      // Still uploading: show this device's own copy if it sent it.
      const seeded = messageId ? getSeededMedia(messageId) : undefined;
      setUrl(seeded);
      setStatus(seeded ? 'ready' : 'idle');
      return;
    }
    const cached = getCachedMedia(mediaUrl);
    if (cached) {
      setUrl(cached);
      setStatus('ready');
      return;
    }
    if (!requested) return;
    let cancelled = false;
    setStatus('loading');
    loadDecryptedMedia(mediaUrl, descriptor, messageId).then(
      (opened) => {
        if (cancelled) return;
        setUrl(opened);
        setStatus('ready');
      },
      (err) => {
        if (cancelled) return;
        console.warn('[DM] Could not open encrypted attachment:', err);
        setStatus('error');
      },
    );
    return () => { cancelled = true; };
  }, [mediaUrl, descriptor, messageId, requested, attempt]);

  const load = useCallback(() => setRequested(true), []);
  const retry = useCallback(() => {
    setRequested(true);
    setAttempt((n) => n + 1);
  }, []);

  return { url, status, load, retry };
}
