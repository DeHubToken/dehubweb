import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Shorts video audio ownership', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/components/app/cards/VideoSlide.tsx'),
    'utf8',
  );

  it('pauses ordinary slides during cleanup, preserves PiP, and rejects stale play events', () => {
    expect(source).toMatch(/return \(\) => \{\s*clearTimeout\(timer\);[\s\S]*?releaseAfterPictureInPicture\(video, \(\) => video\.pause\(\)\);\s*\};/);
    expect(source).toContain('if (!isActiveRef.current && !isVideoInPictureInPicture(videoRef.current)) videoRef.current?.pause();');
    expect(source).toContain('onPlay={handlePlay}');
  });
});
