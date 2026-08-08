/**
 * Creator generation engine.
 * ==========================
 * One call path for every generation DeHub can run, shared by the /creator
 * studio and the /editor Generate panel. Before this existed both surfaces
 * hand-rolled their own `functions.invoke` calls, which is how the editor
 * ended up shipping a video model id the edge function rejects.
 *
 * Payment is deliberately NOT handled here. The DHB paywall modals
 * (ImagePaywallModal / VideoPaywallModal) settle on chain first and call these
 * functions only after the transfer confirms.
 */
import { supabase } from '@/integrations/supabase/client';
import { invokeAi, dehubAuthHeaders } from '@/lib/ai-invoke';

export type GenerationKind = 'image' | 'video' | 'audio' | 'model3d';

export interface ImageRequest {
  prompt: string;
  model: string;
  /** Data URL or https URL of an image to edit / use as reference. */
  sourceImage?: string;
  /** Requested framing, e.g. '16:9'. Steered in the prompt by the edge function. */
  aspectRatio?: string;
}

export interface VideoRequest {
  prompt: string;
  model: string;
  sourceImage?: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: '480p' | '720p' | '1080p';
  negativePrompt?: string;
  referenceImageUrls?: string[];
  endFrameUrl?: string;
  audioUrls?: string[];
  videoUrls?: string[];
  seed?: number;
}

/**
 * Voice knobs, shared by speech, dialogue and the voice changer.
 *
 * Named for what they do rather than mirroring the provider's field names —
 * `similarity_boost` and friends are translated in the edge functions, so the
 * wire format is not spread across the client.
 */
export interface VoiceTuning {
  stability?: number;
  similarity?: number;
  style?: number;
  speakerBoost?: boolean;
  /** 0.7-1.2. Silently dropped for v3, which paces itself. */
  speed?: number;
}

/**
 * Text to speech.
 *
 * `task` is optional and defaults to speech, which is what keeps the editor's
 * voiceover button — `generateAudio({ text, voiceId })` — working untouched.
 */
export interface SpeechRequest {
  task?: 'speech';
  text: string;
  voiceId: string;
  modelId?: string;
  /** Overrides the language the model would infer from the text. */
  languageCode?: string;
  seed?: number;
  outputFormat?: string;
  voiceSettings?: VoiceTuning;
}

export interface DialogueRequest {
  task: 'dialogue';
  /** One entry per line of the scene, in order, each with its speaker's voice. */
  inputs: { text: string; voiceId: string }[];
  outputFormat?: string;
  seed?: number;
  voiceSettings?: VoiceTuning;
}

export interface SfxRequest {
  task: 'sfx';
  text: string;
  /** Omit or 0 to let the model choose a natural length. */
  durationSeconds?: number;
  promptInfluence?: number;
  loop?: boolean;
  outputFormat?: string;
}

export interface MusicRequest {
  task: 'music';
  prompt: string;
  lengthSeconds: number;
  instrumental?: boolean;
  outputFormat?: string;
}

export interface VoiceChangerRequest {
  task: 'voice-changer';
  file: File;
  voiceId: string;
  removeNoise?: boolean;
  outputFormat?: string;
  voiceSettings?: VoiceTuning;
}

export interface DubRequest {
  task: 'dubbing';
  file: File;
  targetLang: string;
  sourceLang?: string;
  numSpeakers?: number;
}

export interface TranscribeRequest {
  task: 'transcribe';
  file: File;
  diarize?: boolean;
  languageCode?: string;
}

export interface IsolateRequest {
  task: 'isolate';
  file: File;
  outputFormat?: string;
}

export type AudioRequest =
  | SpeechRequest
  | DialogueRequest
  | SfxRequest
  | MusicRequest
  | VoiceChangerRequest
  | DubRequest
  | TranscribeRequest
  | IsolateRequest;

/** Which tool ran, for the job card. Speech is the default for a bare request. */
export function audioTaskOf(req: AudioRequest): string {
  return req.task ?? 'speech';
}

/**
 * What an audio task produces.
 *
 * Two shapes rather than one because transcription is the odd one out: it is
 * the only task here whose result is words, not sound, and forcing it to
 * pretend otherwise would mean handing back an empty blob for the player to
 * choke on.
 */
