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
import type { MediaClip, TextClip } from "./types";
import { fontFamilyCss, loadGoogleFont } from "./googleFonts";

const RATE = 16000;
/** Longest clip we transcribe in one go; roughly 15 minutes of CPU on a laptop. */
const MAX_SECONDS = 10 * 60;

export interface CaptionWord {
  text: string;
  start: number;
  end: number;
}

export type CaptionProgress =
  | { stage: "download"; loaded: number; total: number }
  | { stage: "transcribing"; done: number; total: number };

let worker: Worker | null = null;
let seq = 0;

function transcribe(audio: Float32Array, onProgress?: (p: CaptionProgress) => void): Promise<CaptionWord[]> {
  worker ??= new Worker("/editor/captions-worker.js", { type: "module" });
  const w = worker;
  const id = ++seq;
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
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ id, audio }, [audio.buffer]);
  });
}

/** The clip's audible section, as 16 kHz mono, in source time. */
async function clipAudio(url: string, trimIn: number, sourceSeconds: number): Promise<Float32Array> {
  const bytes = await (await fetch(url)).arrayBuffer();
  const ac = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ac.decodeAudioData(bytes);
  } finally {
    void ac.close();
  }
  const secs = Math.max(0.1, Math.min(sourceSeconds, decoded.duration - trimIn, MAX_SECONDS));
  const off = new OfflineAudioContext(1, Math.ceil(secs * RATE), RATE);
  const node = off.createBufferSource();
  node.buffer = decoded;
  node.connect(off.destination);
  node.start(0, trimIn, secs);
  const rendered = await off.startRendering();
  // A copy we own: it is transferred to the worker, and an AudioBuffer's channel cannot be.
  return rendered.getChannelData(0).slice();
}

/**
 * Split words into caption lines: short enough to read at a glance, broken at
 * sentence ends and pauses.
 */
export function groupWords(words: CaptionWord[], maxWords = 5, maxSeconds = 2.6): CaptionWord[] {
  const lines: CaptionWord[] = [];
  let cur: CaptionWord[] = [];
  const flush = () => {
    if (!cur.length) return;
    lines.push({ text: cur.map((w) => w.text).join(" "), start: cur[0].start, end: cur[cur.length - 1].end });
    cur = [];
  };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    const pause = prev ? w.start - prev.end > 0.6 : false;
    if (cur.length && (cur.length >= maxWords || w.end - cur[0].start > maxSeconds || pause)) flush();
    cur.push(w);
    if (/[.!?…]$/.test(w.text)) flush();
  }
  flush();
  return lines;
}

/**
 * Transcribe a video or audio layer and add its captions as text layers.
 * Returns the number of caption lines added.
 */
export async function addAutoCaptions(clipId: string, onProgress?: (p: CaptionProgress) => void): Promise<number> {
  const s = useEditorStore.getState();
  const clip = s.clips.find((c) => c.id === clipId);
  if (!clip || (clip.kind !== "video" && clip.kind !== "audio")) return 0;
  const mc = clip as MediaClip;
  const media = s.media.find((m) => m.id === mc.mediaId);
  if (!media) return 0;
  const speed = mc.speed && mc.speed > 0 ? mc.speed : 1;

  const audio = await clipAudio(media.url, mc.trimIn, mc.duration * speed);
  const words = await transcribe(audio, onProgress);
  const lines = groupWords(words);
  if (!lines.length) return 0;

  loadGoogleFont("Montserrat", [800]);
  const font = fontFamilyCss("Montserrat");
  const store = useEditorStore.getState();
  await store.runAsOneStep(() => {
    let trackId: string | undefined;
    lines.forEach((line, i) => {
      // Source seconds → timeline seconds. A little hang time after each
      // line, but never into the next one: an overlap would push it later on
      // the shared track and the captions would drift out of sync.
      const start = mc.start + line.start / speed;
      const next = lines[i + 1] ? mc.start + lines[i + 1].start / speed : Infinity;
      const end = Math.min(mc.start + mc.duration, mc.start + line.end / speed + 0.15, next);
      if (end <= start) return;
      const id = useEditorStore.getState().addTextClip(trackId, start, trackId ? undefined : { layer: true });
      const added = useEditorStore.getState().clips.find((c) => c.id === id) as TextClip | undefined;
      trackId ??= added?.trackId;
      useEditorStore.getState().patchClip(id, {
        text: line.text,
        duration: Math.max(0.3, end - start),
        fontFamily: font,
        fontSize: 64,
        fontWeight: 800,
        color: "#ffffff",
        stroke: { color: "#000000", width: 8 },
        x: 0.5,
        y: 0.84,
        align: "centre",
      });
    });
  });
  return lines.length;
}
