import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useAppTheme } from '@/contexts/ThemeContext';
import { capPixelRatio, createRenderGate, releaseContext } from '@/lib/three/scene-helpers';
import { createFrameThrottle } from '@/lib/raf-throttle';

/**
 * Globally rendered "Osaka" background - a rain-lashed pane of glass with a
 * neon alley burning through it. Like War it sits at z-index 0 behind a social
 * feed, so every decision below is biased toward "legible chrome behind
 * content", never "hero visual".
 *
 * THE ONE IDEA. A raindrop on a window is a LENS. The pane it sits on is out
 * of focus; the drop is not. So the scene never blurs a video and calls it
 * rain - it keeps two versions of the same frame and picks between them per
 * pixel:
 *   - the GLASS is a heavily downsampled, bloomed copy of the video (pass A),
 *   - the DROPS re-sample the SHARP video through a refracted, magnified and
 *     vertically flipped UV (a real drop inverts what is behind it).
 * That inversion is the whole tell. Without it the output reads as "blurry
 * video with circles on top"; with it, the neon signage genuinely appears to
 * be caught inside the beads.
 *
 * PASS STACK (all full-screen triangles, no camera maths):
 *   [A] glass   - video -> 1/3-res RT. 13-tap blur + a highlight-only bloom
 *                 term, so the pane keeps the sign glow after it loses detail.
 *   [B] wipe    - ping-ponged 1/4-res RT accumulating the pointer trail, faded
 *                 each frame. This is the interaction: dragging clears the fog.
 *   [C] composite - drops, trails, refraction, grade, luma clamp -> screen.
 *
 * COST BUDGET (desktop 1920x1080, "high" tier, per frame):
 *   pass A    ~230k px x 13 taps = ~3.0M fetches. The 1/3 downsample and its
 *             bilinear upsample do most of the defocus; the taps only smooth
 *             what bilinear leaves behind.
 *   pass B    ~130k px x 1 tap. Effectively free.
 *   pass C    one pixel-ratio-capped 2 MP pass, 3 drop layers, ~6 fetches.
 *   draw      3 calls. Nothing is instanced because nothing repeats.
 *   upload    the source is 1920x1070, so the per-frame VideoTexture upload is
 *             ~2.1M px. Re-encoding the original 3856x2148 master cut that by
 *             4x and the file from 29 MB to 4.4 MB; a 4K backplate is pure
 *             cost here, since pass A immediately throws 8/9 of it away.
 *   mobile    "low" drops to 1 drop layer, 1.2 MP / 1.25x buffer, 30 fps, no
 *             chromatic aberration and no bloom term.
 *
 * NO POST-PROCESSING PIPELINE. The bloom is a threshold term folded into pass
 * A's existing taps, because the reference vocabulary is a wet, wide, low-
 * frequency sign glow - which is exactly what a downsample-plus-threshold
 * produces, and nothing like UnrealBloomPass's tight halo.
 *
 * COLOUR MANAGEMENT. Every material here is a raw ShaderMaterial, so three
 * injects neither a texture decode nor an output encode: the video's sRGB
 * texels arrive verbatim and gl_FragColor ships verbatim. That is deliberate -
 * the grade below was authored against what the video actually looks like, and
 * a round trip through linear would wash the neon out. Same reasoning as the
 * comment block at the top of WarBackground.tsx.
 *
 * Unlike Cosmic/Hazy/Swarms/LavaLamp this theme is NOT hue-customisable: the
 * footage IS the palette, so there is no ThemeColorPicker entry for it.
 */
export function OsakaBackground() {
  const { theme } = useAppTheme();
  if (theme !== 'osaka') return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    >
      <OsakaScene />
    </div>
  );
}

/* ==========================================================================
   Sources
   ==========================================================================
   The video is muted and playsInline, which is what makes autoplay legal on
   every current mobile browser; the soundtrack is a separate <audio> element
   owned by OsakaAmbience, because audio autoplay is NOT legal and needs a
   gesture.

   NEITHER FILE IS IN THE REPO. Between them they are ~23 MB, which would make
   the mp3 alone the largest blob in git history, permanently, for an opt-in
   theme most clones never switch on. So they are gitignored and the base path
   is configurable: point VITE_OSAKA_MEDIA_BASE at a CDN in deploys, drop the
   files into public/osaka locally (see the README kept in that folder).

   Everything below therefore has to survive the files being ABSENT - a fresh
   clone is the normal case, not the edge case. When the video 404s the WebGL
   layer takes itself down and the CSS in osaka-frame.css paints the theme
   instead: void backdrop, neon wash, rain film, all the chrome. That still
   reads as a deliberate rainy-night theme rather than as a broken one.
   ========================================================================== */

