import { describe, it, expect } from 'vitest';
import {
  encodingForTrack,
  isCaptureCardDevice,
  resolveCaptureCardChoice,
  type CaptureCardChoice,
} from './capture-card';

const dev = (kind: MediaDeviceKind, deviceId: string, label: string, groupId = ''): MediaDeviceInfo =>
  ({ kind, deviceId, label, groupId, toJSON: () => ({}) }) as MediaDeviceInfo;

const blank: CaptureCardChoice = { videoId: '', audioId: '', micId: '', quality: 'auto' };

describe('capture card detection', () => {
  it('recognises common cards and not a laptop webcam', () => {
    for (const label of ['Elgato Game Capture HD60 X', 'Cam Link 4K', 'AVerMedia Live Gamer ULTRA', 'USB Video', 'Blackmagic Design', 'ATEM Mini Pro']) {
      expect(isCaptureCardDevice({ label }), label).toBe(true);
    }
    expect(isCaptureCardDevice({ label: 'FaceTime HD Camera' })).toBe(false);
    expect(isCaptureCardDevice({ label: 'Integrated Webcam' })).toBe(false);
  });

  it('picks the card over the webcam, with the audio from the same device', () => {
    const devices = [
      dev('videoinput', 'cam', 'Integrated Webcam', 'g1'),
      dev('videoinput', 'card', 'Elgato HD60 X', 'g2'),
      dev('audioinput', 'default', 'Default'),
      dev('audioinput', 'laptop-mic', 'Microphone Array', 'g1'),
      dev('audioinput', 'card-audio', 'Digital Audio Interface', 'g2'),
    ];
    const choice = resolveCaptureCardChoice(devices, blank);
    expect(choice.videoId).toBe('card');
    expect(choice.audioId).toBe('card-audio');
    expect(choice.micId).toBe('');
  });

  it('keeps a saved choice that is still plugged in, drops one that is gone', () => {
    const devices = [
      dev('videoinput', 'cam', 'Integrated Webcam'),
      dev('audioinput', 'mic', 'Microphone'),
    ];
    expect(resolveCaptureCardChoice(devices, { ...blank, videoId: 'cam', micId: 'mic' })).toMatchObject({ videoId: 'cam', micId: 'mic' });
    expect(resolveCaptureCardChoice(devices, { ...blank, videoId: 'unplugged' }).videoId).toBe('');
  });
});

describe('bitrate from what the card delivered', () => {
  const track = (width: number, height: number, frameRate: number) =>
    ({ getSettings: () => ({ width, height, frameRate }) }) as unknown as MediaStreamTrack;

  it('scales with resolution and frame rate', () => {
    expect(encodingForTrack(track(1920, 1080, 60)).maxBitrateKbps).toBe(6000);
    expect(encodingForTrack(track(1920, 1080, 30)).maxBitrateKbps).toBe(4500);
    expect(encodingForTrack(track(1280, 720, 30)).maxBitrateKbps).toBe(3000);
  });
});
