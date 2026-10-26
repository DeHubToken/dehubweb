import { describe, expect, it } from 'vitest';
import { audioResultIssue, MAX_AUDIO_RESULT_BYTES } from '../lib/creator/audioResult';

describe('Creator binary audio result contract', () => {
  it('accepts the deployed MP3 and WAV response types', () => {
    expect(audioResultIssue('audio/mpeg', 123)).toBeNull();
    expect(audioResultIssue('audio/wav; charset=binary', 123)).toBeNull();
    // Maximum 300-second music at 44.1kHz, even allowing 32-bit stereo PCM.
    expect(audioResultIssue('audio/wav', 300 * 44100 * 4 * 2 + 44)).toBeNull();
  });
  it('rejects HTML/JSON errors and empty or oversized output', () => {
    expect(audioResultIssue('application/json', 123)).toBe('creator.audioInvalidResponse');
    expect(audioResultIssue('text/html', 123)).toBe('creator.audioInvalidResponse');
    expect(audioResultIssue('audio/mpeg', 0)).toBe('creator.audioResultTooLarge');
    expect(audioResultIssue('audio/mpeg', MAX_AUDIO_RESULT_BYTES + 1)).toBe('creator.audioResultTooLarge');
  });
});
