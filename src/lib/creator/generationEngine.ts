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

export type GenerationKind = 'image' | 'video' | 'audio';

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

export interface AudioRequest {
  text: string;
  voiceId: string;
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

/** Text to image, or image plus instruction to edited image. Resolves to a URL. */
export async function generateImage(
  req: ImageRequest,
  handlers: GenerationHandlers = {},
): Promise<string> {
  throwIfAborted(handlers.signal);
  handlers.onStage?.(req.sourceImage ? 'Applying the edit' : 'Painting the frame');

  const res = await supabase.functions.invoke('generate-image', {
    body: {
      prompt: req.prompt,
      model: req.model,
      ...(req.sourceImage ? { sourceImage: req.sourceImage } : {}),
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

  const start = await supabase.functions.invoke('generate-video', {
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
 * Data URLs above this go to storage before being sent to generate-video.
 * The Gemini image models return their result as base64, so "Animate this" on a
 * generated still would otherwise post a multi-megabyte JSON body to the edge
 * function on every render.
 */
const MAX_INLINE_SOURCE_IMAGE_CHARS = 200_000;

/** Upload a data URL to the shared AI bucket and return its public URL. */
async function hostDataUrl(dataUrl: string): Promise<string> {
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

/**
 * Poll an already-queued render to completion. Split out of generateVideo so a
 * reload can rejoin a render that is still running rather than abandoning
 * something the creator has already paid for.
 */
export async function pollVideo(
  ticket: RenderTicket,
  handlers: GenerationHandlers = {},
): Promise<string> {
  throwIfAborted(handlers.signal);

  const began = ticket.startedAt || Date.now();
  handlers.onStage?.('Rendering');

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

    const poll = await supabase.functions.invoke('generate-video', {
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
    const status = poll.data as { status?: string; videoUrl?: string; error?: string } | null;

    if (status?.status === 'failed') throw new Error(status.error || 'The render failed');
    if (status?.status === 'succeeded') {
      if (status.videoUrl) return status.videoUrl;
      // Terminal but unreadable: the provider used an output shape the status
      // handler does not map. Fail now rather than polling a finished job for
      // the rest of the timeout.
      throw new Error('The render finished but returned no playable video.');
    }

    // Ease off as the wait grows; most renders land in the first minute or two.
    const elapsed = Math.round((Date.now() - began) / 1000);
    if (elapsed > 60) interval = VIDEO_POLL_MAX_MS;
    handlers.onStage?.(`Rendering (${elapsed}s)`);
  }

  throw new Error('The render timed out. It may still finish at the provider.');
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
  req: AudioRequest,
  handlers: GenerationHandlers = {},
): Promise<{ blob: Blob }> {
  throwIfAborted(handlers.signal);
  handlers.onStage?.('Synthesising the voice');

  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token ?? SUPABASE_ANON_KEY;

  const response = await fetch(`${SUPABASE_URL}/functions/v1/elevenlabs-tts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text: req.text, voiceId: req.voiceId || DEFAULT_VOICE_ID }),
    signal: handlers.signal,
  });

  if (!response.ok) {
    let message = `Voice generation failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  if (!blob.size) throw new Error('The voice service returned an empty clip');

  throwIfAborted(handlers.signal);
  return { blob };
}

/**
 * Prompt assist. Expands a terse idea into a fuller generation prompt, keeping
 * the creator's subject and only adding craft detail. Returns the original text
 * unchanged if the service is unavailable, so the button can never destroy what
 * someone typed.
 */
export async function enhancePrompt(text: string, kind: 'image' | 'video'): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

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
