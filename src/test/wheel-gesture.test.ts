import { describe, expect, it } from 'vitest';
import { createWheelGesture } from '@/lib/wheel-gesture';

/**
 * The fixture is a real capture, not a hand-written approximation: every wheel
 * event a Windows laptop trackpad delivered to the deployed shorts viewer
 * during ~3.2 seconds of ordinary two-finger swiping, as `time:deltaY` in ms
 * and CSS pixels.
 *
 * It is the whole point of this file. The rule it replaced looked correct and
 * behaved correctly against synthetic input; it failed on this stream, and only
 * on this stream, because real swipes overlap and real timers run late.
 *
 * Reported as "it flicks fine for one or two, then every scroll needs me to
 * move the mouse an inch first". During this capture the viewer advanced
 * exactly once.
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

/** The first physical swipe, which ends where the stream first goes quiet. */
const ONE_SWIPE = TRACE.filter(([t]) => t <= 983);

function stepsFrom(events: Array<[number, number]>, options = {}) {
  const gesture = createWheelGesture(options);
  const steps: Array<[number, string]> = [];
  for (const [t, d] of events) {
    const step = gesture.read(d, t);
    if (step) steps.push([t, step]);
  }
  return steps;
}

const evenly = (count: number, everyMs: number, delta: number) =>
  Array.from({ length: count }, (_, i): [number, number] => [i * everyMs, delta]);

describe('the captured stream itself', () => {
  it('spends a full second on a single swipe', () => {
    // 31 events for one flick, deltas peaking at 339 and trailing off to 10 as
    // the driver's inertia decays. Any rule that steps per event, or per 40px
    // of travel, walks a dozen videos on one swipe.
    expect(ONE_SWIPE).toHaveLength(31);
    expect(ONE_SWIPE[ONE_SWIPE.length - 1][0]).toBe(983);
  });

  it('never goes quiet again once the swipes start overlapping', () => {
    // This is what killed the previous rule. It released its lock from a 220ms
    // timer re-armed by every event, so it needed a real gap to open up AND the
    // timer to fire inside it. After the first swipe the longest gap in the
    // whole stream is 102ms — there is no silence to wait for, so the lock
    // never released and the feed sat dead.
    const after = TRACE.filter(([t]) => t >= 1237);
    const gaps = after.slice(1).map(([t], i) => t - after[i][0]);
    expect(Math.max(...gaps)).toBeLessThan(220);
  });
});

describe('createWheelGesture', () => {
  it('takes exactly one step for one physical swipe', () => {
    // The regression the previous rule existed to prevent, and it still holds:
    // a whole second of decaying inertia is one video, not two.
    expect(stepsFrom(ONE_SWIPE)).toEqual([[16, 'next']]);
  });

  it('keeps stepping while the swipes keep coming', () => {
    // The bug. The shipped rule managed one step across this entire capture;
    // the pointer had to be nudged to get anything more out of it.
    expect(stepsFrom(TRACE)).toEqual([
      [16, 'next'],
      [1250, 'next'],
      [2219, 'next'],
      [2966, 'next'],
    ]);
  });

  it('does not depend on the exact travel budget', () => {
    // The constants came off one device. If the result swung on them being
    // right, they would be a bug waiting for someone else's trackpad.
    for (const runDistance of [900, 1100, 1300, 1600]) {
      expect(stepsFrom(TRACE, { runDistance }).length).toBeGreaterThanOrEqual(3);
      expect(stepsFrom(ONE_SWIPE, { runDistance })).toHaveLength(1);
    }
  });

  it('answers a single small nudge immediately', () => {
    // The first step of a gesture is the one that has to feel instant; the
    // travel budget only applies to a stream that will not stop.
    expect(stepsFrom([[0, 45]])).toEqual([[0, 'next']]);
    expect(stepsFrom([[0, -45]])).toEqual([[0, 'prev']]);
  });

  it('ignores travel too small to be meant', () => {
    expect(stepsFrom([[0, 20]])).toEqual([]);
  });

  it('gives a discrete mouse wheel a step per notch, transition permitting', () => {
    // Every notch is its own gesture — the gaps are real — so each is answered
    // on its own terms rather than being swallowed as somebody else's inertia.
    const notches = stepsFrom(evenly(10, 300, 100));
    expect(notches.length).toBeGreaterThanOrEqual(5);
    expect(notches.every(([, step]) => step === 'next')).toBe(true);
  });

  it('starts over when the direction reverses', () => {
    // Travel banked going down should not have to be paid off before going up
    // registers.
    const gesture = createWheelGesture();
    expect(gesture.read(30, 0)).toBeNull();
    expect(gesture.read(-45, 20)).toBe('prev');
  });
});
