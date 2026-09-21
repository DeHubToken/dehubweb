/**
 * Going live from the composer must offer the encoder, not just the camera.
 *
 * The OBS / Encoder card has existed on the Go Live sheet the whole time, but
 * for a while nothing a creator could find opened the step it lives on. The
 * composer became the live setup form, and it hands the sheet a stream that is
 * already provisioned — which opens the broadcast console and skips the source
 * cards entirely. The only other callers were a stories bar that has since
 * been removed and a right-rail button that is desktop-only, not on the default tab,
 * and rendered only while nobody is live.
 *
 * The result was a creator with a capture card filing a request for OBS
 * support, being told to pick the third card, and replying that there was no
 * third button. He was right: on his route there were two, a camera and a
 * microphone.
 *
 * These are source assertions rather than a render, because the failure was
 * never a broken component — every piece worked, nothing linked to it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const ACTION_BAR = 'src/features/post/components/PostActionBar.tsx';
const GO_LIVE = 'src/components/app/modals/GoLiveModal.tsx';

describe('the composer live menu', () => {
  const src = read(ACTION_BAR);

  it('offers the encoder alongside the camera and the stage', () => {
    expect(src).toContain("t('goLive.sourceCamera')");
    expect(src).toContain("t('stages.title')");
    expect(src).toContain("t('goLive.sourceEncoder')");
  });

  it('labels every entry, rather than leaving bare glyphs to be guessed at', () => {
    // A title attribute never appears on a touch device, which is where the
    // menu was read as "webcam and microphone" in the first place.
    for (const key of ['goLive.sourceCamera', 'stages.title', 'goLive.sourceEncoder']) {
      expect(src, `${key} should render as visible text`).toContain(`<span className="text-sm text-white">{t('${key}')}</span>`);
    }
  });

  it('opens the sheet on the encoder card instead of provisioning a camera stream', () => {
    // Not a LiveMode: an encoder stream ends in a key handed back, and the
    // composer has no field for that.
    expect(src).toMatch(/initialSource: 'rtmp'/);
    expect(src).toMatch(/isOpen=\{!!liveStream \|\| encoderSetup\}/);
  });
});

describe('the Go Live sheet', () => {
  const src = read(GO_LIVE);

  it('accepts the source its caller picked', () => {
    expect(src).toContain('initialSource?: StreamSource;');
    expect(src).toContain("useState<StreamSource>(initialSource ?? 'camera')");
  });

  it('reapplies it on every open, not just the first', () => {
    // The sheet is mounted once and reopened, so a state initialiser alone
    // would send the second visit to the camera.
    expect(src).toContain('setSource(initialSource);');
  });

  it('still renders the encoder card on the setup step', () => {
    expect(src).toContain("onClick={() => setSource('rtmp')}");
    expect(src).toContain("t('goLive.sourceEncoder')");
  });
});
