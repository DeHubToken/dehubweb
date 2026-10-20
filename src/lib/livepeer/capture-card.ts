/**
 * Capture card mode: going live straight from an HDMI capture card, no OBS.
 *
 * A USB capture card (Elgato HD60 X, Cam Link, AVerMedia Live Gamer, Magewell,
 * an ATEM Mini…) reaches the browser as an ordinary webcam plus an ordinary
 * microphone; the HDMI or DisplayPort side is the card's business. So nothing
 * here is special hardware access. It is three things the camera path does not
 * do: pick a SPECIFIC device rather than "the front camera", ask for game
 * quality (up to 1080p60), and give the encoder enough bitrate to keep up.
 *
 * Choices are remembered per browser, because a capture rig is set up once
 * and then streamed from every night.
 */

import type { VideoEncoding } from './whip';

/** Device names that are a capture card (or an HDMI dongle), not a face cam. */
export const CAPTURE_CARD_LABEL =
  /capture|cam ?link|elgato|avermedia|live gamer|magewell|blackmagic|decklink|atem|web presenter|hdmi|usb ?video|game ?capture|hd60|4k60|ezcap|ripsaw/i;

export type CaptureQuality = 'auto' | '1080p60' | '1080p30' | '720p30';

export const CAPTURE_QUALITIES: CaptureQuality[] = ['auto', '1080p60', '1080p30', '720p30'];

const QUALITY_SIZES: Record<Exclude<CaptureQuality, 'auto'>, { width: number; height: number; fps: number }> = {
  '1080p60': { width: 1920, height: 1080, fps: 60 },
  '1080p30': { width: 1920, height: 1080, fps: 30 },
  '720p30': { width: 1280, height: 720, fps: 30 },
};

export interface CaptureCardChoice {
  videoId: string;
  /** The card's own audio. Empty for none. */
  audioId: string;
  /** A separate microphone to talk over the game. Empty for off. */
  micId: string;
  quality: CaptureQuality;
}

const STORAGE_KEY = 'dehub.captureCard';

const EMPTY: CaptureCardChoice = { videoId: '', audioId: '', micId: '', quality: 'auto' };

export function readCaptureCardChoice(): CaptureCardChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<CaptureCardChoice>;
    return {
      videoId: typeof parsed.videoId === 'string' ? parsed.videoId : '',
      audioId: typeof parsed.audioId === 'string' ? parsed.audioId : '',
      micId: typeof parsed.micId === 'string' ? parsed.micId : '',
      quality: CAPTURE_QUALITIES.includes(parsed.quality as CaptureQuality)
        ? (parsed.quality as CaptureQuality)
        : 'auto',
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveCaptureCardChoice(choice: CaptureCardChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    /* private mode: the choice just isn't remembered */
  }
}

/**
 * The device list WITH names. Before any camera permission, browsers hand
 * back nameless placeholders, which is useless for finding the card, so the
 * first call asks once and lets go straight away.
 */
export async function listMediaDevices(): Promise<MediaDeviceInfo[]> {
  const md = navigator.mediaDevices;
  if (!md?.enumerateDevices) return [];
  let devices = await md.enumerateDevices();
  if (devices.some((d) => d.kind === 'videoinput' && d.label)) return devices;
  try {
    const probe = await md.getUserMedia({ video: true, audio: true }).catch(() =>
      md.getUserMedia({ video: true })
    );
    probe.getTracks().forEach((t) => t.stop());
    devices = await md.enumerateDevices();
  } catch {
    /* denied: the caller shows the permission copy */
  }
  return devices;
}

export function isCaptureCardDevice(device: Pick<MediaDeviceInfo, 'label'>): boolean {
  return CAPTURE_CARD_LABEL.test(device.label ?? '');
}

/**
 * Fills the blanks in a saved choice from what is plugged in now. A saved
 * device that has gone (card unplugged, ids reset by the browser) is dropped
 * rather than asked for, which would fail the whole capture.
 */
