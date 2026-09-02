import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A view is one watch, and a wrap is not a watch.
 *
 * Re-arming on a jump back to zero is deliberate — pressing play again on a
 * video should count again. But a `<video loop>` wraps on its own with nobody
 * deciding anything, and shorts loop. Every wrap read as a replay, and the
 * API's 30-second per-viewer limit turned that into a view every 30 seconds for
 * as long as the tab stayed open: a phone left on a desk manufacturing views.
 */

const fetchMock = vi.fn(async () => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, isNewView: true, views: 1, totalImpressions: 1 }),
}));
vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

vi.mock('@/lib/api/dehub', () => ({ getAuthToken: () => 'test-token' }));
vi.mock('@/lib/anon-views-api', () => ({
  recordAnonViews: vi.fn(async () => ({ success: true, submitted: 1, recorded: 1 })),
  recordAnonViewsBeacon: vi.fn(),
}));

const DURATION = 12;

/** Watch past the threshold, then wrap back to the start. */
function watchThenWrap(
  tracker: { updateProgress: (id: string, t: number, d: number, loops?: boolean) => void },
  id: string,
  loops: boolean,
) {
  tracker.updateProgress(id, 4, DURATION, loops);
  tracker.updateProgress(id, 8, DURATION, loops);
  tracker.updateProgress(id, 0.2, DURATION, loops);
}

describe('video view counting', () => {
  let videoViewTracker: any;

  beforeEach(async () => {
    fetchMock.mockClear();
    vi.resetModules();
    ({ videoViewTracker } = await import('@/lib/view-tracker'));
  });

  it('counts one view for a looping short however long it runs', () => {
    for (let lap = 0; lap < 5; lap++) watchThenWrap(videoViewTracker, '1', true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still counts a replay of a video that does not loop', () => {
    watchThenWrap(videoViewTracker, '2', false);
    videoViewTracker.updateProgress('2', 5, DURATION, false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('counts again for a looping short after it is remounted', () => {
    watchThenWrap(videoViewTracker, '3', true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Leaving and coming back is a fresh mount, which resets on unmount.
    videoViewTracker.reset('3');
    videoViewTracker.updateProgress('3', 4, DURATION, true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not count a watch that never reaches the threshold', () => {
    videoViewTracker.updateProgress('4', 1, DURATION, true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
