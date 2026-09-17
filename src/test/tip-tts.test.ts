import { describe, it, expect } from 'vitest';
import { sanitiseTtsText, MAX_TTS_CHARS } from '@/lib/live/tip-tts';

describe('sanitiseTtsText', () => {
  it('keeps an ordinary message intact', () => {
    expect(sanitiseTtsText('Big papa says hello, stream!')).toBe('Big papa says hello, stream!');
  });

  it('drops links rather than spelling them out', () => {
    // eSpeak reads a URL character by character, so one link is half a minute
    // of "aitch tee tee pee colon slash slash".
    expect(sanitiseTtsText('check https://dehub.io/app now')).toBe('check now');
  });

  it('collapses punctuation spam that would stall the synthesiser', () => {
    expect(sanitiseTtsText('hello!!!!!!!!!! there')).toBe('hello! there');
  });

  it('strips control characters', () => {
    const withControls = 'hi' + String.fromCharCode(7) + String.fromCharCode(0) + 'there';
    expect(sanitiseTtsText(withControls)).toBe('hi there');
  });

  it('caps length so one tip cannot hold the stream audio', () => {
    const long = 'word '.repeat(200);
    expect(sanitiseTtsText(long).length).toBeLessThanOrEqual(MAX_TTS_CHARS);
  });

  it('returns empty for nothing worth speaking', () => {
    expect(sanitiseTtsText('')).toBe('');
    expect(sanitiseTtsText(null)).toBe('');
    expect(sanitiseTtsText(undefined)).toBe('');
    // A message that was only a link has nothing left after sanitising, and
    // must not queue a silent reading.
    expect(sanitiseTtsText('https://example.com')).toBe('');
    expect(sanitiseTtsText('   ')).toBe('');
  });

  it('keeps letters from non-Latin scripts', () => {
    // The cap and the strip are about control characters and links, not about
    // which alphabet somebody types in.
    expect(sanitiseTtsText('привет мир')).toBe('привет мир');
    expect(sanitiseTtsText('こんにちは')).toBe('こんにちは');
  });
});