export interface AudioTaskResult {
  /** Object URL of the finished clip, for every task except transcription. */
  url?: string;
  /** Plain-text transcript, transcription only. */
  transcript?: string;
  /** Speaker-labelled turns, when diarisation found more than one voice. */
  segments?: { speaker: string | null; text: string; start: number | null }[];
}

export interface Model3dRequest {
  /** Optional for the image-only models, required for the text path. */
  prompt?: string;
  model: string;
  /** Data URL or https URL of the reference image. */
  sourceImage?: string;
  /** Extra views of the same subject, for models that read more than one. */
  referenceImageUrls?: string[];
  negativePrompt?: string;
  textureQuality?: 'none' | 'standard' | 'HD';
  pbr?: boolean;
  faceLimit?: number;
  quad?: boolean;
  seed?: number;
  exportFormat?: 'glb' | 'usdz' | 'fbx' | 'obj' | 'stl';
}

/**
 * Everything needed to pick a render back up. Persisting this is what makes a
 * paid render survive a reload instead of being silently abandoned.
 */
export interface RenderTicket {
  predictionId: string;
  provider?: string;
  falAppId?: string;
  /** When the render was queued, so a resumed poll keeps the original deadline. */
  startedAt: number;
}

export interface GenerationHandlers {
  /** Human-readable stage, surfaced in the job card. */
  onStage?: (stage: string) => void;
  /** Fires as soon as the provider accepts the render, before any polling. */
  onQueued?: (ticket: RenderTicket) => void;
  /**
   * A poster/preview still the provider produced alongside the asset. Free —
   * it comes back on the same status call — and it is what stops the library
   * grid from being a wall of identical placeholder icons.
   */
  onPreview?: (url: string) => void;
  /** Aborts polling. The upstream render is not cancelled. */
  signal?: AbortSignal;
}

/** Default ElevenLabs voice (Aria), matching the assistant. */
export const DEFAULT_VOICE_ID = '9BWtsMINqrJLrRacOk9x';

/**
 * Project URL and publishable key, read off the live client rather than
 * re-declared here. They are protected on the type but present at runtime, and
 * integrations/supabase/client.ts is generated so it cannot export them.
 * Needed because the TTS endpoint returns a binary body that functions-js
 * cannot decode (see generateAudio).
 */
const clientConfig = supabase as unknown as { supabaseUrl: string; supabaseKey: string };
const SUPABASE_URL = clientConfig.supabaseUrl;
const SUPABASE_ANON_KEY = clientConfig.supabaseKey;

const VIDEO_POLL_START_MS = 5_000;
const VIDEO_POLL_MAX_MS = 15_000;
const VIDEO_TIMEOUT_MS = 12 * 60 * 1000;
/**
 * A single failed poll must not kill a render the creator has already paid
 * for. Transient 5xx, a dropped connection or a rate-limit blip are retried;
 * only a sustained run of failures gives up.
 */
const MAX_CONSECUTIVE_POLL_ERRORS = 5;

class AbortedError extends Error {
  constructor() {
    super('Generation cancelled');
    this.name = 'AbortedError';
  }
}

