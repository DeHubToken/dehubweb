import { describe, expect, it } from 'vitest';
import { createWheelPager, type WheelPagerOptions } from '@/lib/wheel-pager';

/**
 * The same real Windows trackpad capture the old wheel-gesture test replays
 * (`time:deltaY`, ms and CSS px): four physical swipes, the later ones
 * overlapping with no quiet gap between them.
 */
const CAPTURE =
  '0:2 16:163 51:186 79:0 117:261 132:214 162:186 251:149 329:239 363:339 411:60 437:131 451:62 ' +
  '489:22 531:70 548:49 563:27 590:30 610:46 624:22 637:22 653:21 850:21 869:193 883:12 912:12 ' +
  '921:18 933:4 950:11 967:10 983:10 1237:9 1250:83 1352:190 1365:0 1378:654 1397:90 1490:69 ' +
  '1506:371 1520:56 1598:43 1609:209 1625:36 1643:34 1660:33 1680:32 1698:32 1721:34 1738:29 ' +
  '1753:28 1772:19 1790:23 1809:24 1828:22 1844:22 1861:21 1879:21 1895:19 1910:21 1925:19 ' +
  '1940:16 1957:17 1973:17 1991:16 2008:14 2020:14 2037:14 2063:13 2075:13 2085:12 2110:11 ' +
  '2128:18 2143:6 2157:10 2189:42 2203:260 2219:300 2235:0 2252:186 2270:144 2286:110 2303:106 ' +
  '2320:103 2337:99 2354:96 2370:92 2384:89 2400:87 2419:83 2433:88 2449:73 2467:76 2483:74 ' +
  '2500:72 2516:69 2533:68 2550:67 2566:63 2583:63 2607:59 2616:59 2633:58 2649:56 2667:53 ' +
  '2683:53 2700:51 2718:49 2733:50 2750:47 2767:46 2783:44 2800:44 2817:41 2833:41 2850:40 ' +
  '2867:39 2883:39 2917:116 2934:102 2950:132 2966:173 2984:0 3000:151 3018:133 3033:114 ' +
  '3050:107 3067:101 3083:100 3100:92 3117:91 3134:87 3150:83 3167:80 3183:81 3202:73';

const TRACE: Array<[number, number]> = CAPTURE.trim().split(/\s+/).map(pair => {
  const [t, d] = pair.split(':').map(Number);
  return [t, d];
});
const ONE_SWIPE = TRACE.filter(([t]) => t <= 983);
const H = 900;

function run(events: Array<[number, number]>, options: WheelPagerOptions = {}, extra: { wheelDeltaY?: number; deltaMode?: number } = {}) {
  const pager = createWheelPager(options);
  const steps: Array<[number, string]> = [];
  const offsets: number[] = [];
  for (const [t, d] of events) {
    const r = pager.read({ deltaY: d, timeStamp: t, ...extra }, H, true, true);
    if (r.step) steps.push([t, r.step]);
    if (r.offset !== null) offsets.push(r.offset);
  }
  return { steps, offsets, pager };
}

describe('createWheelPager', () => {
  it('moves exactly one short for one physical swipe, inertia tail included', () => {
    expect(run(ONE_SWIPE).steps).toHaveLength(1);
  });

  it('takes one short per swipe across overlapping swipes', () => {
    const { steps } = run(TRACE);
    expect(steps.map(([, s]) => s)).toEqual(['next', 'next', 'next', 'next']);
    // One step inside each physical swipe.
    const [a, b, c, d] = steps.map(([t]) => t);
    expect(a).toBeLessThan(983);
    expect(b).toBeGreaterThanOrEqual(1237);
    expect(b).toBeLessThan(2189);
    expect(c).toBeGreaterThanOrEqual(2189);
    expect(c).toBeLessThan(2917);
    expect(d).toBeGreaterThanOrEqual(2917);
  });

  it('holds one step per swipe whatever the tuning', () => {
    for (const surgeFactor of [2.2, 2.5, 3]) {
      expect(run(ONE_SWIPE, { surgeFactor }).steps).toHaveLength(1);
      expect(run(TRACE, { surgeFactor }).steps.length).toBeGreaterThanOrEqual(3);
      expect(run(TRACE, { surgeFactor }).steps.length).toBeLessThanOrEqual(4);
    }
  });

  it('keeps a long, smooth inertia tail (macOS style) to one short', () => {
    // ~2s of decay after a hard swipe; the old rule's 1200ms run budget paged
    // a second short partway through this.
    const mac: Array<[number, number]> = [];
    for (let i = 0; i < 125; i++) mac.push([i * 16, Math.max(1, Math.round(i < 6 ? 20 + i * 15 : 95 * Math.exp(-(i - 6) / 30)))]);
    expect(run(mac).steps).toHaveLength(1);
  });

  it('follows a slow push and springs back when it stops short', () => {
    const slow = Array.from({ length: 12 }, (_, i): [number, number] => [i * 16, 8]);
    const { steps, offsets, pager } = run(slow);
    expect(steps).toEqual([]);
    expect(offsets[offsets.length - 1]).toBe(-96);
    expect(pager.settle()).toBe(true);
  });

  it('commits a slow push that covers a quarter of the frame', () => {
    const slow = Array.from({ length: 40 }, (_, i): [number, number] => [i * 16, 8]);
    expect(run(slow).steps).toEqual([[16 * 27, 'next']]);
  });

  it('commits a quick flick early', () => {
    expect(run([[0, 40], [10, 50]]).steps).toEqual([[10, 'next']]);
  });

  it('follows back up when the push reverses', () => {
    const { steps, offsets } = run([[0, 8], [16, 8], [32, 8], [48, -8], [64, -8]]);
    expect(steps).toEqual([]);
    expect(offsets).toEqual([-8, -16, -24, -16, -8]);
  });

  it('pages a notched mouse wheel once per notch, one per transition', () => {
    const notches: Array<[number, number]> = [[0, 100], [40, 100], [80, 100], [500, 100], [900, -100]];
    expect(run(notches, {}, { wheelDeltaY: -120 }).steps).toEqual([[0, 'next'], [500, 'next'], [900, 'prev']]);
  });

  it('treats -120 on every event as a trackpad when the pixel deltas wander', () => {
    // Headless Chrome (and some touchpads) report wheelDeltaY -120 throughout.
    expect(run(ONE_SWIPE, {}, { wheelDeltaY: -120 }).steps).toHaveLength(1);
    expect(run(TRACE, {}, { wheelDeltaY: -120 }).steps).toHaveLength(4);
  });

  it('pages a fast mouse spin once', () => {
    const spin = Array.from({ length: 6 }, (_, i): [number, number] => [i * 40, 100]);
    expect(run(spin, {}, { wheelDeltaY: -120 }).steps).toEqual([[0, 'next']]);
  });

  it('rubber bands at the end of the list instead of paging', () => {
    const pager = createWheelPager();
    let r = pager.read({ deltaY: 40, timeStamp: 0 }, H, false, true);
    for (let i = 1; i < 10; i++) r = pager.read({ deltaY: 40, timeStamp: i * 16 }, H, false, true);
    expect(r.step).toBeNull();
    expect(r.offset).toBe(-120);
    expect(pager.settle()).toBe(true);
  });
});
