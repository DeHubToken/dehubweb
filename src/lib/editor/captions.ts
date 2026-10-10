import { commitCommand, type CommandCommit } from "./editorCommand";
import { projectTask } from "./projectTask";
/**
 * Auto captions, on the user's device.
 *
 * Pulls a video/audio clip's own sound (respecting trim and speed), runs
 * Whisper in public/editor/captions-worker.js, groups the words into short
 * lines and adds each line as an ordinary text layer on its own Captions
 * track, so every caption can be restyled, retimed or retyped like any text.
 * No upload, no server cost.
 */
import { useEditorStore } from "@/store/editorStore";
import type { MediaClip } from "./types";
import { nanoid } from "nanoid";
import { captionLayers, type CaptionWord, type CaptionStyle } from "./captionLayout";
export { groupWords } from "./captionLayout";
import { loadGoogleFont } from "./googleFonts";

const RATE = 16000;
/** Longest clip we transcribe in one go; roughly 15 minutes of CPU on a laptop. */
const MAX_SECONDS = 10 * 60;

export type CaptionProgress =
  | { stage: "download"; loaded: number; total: number }
  | { stage: "transcribing"; done: number; total: number };

let worker: Worker | null = null;
let seq = 0;
let busy = false;

function transcribe(audio: Float32Array, onProgress?: (p: CaptionProgress) => void, signal?: AbortSignal): Promise<CaptionWord[]> {
  if (signal?.aborted) return Promise.reject(new Error("cancelled"));
  if (busy) return Promise.reject(new Error("captions busy"));
  worker ??= new Worker("/editor/captions-worker.js", { type: "module" });
  const w = worker;
  const id = ++seq;
  busy = true;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data ?? {};
      if (d.id !== id) return;
      if (d.type === "progress") onProgress?.({ stage: "download", loaded: d.loaded, total: d.total });
      else if (d.type === "transcribing") onProgress?.({ stage: "transcribing", done: d.done, total: d.total });
      else if (d.type === "done") { cleanup(); resolve(d.words as CaptionWord[]); }
      else if (d.type === "error") { cleanup(); reject(new Error(String(d.message))); }
    };
    const onError = (e: ErrorEvent) => {
      cleanup();
      w.terminate();
      worker = null;
      reject(new Error(e.message || "captions worker failed"));
    };
    const cleanup = () => {
      busy = false;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
    };
    const cancel = () => {
      cleanup(); w.terminate(); if (worker === w) worker = null;
      reject(new Error("cancelled"));
    };
    const timer = setTimeout(cancel, 30 * 60 * 1000);
    signal?.addEventListener("abort", cancel, { once: true });
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ id, audio }, [audio.buffer]);
  });
}

/** The clip's audible section, as 16 kHz mono, in source time. */
async function clipAudio(url: string, trimIn: number, sourceSeconds: number, signal?: AbortSignal): Promise<Float32Array> {
  if (signal?.aborted) throw new Error("cancelled");
  if (!(sourceSeconds > 0) || sourceSeconds > MAX_SECONDS) throw new Error("highlight_limit");
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("media unavailable");
  const bytes = await response.arrayBuffer();
  const ac = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ac.decodeAudioData(bytes);
  } finally {
    void ac.close();
  }
  if (signal?.aborted) throw new Error("cancelled");
  if (trimIn < 0 || decoded.duration - trimIn < 0.05) throw new Error("empty audio");
  const secs = Math.max(0.1, Math.min(sourceSeconds, decoded.duration - trimIn, MAX_SECONDS));
  const off = new OfflineAudioContext(1, Math.ceil(secs * RATE), RATE);
  const node = off.createBufferSource();
  node.buffer = decoded;
  node.connect(off.destination);
  node.start(0, trimIn, secs);
  const rendered = await off.startRendering();
  if (signal?.aborted) throw new Error("cancelled");
  // A copy we own: it is transferred to the worker, and an AudioBuffer's channel cannot be.
  return rendered.getChannelData(0).slice();
}

export async function transcribeClipWords(clip: MediaClip, url: string, onProgress?: (p: CaptionProgress) => void, signal?: AbortSignal): Promise<CaptionWord[]> {
  const speed = clip.speed ?? 1;
  if (!Number.isFinite(speed) || speed <= 0) throw new Error("highlight_limit");
  const audio = await clipAudio(url, clip.trimIn, clip.duration * speed, signal);
  return transcribe(audio, onProgress, signal);
}

export async function addAutoCaptions(clipId: string, onProgress?: (p: CaptionProgress) => void, style: CaptionStyle = "classic", command?: CommandCommit): Promise<number> {
  const s = useEditorStore.getState();
  const clip = s.clips.find((c) => c.id === clipId);
  if (!clip || (clip.kind !== "video" && clip.kind !== "audio")) return 0;
  const mc = clip as MediaClip;
  const media = s.media.find((m) => m.id === mc.mediaId);
  if (!media) return 0;
  const task = projectTask(s.holdEdits());
  try {
  const words = await transcribeClipWords(mc, media.url, onProgress);
  if (!task!.isCurrent()) return 0;
  const result = captionLayers(mc, words, () => nanoid(), style);
  if (!result.clips.length) return 0;
  loadGoogleFont("Montserrat", [800]);
  const store = useEditorStore.getState();
  // The clip may have changed while transcription was running.
  if (store.projectId !== s.projectId || store.clips.find((c) => c.id === clipId) !== clip) return 0;
  let committed = false;
  await commitCommand(command, () => store.runAsOneStep(() => {
    if (!task!.isCurrent() || useEditorStore.getState().clips.find(c => c.id === clipId) !== clip) return;
    useEditorStore.setState((state) => ({ tracks: [...state.tracks, result.track], clips: [...state.clips, ...result.clips] }));
    committed = true;
  }));
  return committed ? result.clips.length : 0;
  } finally { task!.release(); }
}
