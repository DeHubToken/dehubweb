export type RecordingKind = "audio" | "camera" | "screen";
export const RECORDING_LIMIT_SECONDS = 600;
export function recordingMime(kind: RecordingKind, supported: (mime: string) => boolean): string | undefined {
  const candidates = kind === "audio" ? ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"] : ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/mp4", "video/webm"];
  return candidates.find(supported);
}
export function recordingExtension(mime: string): string {
  return mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
}
/** Own the recorder and every captured track until save, cancel or failure. */
export function recordStream(stream: MediaStream, kind: RecordingKind, complete: (blob: Blob, duration: number) => void, failed: () => void) {
  if (typeof MediaRecorder === "undefined") { stream.getTracks().forEach(track => track.stop()); throw new Error("recording unavailable"); }
  const mimeType = recordingMime(kind, mime => MediaRecorder.isTypeSupported(mime));
  let recorder: MediaRecorder;
  try { recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined); }
  catch (error) { stream.getTracks().forEach(track => track.stop()); throw error; }
  const chunks: Blob[] = [];
  const started = performance.now();
  let cancelled = false, finished = false, released = false;
  const release = () => { if (released) return; released = true; clearTimeout(timer); stream.getTracks().forEach(track => track.stop()); };
  const stop = (cancel = false) => {
    cancelled ||= cancel;
    if (recorder.state !== "inactive") recorder.stop();
    else release();
  };
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  recorder.onstop = () => {
    if (finished) return;
    finished = true; release();
    if (!cancelled && chunks.length) complete(new Blob(chunks, { type: recorder.mimeType || mimeType }), Math.min(RECORDING_LIMIT_SECONDS, (performance.now() - started) / 1000));
  };
  recorder.onerror = () => { if (finished) return; cancelled = true; stop(true); finished = true; release(); failed(); };
  stream.getTracks().forEach(track => track.addEventListener("ended", () => stop(), { once: true }));
  const timer = setTimeout(() => stop(), RECORDING_LIMIT_SECONDS * 1000);
  try { recorder.start(1000); }
  catch (error) { release(); throw error; }
  return { stop };
}
