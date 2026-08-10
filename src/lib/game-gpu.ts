/**
 * GPU preflight for the games.
 * ============================
 * Every game this app embeds is a WebGL app that generates its geometry,
 * textures and audio at runtime, and none of them fail loudly when the GPU
 * cannot keep up: they show a black canvas, or crawl at a few frames per
 * second, which from the outside is indistinguishable from "it did not load".
 * So the host checks first and can say what is actually wrong.
 *
 * This lives here rather than in a launcher because there are now three
 * callers — the War theme launcher, the Jungle theme launcher and the Arcade
 * player — and the first two had already drifted into carrying byte-identical
 * copies of `readRenderer` and `isIntegratedGpu`. The detection is shared; the
 * wording is not, because "CANNOT DEPLOY" belongs to the War game and nowhere
 * else. Callers get the facts and write their own copy.
 */

/**
 * Read the GPU's unmasked renderer string, or '' when the browser withholds it.
 *
 * Costs a throwaway GL context, so callers should do this once. Prefer
 * {@link probeGpu}, which reads the renderer and the WebGL level from a single
 * context instead of two.
 */
export function readRenderer(): string {
  return probeGpu().renderer;
}

/**
 * Integrated graphics, by renderer string.
 *
 * These share system memory and have a fraction of a discrete card's fill
 * rate, which is exactly what these games lean on: shadow cascades, a full
 * post chain and six-figure triangle counts.
 */
export function isIntegratedGpu(renderer: string): boolean {
  return /iris|uhd graphics|hd graphics|intel\(r\) graphics|vega \d|radeon graphics|adreno|mali|apple gpu|llvmpipe|swiftshader/i.test(
    renderer,
  );
}

/** A software rasteriser standing in for a GPU that is not being used. */
export function isSoftwareRenderer(renderer: string): boolean {
  return /swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(renderer);
}

export interface GpuProbe {
  /** A WebGL 2 context was granted. */
  webgl2: boolean;
  /** A context of any WebGL level was granted. */
  webgl: boolean;
  /**
   * Unmasked renderer string, or '' when the browser withholds it (it sits
   * behind an extension that some browsers refuse). Absent is NOT a failure —
   * callers must treat '' as "unknown, assume fine", or they will block
   * machines that are perfectly capable.
   */
  renderer: string;
  /** {@link isSoftwareRenderer} on a renderer string we actually got. */
  software: boolean;
}

/**
 * Probe once, on one throwaway context.
 *
 * The context is released with `WEBGL_lose_context` the moment the answers are
 * out: contexts are a scarce per-page resource, the caller's page may already
 * hold one for a theme background, and the game is about to ask for its own.
 */
export function probeGpu(): GpuProbe {
  const absent: GpuProbe = { webgl2: false, webgl: false, renderer: '', software: false };
  // SSR / prerender: report nothing rather than a false negative.
  if (typeof document === 'undefined') {
    return { ...absent, webgl2: true, webgl: true };
  }

  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
    const gl = (gl2 ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return absent;

    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '') : '';
    (gl.getExtension('WEBGL_lose_context') as { loseContext(): void } | null)?.loseContext();

    return {
      webgl2: gl2 !== null,
      webgl: true,
      renderer,
      software: renderer !== '' && isSoftwareRenderer(renderer),
    };
  } catch {
    // A browser that throws rather than returning null on getContext is not a
    // machine we can say anything useful about. Do not block it.
    return { ...absent, webgl2: true, webgl: true };
  }
}

/**
 * True when the hardware is not in doubt: this is a small screen, a touch
 * device, or integrated graphics.
 *
 * THE GPU DECIDES, NOT THE CPU. An earlier version of the War launcher keyed
 * off `navigator.hardwareConcurrency` alone, which is a bad proxy on laptops
 * and got a real machine badly wrong: an i7-1360P reports 16 logical cores, so
 * it was classed as powerful, while its actual GPU is integrated Iris Xe
 * sharing system memory. The result was a game that ran, and crawled.
 *
 * An unknown renderer is deliberately NOT weak — see {@link GpuProbe.renderer}.
 */
export function isWeakHardware(renderer = readRenderer()): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  const coarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;

  return coarse || small || (renderer !== '' && isIntegratedGpu(renderer));
}
