/**
 * Studio to editor bridge.
 * ========================
 * Takes a finished generation, imports it into the editor's media library and
 * drops it on the timeline. This is the join between the two surfaces: generate
 * in the studio, land on the timeline, keep working.
 */
import { toast } from 'sonner';
import { assetToFile } from '@/lib/creator/generationEngine';
import { importOneFile } from '@/lib/editor/importFiles';
import { useEditorStore } from '@/store/editorStore';
import type { GenerationJob } from '@/store/generationStore';
import i18n from '@/i18n';
import { assertGeneratedMediaUrl, generatedMediaFormat, generatedMediaName } from './generatedMedia';

export interface SendToEditorOptions {
  wallet?: string | null;
  /** Place the clip on the timeline as well as importing it. Default true. */
  addToTimeline?: boolean;
}

/**
 * Import a finished job into the editor. Returns the new media id, or null if
 * the asset could not be fetched.
 */
export async function sendJobToEditor(
  job: GenerationJob,
  options: SendToEditorOptions = {},
): Promise<string | null> {
  if (!job.url) {
    toast.error(i18n.t('creator.editorAssetMissing'));
    return null;
  }

  // The editor timeline has no 3D track. Importing a GLB would land an
  // undecodable file in the media library and fail at playback rather than here.
  if (job.kind === 'model3d') {
    toast.error(i18n.t('creator.editorAssetUnsupported'));
    return null;
  }

  const target = useEditorStore.getState();
  const projectId = target.projectId;
  const at = target.currentTime;
  try {
    assertGeneratedMediaUrl(job.url);
    const expected = generatedMediaFormat(job.kind, job.url);
    const title = `${job.prompt || job.resolvedPrompt || job.kind}-${job.id}`;
    const download = await assetToFile(job.url, generatedMediaName(job.kind, title, expected.ext), expected.mime);
    if (!download.size) throw new Error(i18n.t('creator.editorImportFailed'));
    const actual = generatedMediaFormat(job.kind, job.url, download.type);
    const file = new File([download], generatedMediaName(job.kind, title, actual.ext), { type: actual.mime });
    const mediaId = await importOneFile(file, { wallet: options.wallet ?? null });
    if (!mediaId) return null;

    if (options.addToTimeline !== false) {
      const current = useEditorStore.getState();
      if (current.projectId !== projectId) {
        window.dispatchEvent(new CustomEvent('editor:storage-usage-changed'));
        toast.info(i18n.t('creator.editorImportedToLibrary'));
        return null;
      }
      if (!current.addClipFromMedia(mediaId, undefined, at)) return null;
    }
    window.dispatchEvent(new CustomEvent('editor:storage-usage-changed'));
    return mediaId;
  } catch (e) {
    console.error('[creator] send to editor failed', e);
    toast.error(i18n.t('creator.editorImportFailed'));
    return null;
  }
}
