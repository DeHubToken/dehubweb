/**
 * Media library loader.
 * =====================
 * Hydrates the editor's media library from IndexedDB and then merges in cloud
 * assets, and keeps storage usage fresh.
 *
 * This used to live inside MediaPanel, which was fine only because the old
 * layout mounted that panel unconditionally. Now that panels mount on demand,
 * leaving it there broke two things at once:
 *
 *  - Opening a saved project without visiting the Media tab left the store
 *    empty, so every clip on the restored timeline had no source and the canvas
 *    came up blank.
 *  - Worse, the panel's cleanup revoked every object URL it had created. Those
 *    URLs are shared with the canvas compositor, the timeline thumbnails and
 *    the exporter, so switching away from the Media tab tore the project's
 *    media out from under all three.
 *
 * Object URLs now live as long as the editor does, which is exactly the
 * lifetime the store, canvas and exporter assume. The browser reclaims them on
 * document unload.
 */
import { useEffect } from 'react';
import { toMediaItem, useEditorStore } from '@/store/editorStore';
import { useEditorMediaStore } from '@/store/editorMediaStore';
import { getAllMedia } from '@/lib/editor/mediaStore';
import { getSignedAssetUrl, listEditorAssets, type CloudAsset } from '@/lib/editor/cloudMedia';
import { useEditorQuota } from '@/hooks/use-editor-quota';
import type { MediaItem } from '@/store/editorStore';

async function cloudAssetToMediaItem(a: CloudAsset): Promise<MediaItem | null> {
  try {
    const url = await getSignedAssetUrl(a.storage_path);
    const thumbnailUrl = a.thumbnail_path ? await getSignedAssetUrl(a.thumbnail_path) : undefined;
    return {
      id: a.id,
      name: a.name,
      kind: (a.kind === 'export' ? 'video' : a.kind) as MediaItem['kind'],
      mimeType: a.mime_type,
      size: Number(a.size_bytes) || 0,
      duration: a.duration_seconds ?? undefined,
      width: a.width ?? undefined,
      height: a.height ?? undefined,
      thumbnail: undefined,
      provenance: a.provenance ?? undefined,
      createdAt: new Date(a.created_at).getTime(),
      url,
      thumbnailUrl,
    };
  } catch (e) {
    console.warn('[editor] failed to hydrate cloud asset', a.id, e);
    return null;
  }
}

export function MediaLibraryLoader() {
  const quota = useEditorQuota();
  const setMedia = useEditorStore((s) => s.setMedia);
  const addMedia = useEditorStore((s) => s.addMedia);
  const setCloudAssets = useEditorMediaStore((s) => s.setCloudAssets);
  const markHydrated = useEditorMediaStore((s) => s.markHydrated);

  // Local IndexedDB first: it is fast and works offline.
  //
  // Guarded so a remount (route change, StrictMode's double effect, a hot
  // reload) does not mint a second object URL for every row. toMediaItem calls
  // createObjectURL per blob and per thumbnail, and setMedia replaces the array
  // without revoking what it drops, so an unguarded reload leaked the whole
  // library's worth of blobs on every mount.
  useEffect(() => {
    if (useEditorMediaStore.getState().hydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await getAllMedia();
        if (cancelled) return;
        // Another loader may have won the race while this one awaited.
        if (useEditorMediaStore.getState().hydrated) return;
        setMedia(rows.map(toMediaItem));
      } catch (e) {
        console.error('[editor] failed to load local media', e);
      } finally {
        if (!cancelled) markHydrated();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setMedia, markHydrated]);

  // Then merge the cloud, which is the source of truth across devices.
  useEffect(() => {
    if (!quota.walletAddress) return;
    let cancelled = false;
    (async () => {
      try {
        const cloud = await listEditorAssets(quota.walletAddress!);
        if (cancelled) return;
        const byId: Record<string, CloudAsset> = {};
        for (const a of cloud) byId[a.id] = a;
        setCloudAssets(byId);

        const localIds = new Set(useEditorStore.getState().media.map((m) => m.id));
        for (const a of cloud.filter((x) => !localIds.has(x.id))) {
          const item = await cloudAssetToMediaItem(a);
          if (item && !cancelled) addMedia(item);
        }
      } catch (e) {
        console.warn('[editor] cloud hydration failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quota.walletAddress, addMedia, setCloudAssets]);

  // Imports, generations and posts all announce storage changes.
  useEffect(() => {
    const onChange = () => {
      void quota.refetchUsage();
    };
    window.addEventListener('editor:storage-usage-changed', onChange);
    return () => window.removeEventListener('editor:storage-usage-changed', onChange);
  }, [quota]);

  return null;
}