const MEDIA_BASE =
  (import.meta.env.VITE_OSAKA_MEDIA_BASE as string | undefined)?.replace(/\/+$/, '') || '/osaka';

const VIDEO_SRC = `${MEDIA_BASE}/osaka-loop.mp4`;

/* ==========================================================================
   Palette
   ==========================================================================
   The canvas carries the full neon rainbow the reference photograph has. The
   CSS chrome does NOT - it locks to one accent (see the token block at the top
   of styles/osaka-frame.css). "Canvas gets the rainbow, chrome gets the lock"
   is this theme's version of War's house rule 2, and it is what stops a
   multi-coloured backdrop from turning the UI into a fruit salad.
   ========================================================================== */

/** Shadow tint. Wet asphalt at night is never black - it is the sky, folded.
 *  Keep in sync with --osaka-void in styles/osaka-frame.css. */
const SHADOW_TINT = new THREE.Vector3(0.055, 0.043, 0.094);
/** Highlight tint pulled toward sakura pink, the sign colour that dominates. */
const NEON_TINT = new THREE.Vector3(1.0, 0.62, 0.82);
/** Secondary sign colour, used only in the chromatic split at frame edges. */
const COOL_TINT = new THREE.Vector3(0.53, 0.86, 1.0);

/* ==========================================================================
   Device tier + budgets
   ==========================================================================
   Same starting-budget-plus-measured-demotion approach as WarBackground:
   feature detection alone mispredicts constantly on Android, so this only
   picks the opening bid.
   ========================================================================== */

type Tier = 'low' | 'mid' | 'high';

function detectTier(): Tier {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  const mem = nav.deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (nav.connection?.saveData === true || mem <= 2 || cores <= 4) return 'low';
  if (window.matchMedia('(pointer: coarse)').matches || mem <= 4) return 'mid';
  return 'high';
}

interface Budget {
  /** Drop layers composited in pass C. Each is ~40 ALU + 1 fetch. */
  layers: number;
  /** Divisor for the glass RT. Bigger = blurrier AND cheaper. It is the first
   *  dial to turn under pressure, but it has a floor: past about 1/5 the
   *  signage stops reading as signage and the shot loses its subject. */
  glassDiv: number;
  /** Divisor for the wipe RT. */
  wipeDiv: number;
  fps: number;
  maxPixels: number;
  maxRatio: number;
  /** Highlight bloom gain in pass A. 0 skips the threshold branch entirely. */
  bloom: number;
  /** Edge chromatic split in pass C. 0 skips two extra fetches. */
  aberration: number;
}

const BUDGETS: Record<Tier, Budget> = {
  low: {
    layers: 1,
    glassDiv: 5,
    wipeDiv: 6,
    fps: 30,
    maxPixels: 1_200_000,
    maxRatio: 1.25,
    bloom: 0,
    aberration: 0,
  },
  mid: {
    layers: 2,
    glassDiv: 4,
    wipeDiv: 5,
    fps: 60,
    maxPixels: 2_000_000,
    maxRatio: 1.5,
    bloom: 0.6,
    aberration: 0.4,
  },
  high: {
    layers: 3,
    glassDiv: 3,
    wipeDiv: 4,
    fps: 60,
    maxPixels: 2_000_000,
    maxRatio: 1.5,
    bloom: 1,
    aberration: 1,
  },
};

/* ==========================================================================
   Shared GLSL
   ========================================================================== */

/** One full-screen triangle. `position` arrives already in NDC, so there is no
 *  projection matrix anywhere in this file. */
