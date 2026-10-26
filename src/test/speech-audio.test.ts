import { describe, expect, it } from 'vitest';
import { audioContainer, frameSpeechPcm, prepareSpeechAudio, speechProviderFormat } from '../../supabase/functions/_shared/speech-audio';

const mp3 = new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0, 0, 0, 255, 251, 144, 0]).buffer;
describe('verified speech audio export', () => {
  it('keeps valid default MP3 bytes unchanged', () => {
    expect(speechProviderFormat(undefined)).toBe('mp3_44100_128');
    expect(prepareSpeechAudio(mp3, undefined, 'audio/mpeg')).toEqual({ buffer: mp3, contentType: 'audio/mpeg', extension: 'mp3' });
  });
  it('frames only the requested documented mono S16LE PCM with correct RIFF fields', () => {
    for (const [format, rate] of [['wav_24000', 24000], ['pcm_44100', 44100]] as const) {
      const samples = new Int16Array([-32768, 0, 32767]);
      const result = prepareSpeechAudio(samples.buffer, format, 'audio/pcm');
      const header = new DataView(result.buffer);
      expect(result.contentType).toBe('audio/wav');
      expect(audioContainer(result.buffer)).toBe('wav');
      expect(header.getUint16(22, true)).toBe(1);
      expect(header.getUint32(24, true)).toBe(rate);
      expect(header.getUint32(28, true)).toBe(rate * 2);
      expect(header.getUint16(34, true)).toBe(16);
      expect(header.getUint32(40, true)).toBe(samples.byteLength);
      expect([...new Uint8Array(result.buffer, 44)]).toEqual([...new Uint8Array(samples.buffer)]);
      expect(prepareSpeechAudio(result.buffer, format, 'audio/wav').buffer).toBe(result.buffer);
    }
    expect(speechProviderFormat('wav_24000')).toBe('pcm_24000');
  });
  it('rejects mislabeled or truncated binary rather than treating it as WAV or MP3', () => {
    for (const bytes of [new TextEncoder().encode('{"error":"bad"}').buffer, new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0, 127, 127, 1, 2, 3, 4]).buffer]) {
      expect(audioContainer(bytes)).toBeNull();
      expect(() => prepareSpeechAudio(bytes, undefined, 'audio/mpeg')).toThrow('valid MP3');
    }
    expect(() => prepareSpeechAudio(mp3, 'wav_24000', 'audio/mpeg')).toThrow('requested PCM');
    expect(() => prepareSpeechAudio(new Uint8Array([0, 0]).buffer, 'wav_24000', 'audio/wav')).toThrow('requested PCM');
    expect(() => frameSpeechPcm(new Uint8Array([0]).buffer, 24000)).toThrow('Invalid PCM');
    const truncated = frameSpeechPcm(new Uint8Array([0, 0]).buffer, 24000).slice(0, 44);
    expect(audioContainer(truncated)).toBeNull();
  });
});
