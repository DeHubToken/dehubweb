import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, '../components/app/cards/LiveStreamCard.tsx'), 'utf8');

describe('live post HLS startup', () => {
  it('starts the live element muted and requests playback when media arrives', () => {
    const liveVideo = source.match(/<video\s+ref=\{videoRef\}[\s\S]*?\/>/)?.[0];
    expect(liveVideo).toBeDefined();
    expect(liveVideo).toMatch(/\bautoPlay\b/);
    expect(liveVideo).toContain('muted={isMuted}');
    expect(source).toContain('const [isMuted, setIsMuted] = useState(true)');
  });

  it('keeps a visible manual start when autoplay is blocked', () => {
    expect(source).toContain("isPlaying ? 'opacity-0 hover:opacity-100 focus-within:opacity-100' : 'opacity-100'");
    expect(source).toContain("aria-label={isPlaying ? t('audioPost.pause', 'Pause') : t('audioPost.play', 'Play')}");
    expect(source).not.toContain('setIsPlaying(!isPlaying)');
  });
});