const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 v_uv;
  void main() {
    v_uv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** Aspect-preserving "cover" fit, so the footage never stretches on any
 *  viewport. Returns the UV to sample the video with. */
const COVER_GLSL = /* glsl */ `
  vec2 osakaCover(vec2 uv, vec2 screen, vec2 tex) {
    float sa = screen.x / max(screen.y, 1.0);
    float ta = tex.x / max(tex.y, 1.0);
    vec2 s = sa > ta ? vec2(1.0, ta / sa) : vec2(sa / ta, 1.0);
    return (uv - 0.5) * s + 0.5;
  }
`;

const HASH_GLSL = /* glsl */ `
  float hash21(vec2 p) {
    p = fract(p * vec2(233.34, 851.73));
    p += dot(p, p + 23.45);
    return fract(p.x * p.y);
  }
  vec2 hash22(vec2 p) {
    float n = hash21(p);
    return vec2(n, hash21(p + n));
  }
`;

/* ==========================================================================
   Pass A - the glass
   ==========================================================================
   A 13-tap blur on an already-1/6-scale target. The taps are a rotated
   hexagonal ring pair rather than a box, because a box kernel on a downsampled
   neon sign leaves visible axis-aligned smearing on the vertical sign strokes
   that dominate this footage.
   ========================================================================== */

const GLASS_FRAG = /* glsl */ `
  uniform sampler2D u_video;
  uniform vec2 u_screen;
  uniform vec2 u_texel;
  uniform vec2 u_videoRes;
  uniform float u_bloom;
  ${COVER_GLSL}

  varying vec2 v_uv;

  void main() {
    vec2 uv = osakaCover(v_uv, u_screen, u_videoRes);

    vec3 sum = texture2D(u_video, uv).rgb;
    float wsum = 1.0;

    // Two rings of six, the outer one rotated 30 degrees. Cheap approximation
    // of a disc, which is the right bokeh shape for defocused point lights,
    // and this footage is mostly point lights.
    //
    // The radii are SMALL on purpose. The 1/3 downsample plus its bilinear
    // upsample is already most of the defocus; these taps only smooth what
    // bilinear leaves behind. An earlier revision ran 1.6/3.9 texels at 1/6
    // scale, which is a ~23px screen-space radius, and it dissolved the alley
    // into an unreadable smear. The signage has to stay legible as signage -
    // that is the entire subject of the shot.
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 1.0471975 + 0.2617994;
      vec2 d = vec2(cos(a), sin(a));
      vec3 c1 = texture2D(u_video, uv + d * u_texel * 1.0).rgb;
      vec3 c2 = texture2D(u_video, uv + vec2(-d.y, d.x) * u_texel * 2.1).rgb;
      sum += c1 * 0.72 + c2 * 0.44;
      wsum += 1.16;
    }

    vec3 col = sum / wsum;

    // Highlight-only bloom. Defocusing a neon sign does not merely smudge it,
    // it BLEEDS - the bright core spills further than the mid tones. Adding a
    // thresholded copy of the already-blurred result costs one more fetch of
    // nothing and is what keeps the signs reading as light sources.
    if (u_bloom > 0.0) {
      vec3 over = max(col - 0.42, 0.0);
      col += over * over * 2.6 * u_bloom;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ==========================================================================
   Pass B - the wipe
   ==========================================================================
   The pointer's history, as a decaying scalar field. Pass C reads it to bring
   the sharp video back and suppress drops, so dragging the cursor genuinely
   squeegees the pane. Ping-ponged because a shader cannot read the target it
   is writing.
   ========================================================================== */

const WIPE_FRAG = /* glsl */ `
  uniform sampler2D u_prev;
  uniform vec2 u_pointer;     // in screen UV
  uniform vec2 u_pointerPrev;
  uniform float u_active;     // 0 when the pointer has not moved recently
  uniform float u_decay;
  uniform float u_aspect;
  uniform float u_radius;

  varying vec2 v_uv;

  // Distance from p to the segment ab, so a fast flick still draws a
  // continuous stroke instead of a dotted line of per-frame stamps.
  float segDist(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba * h);
  }

  void main() {
    float prev = texture2D(u_prev, v_uv).r * u_decay;

    vec2 p = vec2(v_uv.x * u_aspect, v_uv.y);
    vec2 a = vec2(u_pointer.x * u_aspect, u_pointer.y);
    vec2 b = vec2(u_pointerPrev.x * u_aspect, u_pointerPrev.y);

    float d = segDist(p, a, b);
    float stamp = (1.0 - smoothstep(0.0, u_radius, d)) * u_active;

    gl_FragColor = vec4(vec3(max(prev, stamp)), 1.0);
  }