export function resolveCaptureCardChoice(
  devices: MediaDeviceInfo[],
  saved: CaptureCardChoice
): CaptureCardChoice {
  const videos = devices.filter((d) => d.kind === 'videoinput');
  const audios = devices.filter((d) => d.kind === 'audioinput');
  const has = (list: MediaDeviceInfo[], id: string) => !!id && list.some((d) => d.deviceId === id);

  const video = has(videos, saved.videoId)
    ? videos.find((d) => d.deviceId === saved.videoId)!
    : videos.find(isCaptureCardDevice) ?? null;

  let audioId = saved.audioId;
  if (!has(audios, audioId)) {
    // The card's audio shares its groupId with the card's video on every
    // browser that reports groups; the name is the fallback.
    const sameGroup = video?.groupId
      ? audios.find((d) => d.groupId === video.groupId && d.deviceId !== 'default')
      : undefined;
    audioId = (sameGroup ?? audios.find((d) => isCaptureCardDevice(d) && d.deviceId !== 'default'))
      ?.deviceId ?? '';
  }

  return {
    videoId: video?.deviceId ?? '',
    audioId,
    micId: has(audios, saved.micId) && saved.micId !== audioId ? saved.micId : '',
    quality: saved.quality,
  };
}

export function captureVideoConstraints(
  videoId: string,
  quality: CaptureQuality
): MediaTrackConstraints {
  const size = quality === 'auto' ? QUALITY_SIZES['1080p60'] : QUALITY_SIZES[quality];
  return {
    deviceId: { exact: videoId },
    width: { ideal: size.width },
    height: { ideal: size.height },
    frameRate: { ideal: size.fps },
  };
}

/**
 * Raw line-level audio: the voice processing a mic gets (noise gate, gain
 * pumping, echo cancelling) chews up game audio and music.
 */
export function captureAudioConstraints(audioId: string): MediaTrackConstraints {
  return {
    deviceId: { exact: audioId },
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: { ideal: 2 },
  };
}

/**
 * Encoder ceiling from what the card actually delivered, not what was asked
 * for: a card that can only do 1080p30 asked for 60 still needs the 30 rate.
 */
export function encodingForTrack(track: MediaStreamTrack): VideoEncoding {
  const s = track.getSettings?.() ?? {};
  const height = Math.min(s.height ?? 720, s.width ?? 1280);
  const fps = s.frameRate ?? 30;
  if (height >= 1000 && fps >= 50) return { maxBitrateKbps: 6000, maxFramerate: 60 };
  if (height >= 1000) return { maxBitrateKbps: 4500, maxFramerate: 30 };
  if (fps >= 50) return { maxBitrateKbps: 4500, maxFramerate: 60 };
  return { maxBitrateKbps: 3000, maxFramerate: 30 };
}

/** Thrown when capture card mode starts and no card can be found. */
export class NoCaptureCardError extends Error {
  constructor() {
    super('No capture card found. Plug it in, close OBS or Elgato Studio, then try again.');
    this.name = 'NoCaptureCardError';
  }
}

export interface OpenedCaptureCard {
  stream: MediaStream;
  video: MediaStreamTrack;
  audio: MediaStreamTrack | null;
  choice: CaptureCardChoice;
}

/** Opens the saved card (or the first one found) for broadcasting. */
export async function openCaptureCard(): Promise<OpenedCaptureCard> {
  const devices = await listMediaDevices();
  const choice = resolveCaptureCardChoice(devices, readCaptureCardChoice());
  if (!choice.videoId) throw new NoCaptureCardError();

  const md = navigator.mediaDevices;
  const videoStream = await md.getUserMedia({
    video: captureVideoConstraints(choice.videoId, choice.quality),
    audio: false,
  });
  const video = videoStream.getVideoTracks()[0];
  try {
    // Tells the encoder to keep frames and shed sharpness under pressure,
    // which is what a game wants.
    video.contentHint = 'motion';
  } catch {
    /* read-only on older engines */
  }

  let audio: MediaStreamTrack | null = null;
  if (choice.audioId) {
    audio = await md
      .getUserMedia({ audio: captureAudioConstraints(choice.audioId), video: false })
      .then((s) => s.getAudioTracks()[0] ?? null)
      .catch(() => null);
    if (audio) {
      try {
        audio.contentHint = 'music';
      } catch {
        /* read-only on older engines */
      }
    }
  }

  const stream = new MediaStream([video, ...(audio ? [audio] : [])]);
  return { stream, video, audio, choice };
}
