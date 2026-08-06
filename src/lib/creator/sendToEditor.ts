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

const EXTENSIONS: Record<GenerationJob['kind'], { ext: string; mime: string }> = {
  image: { ext: 'png', mime: 'image/png' },
  video: { ext: 'mp4', mime: 'video/mp4' },
  audio: { ext: 'mp3', mime: 'audio/mpeg' },
  // Present so the record stays exhaustive. Meshes are rejected below — the
  // timeline holds clips, and a GLB is not one.
  model3d: { ext: 'glb', mime: 'model/gltf-binary' },
};

/** Turn a prompt into a short, filesystem-safe name. */
function nameFor(job: GenerationJob): string {
  const base = (job.prompt || job.resolvedPrompt || job.kind)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const { ext } = EXTENSIONS[job.kind];
  return `${base || job.kind}-${job.id}.${ext}`;
}

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
    toast.error('That generation has no asset to send yet.');
    return null;
  }

  // The editor timeline has no 3D track. Importing a GLB would land an
  // undecodable file in the media library and fail at playback rather than here.
  if (job.kind === 'model3d') {
    toast.error('3D models cannot go on the timeline. Download the mesh instead.');
    return null;
  }

  const { mime } = EXTENSIONS[job.kind];

  try {
    const file = await assetToFile(job.url, nameFor(job), mime);
    const mediaId = await importOneFile(file, { wallet: options.wallet ?? null });
    if (!mediaId) return null;

    if (options.addToTimeline !== false) {
      useEditorStore.getState().addClipFromMedia(mediaId);
    }
    window.dispatchEvent(new CustomEvent('editor:storage-usage-changed'));
    return mediaId;
  } catch (e) {
    console.error('[creator] send to editor failed', e);
    toast.error(e instanceof Error ? e.message : 'Could not send that to the editor.');
    return null;
  }
}