`;

/* ==========================================================================
   Pass C - the composite
   ==========================================================================
   Everything the user actually sees.
   ========================================================================== */

const COMPOSITE_FRAG = /* glsl */ `
  uniform sampler2D u_video;
  uniform sampler2D u_glass;
  uniform sampler2D u_wipe;
  uniform vec2 u_screen;
  uniform vec2 u_videoRes;
  uniform float u_time;
  uniform float u_aspect;
  uniform vec2 u_parallax;
  uniform float u_layers;
  uniform float u_aberration;
  uniform float u_maxLuma;
  uniform float u_fade;
  uniform vec3 u_shadow;
  uniform vec3 u_neon;
  uniform vec3 u_cool;
  ${COVER_GLSL}
  ${HASH_GLSL}

  varying vec2 v_uv;

  /* One layer of rain on the pane.
     Returns: xy = refraction offset, z = drop mask, w = trail mask.

     The cell grid is deliberately TALLER than it is wide. Drops on a vertical
     pane do not scatter isotropically; they run, so the cell has to give them
     somewhere to run to. Within a cell:
       - the main drop falls on an eased curve and wraps,
       - a column of small static beads sits above it, revealed only after the
         drop has passed that height. That is the trail, and it is the single
         detail that separates rain-on-glass from bubbles-on-glass. */
  vec4 osakaDrops(vec2 uv, float t, float scale, float seed) {
    vec2 grid = vec2(scale, scale * 0.62);
    // Cell size in RAIN units. Every distance below is measured in this space
    // rather than in cell-local space, because cells are about 1:1.8 and
    // measuring inside them stretches every "round" drop by that same factor.
    vec2 cell = 1.0 / grid;
    vec2 gv = uv * grid;
    vec2 id = floor(gv);
    vec2 f = fract(gv) - 0.5;

    vec2 rnd = hash22(id + seed);
    float n = rnd.x;

    // Per-cell fall. The 0.4 exponent front-loads the motion so a drop hangs,
    // then releases - real drops sit until they overcome surface tension and
    // then go in a burst.
    float speed = 0.22 + n * 0.4;
    float phase = fract(t * speed + rnd.y);
    float fall = pow(phase, 0.4);
    float dropY = 0.5 - fall * 1.05;
    float dropX = (n - 0.5) * 0.5;

    // Main bead, slightly elongated along its direction of travel. The size
    // below is a fraction of VIEWPORT HEIGHT, so a bead is ~4-7% of the
    // screen: big enough to carry a recognisable piece of the alley inside it,
    // which is the entire point. Sub-pixel beads read as coloured speckle.
    // (No backticks in this block - it lives inside a JS template literal.)
    vec2 d = (f - vec2(dropX, dropY)) * cell;
    float dr = length(d * vec2(1.3, 1.0));
    float size = 0.038 + n * 0.03;
    float drop = smoothstep(size, size * 0.4, dr);

    // Beads left in the drop's wake, only above its current height.
    float tx = (f.x - dropX) * cell.x;
    float colMask = smoothstep(size * 0.6, size * 0.18, abs(tx));
    float above = step(dropY, f.y);
    // Break the column into discrete beads instead of a solid stripe.
    float beads = fract(f.y * 4.0 + n * 13.0);
    beads = smoothstep(0.55, 0.95, beads);
    float trail = colMask * above * beads * smoothstep(0.62, 0.06, f.y - dropY);

    // Refraction vector, in RAIN units. The gradient of the mask is a good
    // enough surface normal at this scale and costs no derivatives. The caller
    // must divide x by the aspect before using this as a UV offset.
    vec2 normal = d * drop + vec2(tx, 0.0) * trail * 1.2;

    return vec4(normal, drop, trail);
  }

  void main() {
    vec2 uv = v_uv;

    // Parallax. The pane is a windscreen: the world behind it shifts a little
    // more than the glass does, which is what gives the frame depth.
    vec2 base = osakaCover(uv + u_parallax, u_screen, u_videoRes);

    // Aspect-corrected space so drops stay round on ultrawide.
    vec2 rain = vec2(uv.x * u_aspect, uv.y);
    float t = u_time;

    vec2 refract = vec2(0.0);
    float drop = 0.0;
    float trail = 0.0;

    // Three layers at descending scale read as three depths of water on one
    // pane. Layer count is the tier dial.
    vec4 l1 = osakaDrops(rain, t, 3.2, 0.0);
    refract += l1.xy; drop = max(drop, l1.z); trail = max(trail, l1.w);

    if (u_layers > 1.5) {
      vec4 l2 = osakaDrops(rain * 1.75 + 3.1, t * 1.3, 3.2, 21.0);
      refract += l2.xy * 0.6; drop = max(drop, l2.z * 0.85); trail = max(trail, l2.w * 0.7);
    }
    if (u_layers > 2.5) {
      vec4 l3 = osakaDrops(rain * 2.9 + 7.7, t * 1.7, 3.2, 47.0);
      refract += l3.xy * 0.35; drop = max(drop, l3.z * 0.6); trail = max(trail, l3.w * 0.5);
    }

    // The squeegee. Wiped areas lose their drops and their fog.
    float wipe = texture2D(u_wipe, uv).r;
    float wet = 1.0 - smoothstep(0.05, 0.75, wipe);
    drop *= wet;
    trail *= wet;
    refract *= wet;

    // --- the two versions of the frame ---------------------------------
    // GLASS: defocused, bloomed, and nudged by a slow wobble so the pane reads
    // as a sheet of water rather than a still photograph behind frosted film.
    vec2 wob = vec2(
      sin(uv.y * 11.0 + t * 0.5),
      cos(uv.x * 9.0 + t * 0.4)
    ) * 0.0016;
    vec2 guv = uv + wob + u_parallax * 0.35;
    vec3 glass = texture2D(u_glass, guv).rgb;

    // Chromatic split, strictly at the edges, and applied HERE rather than to
    // the finished pixel. A windscreen shot on a fast lens fringes in the
    // corners and nowhere else, so tying it to r^2 keeps it away from the
    // centre of frame where the feed's text sits. Doing it last instead would
    // overwrite the red and blue of every bead with the pane behind it and
    // leave the drops showing up as green-only ghosts.
    if (u_aberration > 0.0) {
      float r2 = dot(uv - 0.5, uv - 0.5);
      vec2 dir = normalize(uv - 0.5 + 1e-6) * r2 * 0.012 * u_aberration;
      glass.r = texture2D(u_glass, guv + dir).r;
      glass.b = texture2D(u_glass, guv - dir).b;
    }

    // Back into UV. The refraction vector is in rain units (x scaled by the
    // aspect), and forgetting this conversion is what made an early revision
    // displace samples by up to 17% of the frame: every bead pulled in a piece
    // of some unrelated part of the alley and the whole pane turned to chroma
    // confetti. Undoing the aspect keeps a bead sampling its own neighbourhood.
    vec2 refractUV = vec2(refract.x / u_aspect, refract.y);

    // DROP: the sharp frame, sampled through the bead. The 0.55 is a lens
    // magnification of roughly 2x, and the negated y flips the image about the
    // bead centre, because a spherical drop inverts what is behind it. That
    // inversion is the line that makes the effect read as water rather than as
    // circles.
    vec2 dropUV = base - refractUV * vec2(0.55, -0.55);
    vec3 sharp = texture2D(u_video, dropUV).rgb;

    // Beads also concentrate light, so they sit slightly hotter than the pane.
    sharp *= 1.0 + drop * 0.3;

    // Bead relief. Once the pane is only mildly defocused, a bead that merely
    // resamples the same image is invisible: there is not enough difference
    // between "sharp" and "slightly soft" to see. What actually makes a drop
    // read in a photograph is its EDGE - a specular crescent where light
    // catches the lip, and a dark meniscus opposite. Both live at the rim, so
    // drop*(1-drop) (peaking at 0.25, hence the 4x) is the right envelope.
    vec2 rimDir = normalize(refract + 1e-6);
    float lip = dot(rimDir, normalize(vec2(-0.55, 0.83)));
    float rim = drop * (1.0 - drop) * 4.0;
    sharp += rim * max(lip, 0.0) * 0.55;
    sharp *= 1.0 - rim * max(-lip, 0.0) * 0.4;

    // TRAIL: the wake beads refract the DEFOCUSED copy, not the sharp one.
    // They are only a few pixels wide, and pushing a 4K source through a lens
    // that small undersamples it badly. A trail bead is also too shallow to
    // form a clean image in reality, so the cheap fix and the physical answer
    // agree. Lifted slightly because water still catches light.
    vec3 trailCol = texture2D(u_glass, uv + wob - refractUV * vec2(0.5, -0.5)).rgb * 1.16;

    vec3 col = mix(glass, trailCol, clamp(trail, 0.0, 1.0));
    col = mix(col, sharp, clamp(drop, 0.0, 1.0));

    // Wiped glass returns toward the sharp frame too - that is what "clean"
    // looks like - but never fully, because a squeegeed pane is still wet.
    col = mix(col, texture2D(u_video, base).rgb, smoothstep(0.15, 0.95, wipe) * 0.72);

    // --- grade -----------------------------------------------------------
    // Shadows fold toward the wet-asphalt violet, highlights toward sakura.
    // Doing this on luminance rather than per channel preserves the sign hues
    // that make the footage worth looking at.
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col + u_shadow * 0.5, col, smoothstep(0.0, 0.35, luma));
    col = mix(col, col * u_neon, smoothstep(0.55, 1.0, luma) * 0.45);
    col = mix(col, col * u_cool, smoothstep(0.0, 0.22, luma) * 0.25);

    // Saturation lift. The pastel read the brief asks for is NOT desaturation;
    // it is high saturation held at low luminance, which is what neon through
    // water actually does.
    col = mix(vec3(luma), col, 1.28);

    // Vignette, doubling as the legibility guard at the frame edges where the
    // side panels sit.
    float vig = 1.0 - smoothstep(0.42, 1.05, length((uv - 0.5) * vec2(u_aspect * 0.72, 1.0)));
    col *= mix(0.42, 1.0, vig);

    // --- legibility ------------------------------------------------------
    // Structural, not a matter of taste: this canvas sits behind free-floating
    // body copy in the gutters between the glass panels, so its brightest
    // pixel has to stay under u_maxLuma.
    //
    // This is deliberately NOT the per-pixel luminance clamp War uses. That
    // works there because War paints sparse strokes over near-black, so
    // normalising a handful of hot pixels costs nothing. Here every pixel is
    // photographic content, and dividing each one by its own brightness
    // compresses each by a different amount: local contrast collapses and the
    // alley turns to grey mud. It looked exactly as bad as that sounds.
    //
    // Instead, a Reinhard shoulder applied to LUMINANCE, with the rgb scaled
    // to follow. Chromaticity is untouched, so the neon keeps its saturation;
    // highlights stay hot relative to their surroundings, so signs still read
    // as light sources; and since L/(1 + L/max) tends to max as L grows, the
    // ceiling is structural rather than a value anyone has to remember.
    const float OSAKA_EXPOSURE = 1.3;
    float outL = dot(col, vec3(0.2126, 0.7152, 0.0722));
    float lit = outL * OSAKA_EXPOSURE;
    float mapped = lit / (1.0 + lit / u_maxLuma);
    col *= mapped / max(outL, 1e-4);

    gl_FragColor = vec4(max(col, vec3(0.0)) * u_fade, 1.0);
  }
