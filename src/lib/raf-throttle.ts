/**
 * Frame-rate throttle for ambient render loops.
 * =============================================
 * `requestAnimationFrame` fires at the display's refresh rate — up to 120 Hz on
 * ProMotion iPhones/iPads and 120–144 Hz on gaming displays. The full-screen
 * shader/particle *backgrounds* gain nothing a viewer can perceive above ~60fps,
 * yet every extra frame costs full GPU fill-rate (and, for the CPU particle
 * sims, full main-thread time). On a 120 Hz device that is roughly double the
 * sustained work for no visible benefit — a real, measurable source of device
 * heat and battery drain (an iPhone 15 Pro Max is a 120 Hz panel).
 *
 * Returns a predicate: call it once per rAF tick with that tick's timestamp. It
 * returns true at most ~`fps` times per second. Skip the frame's drawing work
 * when it returns false, but keep the loop scheduled. Animations driven by
 * wall-clock time (THREE `Clock`, `performance.now()` time uniforms) are
 * unaffected in speed — a skipped frame simply lowers the sample rate.
 */
export function createFrameThrottle(fps = 60): (now: number) => boolean {
  const interval = 1000 / fps;
  // Tolerance so a panel running at exactly the target rate (e.g. a 60 Hz
  // display under a 60 fps cap) isn't nudged down to half-rate by sub-ms jitter:
  // without it a frame arriving at 16.6 ms would miss a 16.667 ms gate and the
  // next chance wouldn't come until ~33 ms, silently halving to 30 fps.
  const threshold = Math.max(interval * 0.5, interval - 4);
  let last = -Infinity;
  return (now: number): boolean => {
    if (now - last < threshold) return false;
    last = now;
    return true;
  };
}
