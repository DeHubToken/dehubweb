/**
 * Deleting a stage's recording means deleting all of it.
 * ======================================================
 *
 * A finished recording does not stay at one path. `finalize-stage-recording`
 * rewrites the upload so it can be seeked — the WebM gets a cue index, an
 * Android capture is remuxed to m4a — and writes the result beside the
 * original as `recording.indexed.webm` or `recording.m4a`, then repoints
 * `audio_spaces.recording_url` at it.
 *
 * Both delete paths parsed the object name out of `recording_url` and removed
 * only that. So "Recording deleted" removed the indexed copy and left the
 * original `recording.webm` sitting in a public bucket, still fetchable by
 * anyone who had or could guess the URL. The host is told their recording is
 * gone; it is not.
 *
 * List the stage's own folder and remove what is actually in it.
 */

import { walletScopedClient } from '@/lib/supabase-wallet-client';

const BUCKET = 'stage-recordings';

export interface RecordingDeleteResult {
  /** Object names removed, for the log. Empty is a legitimate outcome. */
  removed: string[];
  /** Set when storage refused. The row should not be deleted on top of this. */
  error: string | null;
}

/**
 * Remove every stored object for `stageId`.
 *
 * Wallet-scoped because the bucket's delete policy checks who owns the stage,
 * and the Storage API has no per-call header to carry that on the shared
 * client.
 */
export async function deleteStageRecordings(
  stageId: string,
  walletAddress: string,
): Promise<RecordingDeleteResult> {
  if (!stageId || !walletAddress) {
    return { removed: [], error: null };
  }

  const storage = walletScopedClient(walletAddress).storage.from(BUCKET);

  const { data: files, error: listError } = await storage.list(stageId);
  if (listError) {
    return { removed: [], error: listError.message };
  }
  if (!files?.length) {
    // Nothing stored — a stage that was never recorded, or one already cleaned
    // up. Not an error, and the row should still go.
    return { removed: [], error: null };
  }

  const paths = files.map((f) => `${stageId}/${f.name}`);
  const { error: removeError } = await storage.remove(paths);
  if (removeError) {
    return { removed: [], error: removeError.message };
  }

  return { removed: paths, error: null };
}