`;

/* ==========================================================================
   Scene
   ========================================================================== */

function OsakaScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let motionReduced = motionQuery.matches;

    const tier = detectTier();
    const budget = BUDGETS[tier];

    /* ---- video ---------------------------------------------------------- */
    // muted + playsInline + autoplay is the only combination that is allowed
    // to start without a gesture on iOS and Android. `loop` keeps it seamless;
    // crossOrigin is unset because the file is same-origin, and setting it
    // would make the texture upload fail on some CDNs.
    const video = document.createElement('video');
    video.src = VIDEO_SRC;
    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = 'auto';
    video.setAttribute('aria-hidden', 'true');
    // Kept out of the layout but NOT display:none - a display:none video is
    // allowed to stop decoding frames in several browsers, which freezes the
    // texture.
    video.style.cssText =
      'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px;';
    mount.appendChild(video);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      // No WebGL (blocked, or the ~16-context ceiling hit by theme churn).
      // The CSS layer paints the void backdrop and a still frame, so bail.
      video.remove();
      return;
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
    capPixelRatio(renderer, window.innerWidth, window.innerHeight, budget.maxPixels, budget.maxRatio);
    renderer.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault(), false);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;';
    mount.appendChild(renderer.domElement);

    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.generateMipmaps = false;
    videoTexture.wrapS = THREE.ClampToEdgeWrapping;
    videoTexture.wrapT = THREE.ClampToEdgeWrapping;

    /* ---- render targets -------------------------------------------------- */
    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    };

    const glassSize = () => ({
      w: Math.max(2, Math.floor(window.innerWidth / budget.glassDiv)),
      h: Math.max(2, Math.floor(window.innerHeight / budget.glassDiv)),
    });
    const wipeSize = () => ({
      w: Math.max(2, Math.floor(window.innerWidth / budget.wipeDiv)),
      h: Math.max(2, Math.floor(window.innerHeight / budget.wipeDiv)),
    });

    let g0 = glassSize();
    const glassRT = new THREE.WebGLRenderTarget(g0.w, g0.h, rtOpts);
    let w0 = wipeSize();
    const wipeRT = [
      new THREE.WebGLRenderTarget(w0.w, w0.h, rtOpts),
      new THREE.WebGLRenderTarget(w0.w, w0.h, rtOpts),
    ];
    let wipeIndex = 0;

    /* ---- geometry (one triangle, shared by all three passes) ------------- */
    const triGeo = new THREE.BufferGeometry();
    triGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    );

    const camera = new THREE.Camera();

    const makePass = (material: THREE.ShaderMaterial) => {
      const scene = new THREE.Scene();
      const mesh = new THREE.Mesh(triGeo, material);
      mesh.frustumCulled = false;
      scene.add(mesh);
      return scene;
    };

    /* ---- pass A ---------------------------------------------------------- */
    const glassUniforms = {
      u_video: { value: videoTexture },
      u_screen: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      u_texel: { value: new THREE.Vector2(1 / g0.w, 1 / g0.h) },
      u_videoRes: { value: new THREE.Vector2(16, 9) },
      u_bloom: { value: budget.bloom },
    };
    const glassMat = new THREE.ShaderMaterial({
      uniforms: glassUniforms,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: GLASS_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    const glassScene = makePass(glassMat);

    /* ---- pass B ---------------------------------------------------------- */
    const wipeUniforms = {
      u_prev: { value: wipeRT[1].texture },
      u_pointer: { value: new THREE.Vector2(-1, -1) },
      u_pointerPrev: { value: new THREE.Vector2(-1, -1) },
      u_active: { value: 0 },
      u_decay: { value: 0.94 },
      u_aspect: { value: window.innerWidth / Math.max(1, window.innerHeight) },
      u_radius: { value: 0.075 },
    };
    const wipeMat = new THREE.ShaderMaterial({
      uniforms: wipeUniforms,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: WIPE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    const wipeScene = makePass(wipeMat);

    /* ---- pass C ---------------------------------------------------------- */
    const compositeUniforms = {
      u_video: { value: videoTexture },
      u_glass: { value: glassRT.texture },
      u_wipe: { value: wipeRT[0].texture },
      u_screen: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      u_videoRes: { value: new THREE.Vector2(16, 9) },
      u_time: { value: 0 },
      u_aspect: { value: window.innerWidth / Math.max(1, window.innerHeight) },
      u_parallax: { value: new THREE.Vector2(0, 0) },
      u_layers: { value: budget.layers },
      u_aberration: { value: budget.aberration },
      // Asymptote of the tone-map shoulder, in sRGB. The gutters between the
      // glass panels are the only place body copy meets raw canvas, so this is
      // the number that has to hold. At 0.5 the shoulder maps a fully blown
      // input to ~0.36 sRGB, and --osaka-mist body text measures ~5.6:1
      // against that worst-case pixel. Everything on an actual panel sits
      // behind a 0.62-0.72 tint on top of that, so this is the floor case.
      u_maxLuma: { value: 0.5 },
      u_fade: { value: 0 },
      u_shadow: { value: SHADOW_TINT.clone() },
      u_neon: { value: NEON_TINT.clone() },
      u_cool: { value: COOL_TINT.clone() },
    };
    const compositeMat = new THREE.ShaderMaterial({
      uniforms: compositeUniforms,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    const compositeScene = makePass(compositeMat);

    /* ---- video metadata -------------------------------------------------- */
    const onMeta = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        glassUniforms.u_videoRes.value.set(video.videoWidth, video.videoHeight);
        compositeUniforms.u_videoRes.value.set(video.videoWidth, video.videoHeight);
      }
    };
    video.addEventListener('loadedmetadata', onMeta);
    onMeta();

    // The backplate is missing (no VITE_OSAKA_MEDIA_BASE set and nothing
    // dropped into public/osaka, or the CDN is down). Take the whole WebGL
    // layer down rather than leaving an opaque black canvas over the CSS that
    // is perfectly capable of carrying the theme on its own, and flag it on
    // <html> so osaka-frame.css can swap in its standalone backdrop.
    let mediaFailed = false;
    const onVideoError = () => {
      if (mediaFailed) return;
      mediaFailed = true;
      document.documentElement.dataset.osakaMedia = 'absent';
      renderer.domElement.style.display = 'none';
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    };
    video.addEventListener('error', onVideoError);

    // Autoplay can still be refused (data-saver modes, some embedded webviews).
    // Retry once on the first user gesture, then give up quietly - the CSS
    // backdrop already covers the no-video case.
    const tryPlay = () => {
      void video.play().catch(() => {});
    };
    tryPlay();
    const onGesture = () => {
      tryPlay();
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
    window.addEventListener('pointerdown', onGesture, { passive: true });
    window.addEventListener('keydown', onGesture);

    /* ---- pointer --------------------------------------------------------- */
    // Read into plain refs, never React state: this updates at pointer rate and
    // a setState here would re-render the entire app tree behind the canvas.
    const pointer = new THREE.Vector2(0.5, 0.5);
    const pointerPrev = new THREE.Vector2(0.5, 0.5);
    const parallaxTarget = new THREE.Vector2(0, 0);
    let pointerActiveUntil = 0;
    let hasPointer = false;

    const onPointerMove = (e: PointerEvent) => {
      const x = e.clientX / Math.max(1, window.innerWidth);
      const y = 1 - e.clientY / Math.max(1, window.innerHeight);
      if (!hasPointer) {
        pointer.set(x, y);
        pointerPrev.set(x, y);
        hasPointer = true;
      } else {
        pointerPrev.copy(pointer);
        pointer.set(x, y);
      }
      pointerActiveUntil = performance.now() + 90;
      // Deliberately tiny. This is a backdrop; a backdrop that swings around
      // under the cursor turns reading a feed into seasickness.
      parallaxTarget.set((x - 0.5) * 0.012, (y - 0.5) * -0.012);
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    /* ---- resize ---------------------------------------------------------- */
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h);
      capPixelRatio(renderer, w, h, budget.maxPixels, budget.maxRatio);

      const gs = glassSize();
      glassRT.setSize(gs.w, gs.h);
      glassUniforms.u_texel.value.set(1 / gs.w, 1 / gs.h);

      const ws = wipeSize();
      wipeRT[0].setSize(ws.w, ws.h);
      wipeRT[1].setSize(ws.w, ws.h);

      const aspect = w / Math.max(1, h);
      glassUniforms.u_screen.value.set(w, h);
      compositeUniforms.u_screen.value.set(w, h);
      compositeUniforms.u_aspect.value = aspect;
      wipeUniforms.u_aspect.value = aspect;

      if (motionReduced) drawStatic();
    };
    window.addEventListener('resize', onResize);

    /* ---- loop ------------------------------------------------------------ */
    const gate = createRenderGate(mount, () => {
      if (!raf) raf = requestAnimationFrame(animate);
    });
    const throttle = createFrameThrottle(budget.fps);
    const gl = renderer.getContext();

    let raf: number | null = null;
    const start = performance.now();

    const renderPasses = (time: number, now: number) => {
      compositeUniforms.u_time.value = time;

      // Ease the parallax rather than snapping to the pointer.
      compositeUniforms.u_parallax.value.lerp(parallaxTarget, 0.045);

      // A: glass
      renderer.setRenderTarget(glassRT);
      renderer.render(glassScene, camera);

      // B: wipe (ping-pong)
      const src = wipeIndex;
      const dst = 1 - wipeIndex;
      wipeUniforms.u_prev.value = wipeRT[src].texture;
      wipeUniforms.u_pointer.value.copy(pointer);
      wipeUniforms.u_pointerPrev.value.copy(pointerPrev);
      wipeUniforms.u_active.value = hasPointer && now < pointerActiveUntil ? 1 : 0;
      renderer.setRenderTarget(wipeRT[dst]);
      renderer.render(wipeScene, camera);
      wipeIndex = dst;
      compositeUniforms.u_wipe.value = wipeRT[dst].texture;

      // The stroke is consumed; collapse the segment so a stationary pointer
      // stamps a dot rather than re-drawing the last swipe every frame.
      pointerPrev.copy(pointer);

      // C: screen
      renderer.setRenderTarget(null);
      renderer.render(compositeScene, camera);
    };

    /** Single composed frame for reduced-motion users. Hoisted so a resize
     *  redraw is identical to the first paint. */
    function drawStatic() {
      if (gl.isContextLost() || mediaFailed) return;
      compositeUniforms.u_fade.value = 1;
      wipeUniforms.u_active.value = 0;
      renderPasses(4.2, performance.now());
    }

    const animate = (now: number) => {
      raf = requestAnimationFrame(animate);
      if (mediaFailed || !gate.isActive() || gl.isContextLost()) return;
      if (!throttle(now)) return;

      // Fade in over ~700ms. The video's first decoded frame can land several
      // hundred ms after mount, and cutting straight from the CSS backdrop to
      // a lit alley is a jolt on every theme switch.
      const u = compositeUniforms.u_fade;
      if (u.value < 1) u.value = Math.min(1, u.value + 0.045);

      renderPasses((now - start) / 1000, now);
    };

    if (motionReduced) {
      // Still frame only. The video is paused on its poster frame and the rain
      // is frozen mid-fall, which is a composition, not an animation.
      video.pause();
      const paint = () => drawStatic();
      video.addEventListener('loadeddata', paint, { once: true });
      // Seek a little way in so the frozen frame is not the fade-from-black
      // most encodes open on.
      video.addEventListener(
        'loadedmetadata',
        () => {
          try {
            video.currentTime = Math.min(2, (video.duration || 4) * 0.25);
          } catch {
            /* not seekable yet - the poster frame is fine */
          }
        },
        { once: true },
      );
      paint();
    } else {
      raf = requestAnimationFrame(animate);
    }

    const onMotionChange = (e: MediaQueryListEvent) => {
      motionReduced = e.matches;
      if (motionReduced) {
        if (raf) cancelAnimationFrame(raf);
        raf = null;
        video.pause();
        drawStatic();
      } else {
        tryPlay();
        if (!raf) raf = requestAnimationFrame(animate);
      }
    };
    motionQuery.addEventListener('change', onMotionChange);

    /* ---- teardown -------------------------------------------------------- */
    return () => {
      if (raf) cancelAnimationFrame(raf);
      gate.destroy();
      motionQuery.removeEventListener('change', onMotionChange);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('error', onVideoError);
      // The flag belongs to this mount, not to the document: leaving it behind
      // would keep the CSS fallback backdrop painted under the next theme.
      delete document.documentElement.dataset.osakaMedia;

      // Detach the source before dropping the element, or Chrome keeps the
      // decoder alive and a few theme flips leave several videos decoding.
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();

      videoTexture.dispose();
      glassRT.dispose();
      wipeRT[0].dispose();
      wipeRT[1].dispose();
      triGeo.dispose();
      glassMat.dispose();
      wipeMat.dispose();
      compositeMat.dispose();
      releaseContext(renderer);
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={mountRef} className="w-full h-full" />;
}
