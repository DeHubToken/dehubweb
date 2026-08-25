/**
 * Replay resolution for ended livestreams.
 *
 * The backend records every stream through Livepeer, then moves the finished
 * file into DeHub's own bucket and deletes the Livepeer copy — so a replay is
 * a plain mp4 on the CDN, not an HLS playlist, and it only exists once that
 * capture reports `ready`.
 *
 * Lives on its own because both the feed mapper and the post page need it, and
 * neither should be importing the other.
 */

interface RecordingRecord {
  status?: string;
  url?: string;
}

/**
 * Deliberately strict about `status`: a failed or skipped capture still writes
 * a recording object, and handing a card half a record would put a play button
 * over a URL that does not exist.
 */
export function extractReplayUrl(stream: unknown): string | undefined {
  const recording = (stream as { recording?: RecordingRecord })?.recording;
  if (!recording || recording.status !== 'ready') return undefined;
  return recording.url || undefined;
}