export function isAborted(e: unknown): boolean {
  if (e instanceof AbortedError) return true;
  // generateAudio hands the signal to a native fetch, which rejects with a
  // DOMException named 'AbortError' rather than this module's AbortedError.
  // Without both names a cancelled voiceover was reported as a failure.
  return e instanceof Error && (e.name === 'AbortedError' || e.name === 'AbortError');
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new AbortedError();
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    // An AbortSignal fires `abort` exactly once. A listener attached after the
    // fact never runs, so an already-aborted signal has to be caught up front
    // or a cancelled job sleeps on regardless.
    if (signal?.aborted) {
      reject(new AbortedError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AbortedError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Pull the real message out of a functions-js failure.
 *
 * On any non-2xx the client throws FunctionsHttpError, whose `message` is the
 * useless literal 'Edge Function returned a non-2xx status code' and whose
 * `context` is the untouched Response. Every meaningful message these edge
 * functions produce lives in that body, so read it.
 */
async function describeInvokeError(
  error: { message?: string; context?: unknown } | null,
  fallback: string,
): Promise<string> {
  const response = error?.context;
  if (response instanceof Response) {
    try {
      const text = await response.clone().text();
      if (text) {
        try {
          const parsed = JSON.parse(text) as { error?: string; message?: string };
          const message = parsed.error || parsed.message;
          if (message) return message;
        } catch {
          return text.slice(0, 300);
        }
      }
    } catch {
      /* body already consumed or unreadable */
    }
    if (response.status === 429) {
      return 'Rate limit reached. Wait a few minutes and try again.';
    }
  }
  return error?.message || fallback;
}

/** Unwrap the two failure shapes edge functions use: transport error and body `error`. */
async function unwrap<T extends { error?: string }>(
  res: { data: T | null; error: { message?: string; context?: unknown } | null },
  fallback: string,
): Promise<T> {
  if (res.error) throw new Error(await describeInvokeError(res.error, fallback));
  if (!res.data) throw new Error(fallback);
  if (res.data.error) throw new Error(res.data.error);
  return res.data;
}

/**
 * Data URLs above this are staged in storage before being sent to an edge
 * function. Both a generated still handed over by "Animate this" and a large
 * attachment arrive as base64, and inlining those would post a multi-megabyte
 * JSON body on every generation.
 */
const MAX_INLINE_SOURCE_IMAGE_CHARS = 200_000;

/**
 * Upload a data URL to the shared AI bucket and return its public URL.
 *
 * Exported because the 3D path has to stage its reference BEFORE the DHB
 * transfer: no 3D endpoint accepts a data URL, so a staging failure after
 * payment would burn the charge with nothing queued at the provider.
 */
export async function hostDataUrl(dataUrl: string): Promise<string> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const ext = (blob.type.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '');
  const path = `creator-sources/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from('ai-media-uploads').upload(path, blob, {
    contentType: blob.type || 'image/png',
    upsert: false,
  });
  if (error) throw new Error(`Could not stage the source image: ${error.message}`);
  const { data } = supabase.storage.from('ai-media-uploads').getPublicUrl(path);
  return data.publicUrl;
}

/** Text to image, or image plus instruction to edited image. Resolves to a URL. */
export async function generateImage(
  req: ImageRequest,
  handlers: GenerationHandlers = {},
): Promise<string> {
  throwIfAborted(handlers.signal);
  handlers.onStage?.(req.sourceImage ? 'Applying the edit' : 'Painting the frame');

  // Same staging as the video path: a big attachment or a generated still
  // arrives as base64 and would otherwise be JSON-encoded into the request.
  let sourceImage = req.sourceImage;
  if (sourceImage?.startsWith('data:') && sourceImage.length > MAX_INLINE_SOURCE_IMAGE_CHARS) {
    handlers.onStage?.('Preparing the reference');
    sourceImage = await hostDataUrl(sourceImage);
    throwIfAborted(handlers.signal);
  }

  const res = await invokeAi('generate-image', {
    body: {
      prompt: req.prompt,
      model: req.model,
      ...(sourceImage ? { sourceImage } : {}),
      ...(req.aspectRatio ? { aspectRatio: req.aspectRatio } : {}),
    },
  });

  const data = await unwrap<{ imageUrl?: string; error?: string }>(res, 'Image generation failed');
  if (!data.imageUrl) throw new Error('The model returned no image');
  throwIfAborted(handlers.signal);
  return data.imageUrl;
}

/**
 * Text or image to video. Queues the render, then polls until it lands.
 * Resolves to the finished video URL.
 */
export async function generateVideo(
  req: VideoRequest,
  handlers: GenerationHandlers = {},
): Promise<string> {
  throwIfAborted(handlers.signal);

  // A generated still handed over by "Animate this" arrives as a base64 data
  // URL. Stage anything large in storage and send a link instead.
  let sourceImage = req.sourceImage;
  if (sourceImage?.startsWith('data:') && sourceImage.length > MAX_INLINE_SOURCE_IMAGE_CHARS) {
    handlers.onStage?.('Preparing the first frame');
    sourceImage = await hostDataUrl(sourceImage);
    throwIfAborted(handlers.signal);
  }

  handlers.onStage?.('Queueing the render');

  const start = await invokeAi('generate-video', {
    body: {
      prompt: req.prompt,
      model: req.model,
      duration: `${req.duration ?? 5}s`,
      aspectRatio: req.aspectRatio ?? '16:9',
      ...(sourceImage ? { sourceImage } : {}),
      ...(req.resolution ? { resolution: req.resolution } : {}),
      ...(req.negativePrompt ? { negativePrompt: req.negativePrompt } : {}),
      ...(req.referenceImageUrls?.length ? { referenceImageUrls: req.referenceImageUrls } : {}),
      ...(req.endFrameUrl ? { endFrameUrl: req.endFrameUrl } : {}),
      ...(req.audioUrls?.length ? { audioUrls: req.audioUrls } : {}),
      ...(req.videoUrls?.length ? { videoUrls: req.videoUrls } : {}),
      ...(req.seed !== undefined ? { seed: req.seed } : {}),
    },
  });

  const queued = await unwrap<{
    predictionId?: string;
    provider?: string;
    falAppId?: string;
    videoUrl?: string;
    error?: string;
  }>(start, 'Video generation failed');

  // Some providers return synchronously.
  if (queued.videoUrl) return queued.videoUrl;
  if (!queued.predictionId) throw new Error('The render was not queued');

  const ticket: RenderTicket = {
    predictionId: queued.predictionId,
    provider: queued.provider,
    falAppId: queued.falAppId,
    startedAt: Date.now(),
  };
  handlers.onQueued?.(ticket);

  return pollVideo(ticket, handlers);
}

/**
 * Shared queue poller.
 *
 * generate-video and generate-3d expose the same ticket contract, so the
 * back-off, the transient-error tolerance and the "ask once before sleeping"
 * behaviour are worth having in exactly one place. Only the edge function name
 * and the key the finished asset arrives under differ.
 */
async function pollRender(
  ticket: RenderTicket,
  handlers: GenerationHandlers,
  config: {
    functionName: 'generate-video' | 'generate-3d';
    /** Key on the status body holding the finished asset URL. */
    resultKey: 'videoUrl' | 'modelUrl';
    /** Wording for the terminal-but-empty case. */
    emptyMessage: string;
    stageLabel: string;
  },
): Promise<string> {
  throwIfAborted(handlers.signal);

  const began = ticket.startedAt || Date.now();
  handlers.onStage?.(config.stageLabel);

  let interval = VIDEO_POLL_START_MS;
  let consecutiveErrors = 0;
  // Ask once before sleeping. A ticket restored from a previous session is very
  // often already finished, and a render past its deadline still deserves one
  // status call: giving up without asking abandons a paid result that is
  // sitting there ready.
  let firstAttempt = true;

  for (;;) {
    if (!firstAttempt) {
      if (Date.now() - began >= VIDEO_TIMEOUT_MS) break;
      await sleep(interval, handlers.signal);
      throwIfAborted(handlers.signal);
    }
    firstAttempt = false;

    const poll = await supabase.functions.invoke(config.functionName, {
      body: {
        predictionId: ticket.predictionId,
        provider: ticket.provider,
        falAppId: ticket.falAppId,
      },
    });
    throwIfAborted(handlers.signal);

    if (poll.error) {
      // The render is already paid for and still running upstream, so a single
      // bad poll is not a reason to throw it away. Back off and try again.
      consecutiveErrors += 1;
      if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
        throw new Error(await describeInvokeError(poll.error, 'Lost contact with the render'));
      }
      interval = Math.min(VIDEO_POLL_MAX_MS, Math.round(interval * 1.6));
      continue;
    }

    consecutiveErrors = 0;
    const status = poll.data as
      | {
          status?: string;
          videoUrl?: string;
          modelUrl?: string;
          previewImageUrl?: string;
          error?: string;
        }
      | null;

    if (status?.status === 'failed') throw new Error(status.error || 'The render failed');
    if (status?.status === 'succeeded') {
      if (status.previewImageUrl) handlers.onPreview?.(status.previewImageUrl);
      const url = status[config.resultKey];
      if (url) return url;
      // Terminal but unreadable: the provider used an output shape the status
      // handler does not map. Fail now rather than polling a finished job for
      // the rest of the timeout.
      throw new Error(config.emptyMessage);
    }

    // Ease off as the wait grows; most renders land in the first minute or two.
    const elapsed = Math.round((Date.now() - began) / 1000);
    if (elapsed > 60) interval = VIDEO_POLL_MAX_MS;
    handlers.onStage?.(`${config.stageLabel} (${elapsed}s)`);
  }

  throw new Error('The render timed out. It may still finish at the provider.');
}

/**
 * Poll an already-queued video render to completion. Split out of generateVideo
 * so a reload can rejoin a render that is still running rather than abandoning
 * something the creator has already paid for.
 */
export function pollVideo(
  ticket: RenderTicket,
  handlers: GenerationHandlers = {},
): Promise<string> {
  return pollRender(ticket, handlers, {
    functionName: 'generate-video',
    resultKey: 'videoUrl',
    emptyMessage: 'The render finished but returned no playable video.',
    stageLabel: 'Rendering',
  });
}

/** Poll an already-queued mesh to completion. Resumable for the same reason. */
export function poll3d(ticket: RenderTicket, handlers: GenerationHandlers = {}): Promise<string> {
  return pollRender(ticket, handlers, {
    functionName: 'generate-3d',
    resultKey: 'modelUrl',
    emptyMessage: 'The mesh finished but returned no downloadable model.',
    stageLabel: 'Sculpting',
  });
}

/**
 * Text or image to a 3D mesh. Queues the job, then polls until the mesh lands.
 * Resolves to the finished model URL (GLB unless another export format was
 * requested).
 */
export async function generate3d(
  req: Model3dRequest,
  handlers: GenerationHandlers = {},
): Promise<string> {
  throwIfAborted(handlers.signal);

  // fal.ai fetches the reference over HTTP, so a base64 attachment has to be
  // hosted first. Unlike the image and video paths there is no inline fallback:
  // no 3D endpoint accepts a data URL, so anything base64 is staged regardless
  // of size.
  let sourceImage = req.sourceImage;
  if (sourceImage?.startsWith('data:')) {
    handlers.onStage?.('Preparing the reference');
    sourceImage = await hostDataUrl(sourceImage);
    throwIfAborted(handlers.signal);
  }

  handlers.onStage?.('Queueing the mesh');

  const start = await invokeAi('generate-3d', {
    body: {
      model: req.model,
      ...(req.prompt ? { prompt: req.prompt } : {}),
      ...(sourceImage ? { sourceImage } : {}),
      ...(req.referenceImageUrls?.length ? { referenceImageUrls: req.referenceImageUrls } : {}),
      ...(req.negativePrompt ? { negativePrompt: req.negativePrompt } : {}),
      ...(req.textureQuality ? { textureQuality: req.textureQuality } : {}),
      ...(req.pbr !== undefined ? { pbr: req.pbr } : {}),
      ...(req.faceLimit ? { faceLimit: req.faceLimit } : {}),
      ...(req.quad ? { quad: req.quad } : {}),
      ...(req.seed !== undefined ? { seed: req.seed } : {}),
      ...(req.exportFormat ? { exportFormat: req.exportFormat } : {}),
    },
  });

  const queued = await unwrap<{
    predictionId?: string;
    provider?: string;
    falAppId?: string;
    modelUrl?: string;
    error?: string;
  }>(start, '3D generation failed');

  if (queued.modelUrl) return queued.modelUrl;
  if (!queued.predictionId) throw new Error('The mesh was not queued');

  const ticket: RenderTicket = {
    predictionId: queued.predictionId,
    provider: queued.provider,
    falAppId: queued.falAppId,
    startedAt: Date.now(),
  };
  handlers.onQueued?.(ticket);

  return poll3d(ticket, handlers);
}

/**
 * Text to speech.
 *
 * Deliberately uses fetch rather than supabase.functions.invoke. The edge
 * function returns a raw MP3 body with Content-Type audio/mpeg, and
 * functions-js only builds a Blob for application/octet-stream and
 * application/pdf; everything else non-JSON falls through to response.text().
 * Going through invoke therefore handed back a mojibake string and every
 * voiceover failed with 'Unexpected response from the voice service'.
 */
export async function generateAudio(
  req: SpeechRequest,
  handlers: GenerationHandlers = {},
): Promise<{ blob: Blob }> {
  throwIfAborted(handlers.signal);
  handlers.onStage?.('Synthesising the voice');

  const blob = await callAudioFunction(
    'elevenlabs-tts',
    {
      text: req.text,
      voiceId: req.voiceId || DEFAULT_VOICE_ID,
      modelId: req.modelId,
      languageCode: req.languageCode,
      seed: req.seed,
      outputFormat: req.outputFormat,
      voiceSettings: req.voiceSettings,
    },
    handlers,
    'Voice generation failed',
  );

  throwIfAborted(handlers.signal);
  return { blob };
}

// ── Audio tasks ─────────────────────────────────────────────────────────────

/** Supabase auth headers. Falls back to the anon key when nobody is signed in. */
async function functionHeaders(): Promise<Record<string, string>> {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token ?? SUPABASE_ANON_KEY;
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    // The paid audio functions authenticate on the DeHub token rather than the
    // Supabase session, so it has to travel with these too.
    ...dehubAuthHeaders(),
  };
}

/** Lift the edge function's own `error` out of a failed response. */
async function readFunctionError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch {
    /* non-JSON error body */
  }
  return `${fallback} (${response.status})`;
}

/**
 * Call an audio function that answers with raw bytes.
 *
 * Same reason generateAudio has always used fetch rather than
 * supabase.functions.invoke: functions-js only builds a Blob for a couple of
 * content types and hands everything else back as mojibake text. A FormData
 * body is passed through untouched so the browser can set its own multipart
 * boundary — setting Content-Type by hand here is what breaks file uploads.
 */
async function callAudioFunction(
  fn: string,
  body: Record<string, unknown> | FormData,
  handlers: GenerationHandlers,
  fallbackError: string,
): Promise<Blob> {
  const isForm = body instanceof FormData;
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      ...(await functionHeaders()),
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
    },
    body: isForm ? body : JSON.stringify(body),
    signal: handlers.signal,
  });

  if (!response.ok) throw new Error(await readFunctionError(response, fallbackError));

  const blob = await response.blob();
  if (!blob.size) throw new Error('The audio service returned an empty clip');
  return blob;
}

/** Call an audio function that answers with JSON. */
async function callAudioJson<T>(
  fn: string,
  body: Record<string, unknown> | FormData,
  handlers: GenerationHandlers,
  fallbackError: string,
): Promise<T> {
  const isForm = body instanceof FormData;
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      ...(await functionHeaders()),
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
    },
    body: isForm ? body : JSON.stringify(body),
    signal: handlers.signal,
  });

  if (!response.ok) throw new Error(await readFunctionError(response, fallbackError));
  return (await response.json()) as T;
}

const DUB_POLL_MS = 8_000;
/**
 * Dubbing is minutes, not seconds, and is charged for up front — so the
 * deadline is generous. Giving up here does not cancel the dub: the ticket is
 * persisted, so Reconnect collects it afterwards rather than charging twice.
 */
const DUB_TIMEOUT_MS = 20 * 60 * 1000;

/**
 * Wait for a dub, then fetch it. Resolves to an object URL, matching the video
 * and mesh pollers so the store can treat all three the same way.
 */
export async function pollDub(ticket: RenderTicket, handlers: GenerationHandlers = {}): Promise<string> {
  const started = ticket.startedAt || Date.now();
  // The provider's language code rides along on the ticket: collecting the
  // audio needs it, and a resumed poll has nothing else to read it from.
  const targetLang = ticket.provider || 'en';
  let consecutiveErrors = 0;

  for (;;) {
    throwIfAborted(handlers.signal);
    if (Date.now() - started > DUB_TIMEOUT_MS) {
      throw new Error('The dub is taking longer than expected. Reconnect to collect it.');
    }

    await sleep(DUB_POLL_MS, handlers.signal);

    let status: { status?: string; error?: string | null };
    try {
      status = await callAudioJson<{ status?: string; error?: string | null }>(
        'elevenlabs-dub',
        { action: 'status', dubbingId: ticket.predictionId },
        handlers,
        'Could not read the dub status',
      );
      consecutiveErrors = 0;
    } catch (e) {
      if (isAborted(e)) throw e;
      // A blip must not throw away a dub that has been paid for.
      consecutiveErrors += 1;
      if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) throw e;
      continue;
    }

    if (status.status === 'failed') {
      throw new Error(status.error || 'The dub failed at the provider.');
    }
    if (status.status !== 'dubbed') {
      handlers.onStage?.('Dubbing');
      continue;
    }

    handlers.onStage?.('Collecting the dub');
    const blob = await callAudioFunction(
      'elevenlabs-dub',
      { action: 'result', dubbingId: ticket.predictionId, targetLang },
      handlers,
      'Could not fetch the dubbed audio',
    );
    return URL.createObjectURL(blob);
  }
}

/**
 * Run any audio task and resolve to whatever it produces.
 *
 * The paid tasks (music, voice changer, dubbing) are called only after the DHB
 * paywall has settled, exactly like image, video and 3D — payment is not
 * handled anywhere in this module.
 */
export async function runAudioTask(
  req: AudioRequest,
  handlers: GenerationHandlers = {},
): Promise<AudioTaskResult> {
  throwIfAborted(handlers.signal);

  switch (req.task) {
    case 'dialogue': {
      handlers.onStage?.('Performing the scene');
      const blob = await callAudioFunction(
        'elevenlabs-dialogue',
        {
          inputs: req.inputs,
          outputFormat: req.outputFormat,
          seed: req.seed,
          voiceSettings: req.voiceSettings,
        },
        handlers,
        'Dialogue generation failed',
      );
      return { url: URL.createObjectURL(blob) };
    }

    case 'sfx': {
      handlers.onStage?.('Designing the sound');
      const blob = await callAudioFunction(
        'elevenlabs-sound-effects',
        {
          text: req.text,
          durationSeconds: req.durationSeconds,
          promptInfluence: req.promptInfluence,
          loop: req.loop,
          outputFormat: req.outputFormat,
        },
        handlers,
        'Sound effect generation failed',
      );
      return { url: URL.createObjectURL(blob) };
    }

    case 'music': {
      handlers.onStage?.('Composing');
      const blob = await callAudioFunction(
        'elevenlabs-music',
        {
          prompt: req.prompt,
          lengthSeconds: req.lengthSeconds,
          instrumental: req.instrumental,
          outputFormat: req.outputFormat,
        },
        handlers,
        'Music generation failed',
      );
      return { url: URL.createObjectURL(blob) };
    }

    case 'voice-changer': {
      handlers.onStage?.('Re-performing the take');
      const form = new FormData();
      form.append('file', req.file, req.file.name || 'input.mp3');
      form.append('voiceId', req.voiceId);
      if (req.removeNoise === false) form.append('removeNoise', 'false');
      if (req.outputFormat) form.append('outputFormat', req.outputFormat);
      if (req.voiceSettings?.stability !== undefined) {
        form.append('stability', String(req.voiceSettings.stability));
      }
      if (req.voiceSettings?.similarity !== undefined) {
        form.append('similarity', String(req.voiceSettings.similarity));
      }
      if (req.voiceSettings?.style !== undefined) {
        form.append('style', String(req.voiceSettings.style));
      }
      if (req.voiceSettings?.speakerBoost === false) form.append('speakerBoost', 'false');

      const blob = await callAudioFunction(
        'elevenlabs-voice-changer',
        form,
        handlers,
        'Voice conversion failed',
      );
      return { url: URL.createObjectURL(blob) };
    }

    case 'isolate': {
      handlers.onStage?.('Cleaning the recording');
      const form = new FormData();
      form.append('file', req.file, req.file.name || 'input.mp3');
      if (req.outputFormat) form.append('outputFormat', req.outputFormat);
      const blob = await callAudioFunction(
        'elevenlabs-audio-isolation',
        form,
        handlers,
        'Could not clean that recording',
      );
      return { url: URL.createObjectURL(blob) };
    }

    case 'transcribe': {
      handlers.onStage?.('Transcribing');
      const form = new FormData();
      form.append('file', req.file, req.file.name || 'input.mp3');
      if (req.diarize === false) form.append('diarize', 'false');
      if (req.languageCode) form.append('languageCode', req.languageCode);

      const data = await callAudioJson<{
        text?: string;
        segments?: { speaker: string | null; text: string; start: number | null }[];
      }>('elevenlabs-transcribe', form, handlers, 'Transcription failed');

      const transcript = (data.text ?? '').trim();
      if (!transcript) throw new Error('No speech was found in that recording.');
      return { transcript, segments: data.segments ?? [] };
    }

    case 'dubbing': {
      handlers.onStage?.('Uploading');
      const form = new FormData();
      form.append('file', req.file, req.file.name || 'input.mp4');
      form.append('targetLang', req.targetLang);
      if (req.sourceLang) form.append('sourceLang', req.sourceLang);
      if (req.numSpeakers) form.append('numSpeakers', String(req.numSpeakers));

      const started = await callAudioJson<{ dubbingId?: string }>(
        'elevenlabs-dub',
        form,
        handlers,
        'Could not start the dub',
      );
      if (!started.dubbingId) throw new Error('The dubbing service did not return a job id');

      // Hand the ticket back before any polling, so a reload can rejoin a dub
      // that has already been charged for. `provider` carries the target
      // language, which collecting the audio needs.
      const ticket: RenderTicket = {
        predictionId: started.dubbingId,
        provider: req.targetLang,
        startedAt: Date.now(),
      };
      handlers.onQueued?.(ticket);
      handlers.onStage?.('Dubbing');

      return { url: await pollDub(ticket, handlers) };
    }

    default: {
      const { blob } = await generateAudio(req as SpeechRequest, handlers);
      return { url: URL.createObjectURL(blob) };
    }
  }
}

/**
 * Voice design. Returns three takes as playable object URLs, none of which
 * exist at the provider until one is saved.
 */
export interface DesignedVoicePreview {
  generatedVoiceId: string;
  url: string;
  durationSecs: number | null;
}

export async function designVoice(
  description: string,
  previewText?: string,
): Promise<DesignedVoicePreview[]> {
  const data = await callAudioJson<{
    previews?: { generatedVoiceId?: string; audioBase64?: string; mediaType?: string; durationSecs?: number | null }[];
  }>(
    'elevenlabs-voice-design',
    { description, previewText },
    {},
    'Voice design failed',
  );

  return (data.previews ?? [])
    .filter((p) => p.generatedVoiceId && p.audioBase64)
    .map((p) => ({
      generatedVoiceId: p.generatedVoiceId as string,
      url: base64ToObjectUrl(p.audioBase64 as string, p.mediaType || 'audio/mpeg'),
      durationSecs: p.durationSecs ?? null,
    }));
}

/** Keep a designed take as a real voice on the account. */
export async function saveDesignedVoice(
  generatedVoiceId: string,
  name: string,
  description?: string,
): Promise<{ voiceId: string; name: string }> {
  return callAudioJson<{ voiceId: string; name: string }>(
    'elevenlabs-voice-design',
    { action: 'save', generatedVoiceId, name, description },
    {},
    'Could not save that voice',
  );
}

/**
 * Base64 to a playable URL.
 *
 * Decoded to bytes rather than handed straight to <audio> as a data: URI: a
 * ten-second preview is a couple of hundred kilobytes of base64, and three of
 * them inline is enough string to make the composer stutter while it re-renders.
 */
function base64ToObjectUrl(base64: string, mediaType: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mediaType }));
}

/**
 * Prompt assist. Expands a terse idea into a fuller generation prompt, keeping
 * the creator's subject and only adding craft detail. Returns the original text
 * unchanged if the service is unavailable, so the button can never destroy what
 * someone typed.
 */
export async function enhancePrompt(
  text: string,
  kind: 'image' | 'video' | '3d' | 'audio',
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  // '3d' and 'audio' both ride the image mode: the edge function only knows the
  // two, and a mesh prompt, a sound-effect brief and a music brief all want the
  // same subject-and-texture detail a still does, not the camera-move language
  // the video mode adds. Sending an unknown mode would fall through to plain
  // spellcheck and lose the assist entirely.
  const { data, error } = await supabase.functions.invoke('enhance-text', {
    body: { text: trimmed, mode: kind === 'video' ? 'prompt-video' : 'prompt-image' },
  });

  if (error) throw new Error(await describeInvokeError(error, 'Could not enhance that prompt'));
  const enhanced = (data as { enhancedText?: string; error?: string } | null)?.enhancedText;
  if ((data as { error?: string } | null)?.error) {
    throw new Error(String((data as { error: string }).error));
  }
  return enhanced?.trim() || trimmed;
}

/**
 * Fetch a generated asset as a File so it can be imported into the editor.
 * Handles both remote URLs and data URLs.
 */
export async function assetToFile(url: string, filename: string, mime: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download the asset (${res.status})`);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || mime });
}
