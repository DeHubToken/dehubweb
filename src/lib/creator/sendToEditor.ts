/**
 * Studio to editor bridge.
 * ========================
 * Takes a finished generation, imports it into the editor's media library and
 * drops it on the timeline. This is the join between the two surfaces: generate
 * in the studio, land on the timeline, keep working.
 */
import { toast } from 'sonner';
import { assetToFile, throwIfAssetAborted } from './assetDownload';
import { importOneFile } from '@/lib/editor/importFiles';
import { useEditorStore } from '@/store/editorStore';
import type { GenerationJob } from '@/store/generationStore';
import i18n from '@/i18n';
import { assertGeneratedMediaUrl, generatedMediaFormat, generatedMediaName } from './generatedMedia';

export interface SendToEditorOptions {
  wallet?: string | null;
  badgeBalance?: number | null;
  username?: string | null;
  signal?: AbortSignal;
  /** Place the clip on the timeline as well as importing it. Default true. */
  addToTimeline?: boolean;
}

const imports = new Map<string, AbortController>();
const listeners = new Set<() => void>();
let importingIds: readonly string[] = [];
const notifyImports = () => {
  importingIds = Array.from(imports.keys());
  for (const listener of listeners) listener();
};
export const getEditorImportIds = () => importingIds;
export const subscribeToEditorImports = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const cancelEditorImport = (id: string) => { imports.get(id)?.abort(); };

/**
 * Import a finished job into the editor. Returns the new media id, or null if
 * the asset could not be fetched.
 */
export async function sendJobToEditor(
  job: GenerationJob,
  options: SendToEditorOptions = {},
): Promise<string | null> {
  if (imports.has(job.id) || options.signal?.aborted) return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  imports.set(job.id, controller);
  notifyImports();
  try {
    return await importJob(job, { ...options, signal: controller.signal });
  } finally {
    options.signal?.removeEventListener('abort', abort);
    imports.delete(job.id);
    notifyImports();
  }
}

async function importJob(job: GenerationJob, options: SendToEditorOptions): Promise<string | null> {
  if (!job.url) {
    toast.error(i18n.t('creator.editorAssetMissing'));
    return null;
  }

  // The timeline has no 3D track, so a mesh comes in as a video of one slow
  // turn. Only glTF can be drawn in the browser; the other exports cannot.
  if (job.kind === 'model3d' && job.exportFormat && !['glb', 'gltf'].includes(job.exportFormat)) {
    toast.error(i18n.t('creator.editorAssetUnsupported'));
    return null;
  }

  const target = useEditorStore.getState();
  const projectId = target.projectId;
  const at = target.currentTime;
  try {
    assertGeneratedMediaUrl(job.url);
    let file: File;
    if (job.kind === 'model3d') {
      const { renderTurntable } = await import('@/lib/editor/modelTurntable');
      file = await renderTurntable(job.url, { signal: options.signal });
    } else {
      const expected = generatedMediaFormat(job.kind, job.url);
      const title = `${job.prompt || job.resolvedPrompt || job.kind}-${job.id}`;
      const download = await assetToFile(job.url, generatedMediaName(job.kind, title, expected.ext), expected.mime, { signal: options.signal });
      throwIfAssetAborted(options.signal);
      if (!download.size) throw new Error(i18n.t('creator.editorImportFailed'));
      const actual = generatedMediaFormat(job.kind, job.url, download.type);
      file = new File([download], generatedMediaName(job.kind, title, actual.ext), { type: actual.mime });
    }
    throwIfAssetAborted(options.signal);
    const mediaId = await importOneFile(file, { wallet: options.wallet ?? null,
      badgeBalance: options.badgeBalance, username: options.username, signal: options.signal });
    throwIfAssetAborted(options.signal);
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
    if (options.signal?.aborted || (e instanceof Error && e.name === 'AbortError')) return null;
    console.error('[creator] send to editor failed', e);
    toast.error(i18n.t('creator.editorImportFailed'));
    return null;
  }
}
