import { useEffect, useRef } from 'react';
import { createRenderGate } from '@/lib/three/scene-helpers';
import { createFrameThrottle } from '@/lib/raf-throttle';
import { useAppTheme } from '@/contexts/ThemeContext';
import { getJunglePush, subscribeJunglePush } from '@/lib/jungle-cinematic';

/**
 * Globally rendered "Jungle" background — a sunlit canopy seen from the floor
 * of the rainforest, with light shafts coming down through the leaves.
 *
 * WHY THIS ONE DOES NOT USE THREE.JS
 * ==================================
 * Every other canvas theme in this app imports three. That is correct for them:
 * Cosmic instances thousands of points, War builds real terrain geometry, Osaka
 * runs a three-pass render-target chain. This scene draws ONE full-screen
 * triangle with ONE shader. Three would contribute a scene graph, a camera, a
 * material system and a WebGLRenderer to manage a single draw call that needs
 * none of them.
 *
 * The brief here was explicit: the theme has to load on every screen and every
 * user, "even really low RAM", and the game is the part that is allowed to be
 * heavy. So this file talks to WebGL directly:
 *
 *   - ~200 KB gzipped of vendor-three never enters the critical path for this
 *     theme. The only thing a user downloads to get the Jungle is this module.
 *   - Peak GPU memory is the framebuffer plus a 6-float vertex buffer. There is
 *     no geometry, no texture, no render target, and nothing is uploaded per
 *     frame. On a 2 GB Android that difference is the whole ballgame.
 *   - No asset fetch at all. Every leaf, shaft and mote below is generated in
 *     the fragment shader, so there is nothing to 404 on a deploy — the failure
 *     mode that has bitten theme media in this repo before.
 *
 * It targets GLSL ES 1.00 (WebGL 1), not 3.00. WebGL 2 is requested first
 * because it is a better context to have, but the shader stays 1.00-compatible
 * so that a device with WebGL 1 only — which is precisely the low-end hardware
 * the brief names — gets the real theme rather than a fallback.
 *
 * COST BUDGET (desktop 1920x1080, "high" tier, per frame)
 *   1 draw call, 1 full-screen triangle, ~2 MP capped.
 *   canopy   4 layers x (1 leaf-cell eval + 2 octaves of value noise)
 *   shafts   6 taps along the sun vector
 *   motes    3 hashed cells
 *   Nothing is uploaded per frame beyond 5 uniforms.
 *
 * The "low" tier drops to 2 canopy layers, kills the shafts and the motes, and
 * caps at 30 fps and 0.9 MP. That is roughly a third of the fragment cost and
 * still reads as the same picture, because the depth comes from the layer
 * palette rather than from the layer count.
 *
 * THE CAMERA IS SHARED WITH THE GAME. uPush (see lib/jungle-cinematic.ts) is
 * the dolly the game launcher drives on deploy: the same canopy the feed was
 * sitting behind opens up and moves down the trail while the chrome slides
 * away. That is why the parallax below is expressed as a per-layer depth rather
 * than as a flat scroll — a flat scroll cannot be pushed into.
 */
export function JungleBackground() {
  const { theme } = useAppTheme();
  if (theme !== 'jungle') return null;
  return <JungleScene />;
}

/* ==========================================================================
   Device tier
   ==========================================================================
   Same opening-bid-then-measure approach the other canvas themes use: feature
   detection alone mispredicts constantly on Android, so this only picks the
   starting budget and the frame-time watchdog below does the rest.
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
  /** Canopy layers. The dominant fragment cost and the first dial to turn. */
  layers: number;
  /** Volumetric shaft taps. 0 compiles the loop out entirely. */
  shafts: number;
  /** Floating spore layers. 0 compiles them out. */
  motes: number;
  fps: number;
  maxPixels: number;
  maxRatio: number;
}

const BUDGETS: Record<Tier, Budget> = {
  low: { layers: 2, shafts: 0, motes: 0, fps: 30, maxPixels: 900_000, maxRatio: 1.25 },
  mid: { layers: 3, shafts: 4, motes: 2, fps: 60, maxPixels: 1_600_000, maxRatio: 1.5 },
  high: { layers: 4, shafts: 6, motes: 3, fps: 60, maxPixels: 2_000_000, maxRatio: 1.5 },
};

/* ==========================================================================
   Shaders
   ==========================================================================
   GLSL ES 1.00. `#define`d counts rather than uniform loop bounds, because
   WebGL 1 requires constant loop conditions and because a tier that does not
   want shafts should not pay to branch around them.
   ========================================================================== */

/** One full-screen triangle. Bigger than the viewport on purpose: it covers the
 *  screen with three vertices instead of a quad's six, and skips the diagonal
 *  seam a quad puts through the middle of every fragment-heavy shader. */
const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

function buildFragment(budget: Budget): string {
  return `
precision mediump float;

varying vec2 vUv;

uniform vec2  uRes;
uniform float uTime;
/** Pointer parallax, -1..1 on each axis, already smoothed on the CPU. */
uniform vec2  uParallax;
/** Cinematic dolly, 0 at rest, 1 fully pushed down the trail. */
uniform float uPush;

#define LAYERS ${budget.layers}
#define SHAFTS ${budget.shafts}
#define MOTES  ${budget.motes}

/* -- palette --------------------------------------------------------------
   Keep in sync with the token block at the top of styles/jungle-frame.css.
   A rainforest floor is NOT a green wash: it is a very dark blue-green in
   shadow with a hot, almost white-gold where the sun gets through. Painting it
   as mid-green everywhere is what makes CG jungles look like felt. */
const vec3 DEEP   = vec3(0.019, 0.055, 0.043); /* canopy shadow, near-black */
const vec3 MOSS   = vec3(0.086, 0.212, 0.129); /* mid foliage */
const vec3 FROND  = vec3(0.259, 0.443, 0.196); /* lit leaf face */
const vec3 SUN    = vec3(1.000, 0.925, 0.706); /* the gap in the canopy */
const vec3 HAZE   = vec3(0.451, 0.588, 0.408); /* humid air between layers */

/* -- hash + value noise ---------------------------------------------------
   Value noise, not simplex. It is roughly half the ALU, and every use below is
   either a silhouette threshold or a low-frequency wobble, where the extra
   isotropy of a gradient noise is invisible. */
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

/** Two octaves is the whole budget. A third is not visible once the result is
 *  pushed through a smoothstep into a silhouette. */
float fbm2(vec2 p) {
  return noise(p) * 0.62 + noise(p * 2.17 + 4.1) * 0.38;
}

mat2 rot(float a) {
  float s = sin(a), c = cos(a);
  return mat2(c, -s, s, c);
}

/* -- one leaf -------------------------------------------------------------
   A leaf is a lens: the intersection of two circles. Signed distance is the
   larger of the two, so the shape comes to a genuine point at both ends —
   which is the read that separates "foliage" from "green blobs". A midrib is
   subtracted as a thin band so the silhouette is not perfectly solid. */
float leaf(vec2 p, float len) {
  p.x /= len;
  float r = 0.85;
  float d = max(length(p - vec2(0.0, r - 0.62)) - r,
                length(p + vec2(0.0, r - 0.62)) - r);
  return d;
}

/* -- a field of leaves ----------------------------------------------------
   ONE cell lookup, not a 3x3 neighbourhood: nine leaf evaluations per layer is
   most of a frame budget on integrated graphics, and the gaps a single cell
   leaves are covered by running the field twice at different scales and
   offsets (see canopy() below) rather than by sampling neighbours.

   Each cell rotates, offsets and lengthens by its own hash, so the grid never
   reads as a grid. The sway argument walks the whole field on a slow sine —
   wind, not scrolling. (No backticks anywhere below this line: the shader is a
   template literal, and one inside a GLSL comment ends the string.) */
float leafField(vec2 p, float scale, float seed, float sway) {
  p *= scale;
  p.x += sin(uTime * 0.21 + p.y * 0.9 + seed) * sway;
  p.y += cos(uTime * 0.17 + p.x * 0.7 + seed) * sway * 0.6;

  vec2 cell = floor(p);
  vec2 f = fract(p) - 0.5;

  float h = hash21(cell + seed);
  float h2 = hash21(cell + seed + 7.7);

  /* Offset inside the cell, then rotate. The leaf is small enough relative to
     the cell that this never clips at the boundary. */
  f -= (vec2(h, h2) - 0.5) * 0.42;
  f = rot(h * 6.2831) * f;

  float d = leaf(f, 0.42 + h2 * 0.5);
  /* Antialias against the pixel footprint of this layer rather than a constant,
     so distant layers stay soft and near ones stay crisp. */
  return 1.0 - smoothstep(-0.02, 0.055, d);
}

/* -- one canopy layer -----------------------------------------------------
   Leaves plus a low-frequency clump mask. The mask is what stops the layer
   reading as wallpaper: real foliage is dense in patches and open in between,
   and the openings are where the light gets through. */
float canopy(vec2 p, float scale, float seed, float sway) {
  float a = leafField(p, scale, seed, sway);
  float b = leafField(p + vec2(0.37, 0.61), scale * 1.63, seed + 3.3, sway * 0.8);
  float clump = smoothstep(0.32, 0.78, fbm2(p * scale * 0.28 + seed));
  return clamp(max(a, b * 0.9) * (0.45 + 0.55 * clump), 0.0, 1.0);
}

void main() {
  /* Aspect-correct around the centre so the composition does not stretch on a
     phone. Everything below works in this space. */
  vec2 uv = vUv;
  vec2 p = (uv - 0.5) * vec2(uRes.x / max(uRes.y, 1.0), 1.0);

  /* The dolly. Pushing forward scales the field up around a point slightly
     below centre (the trail), which is what walking into a scene actually does
     to the projection. Parallax is scaled DOWN as the push runs so the pointer
     cannot fight the camera move. */
  float push = uPush;
  vec2 anchor = vec2(0.0, -0.06);
  p = (p - anchor) / (1.0 + push * 1.85) + anchor;
  vec2 par = uParallax * (1.0 - push * 0.8);

  /* -- air ---------------------------------------------------------------
     Vertical gradient first: the canopy gap is up and slightly right, so the
     air is brightest there and collapses to near-black at the forest floor. */
  float height = uv.y;
  vec3 col = mix(DEEP * 0.55, mix(MOSS, HAZE, 0.35), smoothstep(-0.1, 1.05, height));

  /* The gap in the canopy. Not a disc — a soft anisotropic wash, because a
     round sun in a jungle reads as a streetlight. */
  vec2 sunPos = vec2(0.28, 0.42) + par * 0.03;
  vec2 sd = (p - sunPos) * vec2(1.0, 1.55);
  float sunFall = exp(-dot(sd, sd) * 3.4);
  col += SUN * sunFall * (0.55 + push * 0.25);

  /* -- volumetric shafts --------------------------------------------------
     Cheap god rays: march a few taps back toward the sun, sampling a noise
     field that is stretched along the sun vector. Each tap fades, so the
     result is bright near the gap and gone by the floor. */
#if SHAFTS > 0
  {
    vec2 dir = (sunPos - p) / float(SHAFTS);
    vec2 sp = p;
    float acc = 0.0;
    for (int i = 0; i < SHAFTS; i++) {
      sp += dir;
      float n = fbm2(sp * vec2(5.5, 1.2) + vec2(uTime * 0.035, 0.0));
      acc += smoothstep(0.52, 0.95, n) * (1.0 - float(i) / float(SHAFTS));
    }
    acc /= float(SHAFTS);
    /* Gated on the sun falloff so shafts never appear in the dark half of the
       frame, where they would look like a rendering artefact. */
    col += SUN * acc * 0.55 * smoothstep(0.02, 0.5, sunFall);
  }
#endif

  /* -- humidity ----------------------------------------------------------- */
  float mist = fbm2(p * 1.6 + vec2(uTime * 0.018, uTime * 0.008));
  col = mix(col, HAZE, smoothstep(0.45, 1.0, mist) * 0.16 * (1.0 - height * 0.4));

  /* -- canopy layers ------------------------------------------------------
     Back to front. Each layer is darker, larger and moves more, so depth comes
     from palette and parallax rather than from a blur nobody can afford. The
     nearest layer is nearly black: it is a silhouette against the light, which
     is what a leaf directly overhead actually looks like. */
  for (int i = 0; i < LAYERS; i++) {
    float fi = float(i) / float(LAYERS - 1 > 0 ? LAYERS - 1 : 1);

    /* Depth 0 = far, 1 = right above the viewer. */
    float depth = fi;
    float scale = mix(7.5, 2.1, depth);
    float drift = mix(0.05, 0.30, depth);

    vec2 lp = p * (1.0 + push * depth * 1.2)
            + par * drift
            + vec2(uTime * 0.006 * (1.0 + depth), -uTime * 0.004);

    float mask = canopy(lp, scale, float(i) * 11.3, mix(0.05, 0.16, depth));

    /* Leaf colour: lit rim toward the sun, deep shadow away from it. mixing on
       sunFall rather than on a light vector keeps it to one lerp. */
    vec3 leafCol = mix(mix(MOSS, FROND, 0.55 - depth * 0.45), DEEP, depth * 0.82);
    leafCol = mix(leafCol, FROND, sunFall * (0.45 - depth * 0.35));

    /* Translucency: a leaf with the sun behind it glows. This is the single
       cheapest thing in the shader that makes it read as a real canopy. */
    leafCol += SUN * sunFall * (0.30 - depth * 0.22) * mask;

    col = mix(col, leafCol, mask * mix(0.82, 1.0, depth));
  }

  /* -- spores -------------------------------------------------------------
     Hashed points drifting upward through the shafts. Only in the lit half —
     dust you cannot see the light on is just noise. */
#if MOTES > 0
  {
    float m = 0.0;
    for (int i = 0; i < MOTES; i++) {
      float fi = float(i);
      vec2 mp = p * (9.0 + fi * 5.0) + vec2(uTime * (0.04 + fi * 0.02), -uTime * (0.07 + fi * 0.03));
      vec2 mc = floor(mp);
      vec2 mf = fract(mp) - 0.5;
      float h = hash21(mc + fi * 19.1);
      /* Most cells are empty: a mote in every cell is snow, not spores. */
      if (h > 0.955) {
        m += (1.0 - smoothstep(0.0, 0.09, length(mf))) * (0.5 + 0.5 * sin(uTime * 2.0 + h * 40.0));
      }
    }
    col += SUN * m * 0.45 * smoothstep(0.01, 0.35, sunFall);
  }
#endif

  /* -- grade --------------------------------------------------------------
     A vignette that is heavier at the bottom (the floor is in shadow), a gentle
     lift of the darks toward blue-green so the shadows never go dead black, and
     a soft filmic knee on the highlights so the sun gap does not clip flat. */
  float vig = smoothstep(1.35, 0.25, length(p * vec2(0.85, 1.05) + vec2(0.0, 0.12)));
  col *= mix(0.42, 1.0, vig);
  col = mix(col, DEEP, 0.10 * (1.0 - height));
  col = col / (col + 0.42) * 1.42;

  /* The dolly brightens as it goes: pushing into the trail opens the canopy. */
  col *= 1.0 + push * 0.35;

  /* Dither. Eight-bit output over a shader this smooth bands visibly across the
     upper gradient; a fraction of a quantisation step of noise removes it for
     two instructions. */
  col += (hash21(gl_FragCoord.xy) - 0.5) * 0.006;

  gl_FragColor = vec4(col, 1.0);
}
`;
}

/* ==========================================================================
   Scene
   ========================================================================== */

function JungleScene() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    const root = document.documentElement;

    /* WebGL 2 first (better driver paths on modern Android), but the shader is
       GLSL 1.00, so a WebGL 1 context is a first-class outcome and not a
       downgrade. `alpha: false` matters: an opaque backbuffer lets the
       compositor skip a blend over the page for the whole viewport. */
    const attrs: WebGLContextAttributes = {
      alpha: false,
      antialias: false, // nothing here has an edge that MSAA would help
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: false,
    };

    const gl = (canvas.getContext('webgl2', attrs) ||
      canvas.getContext('webgl', attrs) ||
      canvas.getContext('experimental-webgl', attrs)) as WebGLRenderingContext | null;

    if (!gl) {
      // The CSS half of the theme paints a full jungle backdrop on this flag.
      root.dataset.jungleGl = 'off';
      return () => {
        delete root.dataset.jungleGl;
      };
    }

    let tier = detectTier();
    let budget = BUDGETS[tier];

    /* -- program ---------------------------------------------------------- */
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let uRes: WebGLUniformLocation | null = null;
    let uTime: WebGLUniformLocation | null = null;
    let uParallax: WebGLUniformLocation | null = null;
    let uPush: WebGLUniformLocation | null = null;

    function compile(type: number, src: string): WebGLShader | null {
      const sh = gl!.createShader(type);
      if (!sh) return null;
      gl!.shaderSource(sh, src);
      gl!.compileShader(sh);
      if (!gl!.getShaderParameter(sh, gl!.COMPILE_STATUS)) {
        // Deliberately silent in production: a shader that will not compile is
        // a decorative background failing, and the CSS fallback already covers
        // the visual. Logging it would be noise in every user's console.
        gl!.deleteShader(sh);
        return null;
      }
      return sh;
    }

    /** (Re)build the program for the current budget. Returns false on failure. */
    function buildProgram(): boolean {
      const vs = compile(gl!.VERTEX_SHADER, VERT);
      const fs = compile(gl!.FRAGMENT_SHADER, buildFragment(budget));
      if (!vs || !fs) return false;

      const prog = gl!.createProgram();
      if (!prog) return false;
      gl!.attachShader(prog, vs);
      gl!.attachShader(prog, fs);
      gl!.bindAttribLocation(prog, 0, 'aPos');
      gl!.linkProgram(prog);
      /* The shaders are owned by the program once attached; deleting the
         handles here is what stops a demotion from leaking one pair per
         rebuild. */
      gl!.deleteShader(vs);
      gl!.deleteShader(fs);

      if (!gl!.getProgramParameter(prog, gl!.LINK_STATUS)) {
        gl!.deleteProgram(prog);
        return false;
      }

      if (program) gl!.deleteProgram(program);
      program = prog;
      gl!.useProgram(program);
      uRes = gl!.getUniformLocation(program, 'uRes');
      uTime = gl!.getUniformLocation(program, 'uTime');
      uParallax = gl!.getUniformLocation(program, 'uParallax');
      uPush = gl!.getUniformLocation(program, 'uPush');
      return true;
    }

    if (!buildProgram()) {
      root.dataset.jungleGl = 'off';
      return () => {
        delete root.dataset.jungleGl;
      };
    }

    /* One triangle that covers clip space. */
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    /* -- sizing ----------------------------------------------------------- */
    let cssW = 0;
    let cssH = 0;

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w === cssW && h === cssH) return;
      cssW = w;
      cssH = h;
      /* Same cap the three-based backgrounds use, computed by hand since there
         is no renderer to ask: ratio = sqrt(maxPixels / area) pins the total
         buffer regardless of how large the display is. */
      const dpr = window.devicePixelRatio || 1;
      const ratio = Math.min(dpr, budget.maxRatio, Math.sqrt(budget.maxPixels / Math.max(1, w * h)));
      canvas!.width = Math.max(1, Math.round(w * ratio));
      canvas!.height = Math.max(1, Math.round(h * ratio));
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    /* -- pointer parallax --------------------------------------------------
       Smoothed on the CPU rather than in the shader: the target is written by a
       passive listener and the loop eases toward it, so a fast mouse cannot put
       a step in the picture and a still mouse costs nothing. Touch is
       deliberately not wired — a coarse pointer dragging the feed should not
       also be steering the background. */
    let targetX = 0;
    let targetY = 0;
    let parX = 0;
    let parY = 0;

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      targetX = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      targetY = 1 - (e.clientY / Math.max(1, window.innerHeight)) * 2;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    /* -- cinematic dolly --------------------------------------------------- */
    let push = getJunglePush();
    const unsubscribePush = subscribeJunglePush((value) => {
      push = value;
      /* The dolly runs while the launcher is animating the DOM, and the gate
         may have the loop parked at a throttled rate. Nudging it awake here
         keeps the camera move and the panel slide on the same clock. */
      if (gate.isActive() && raf === null) start();
    });

    /* -- render loop ------------------------------------------------------- */
    let raf: number | null = null;
    let throttle = createFrameThrottle(budget.fps);
    const t0 = performance.now();

    /* Frame-time watchdog. detectTier() only picks the opening bid; a phone
       that reports 8 cores and then renders at 22 fps has to be believed over
       its own spec sheet. One demotion, one rebuild, never back up — an
       oscillating quality level is worse than the lower one. */
    let slowFrames = 0;
    let demoted = false;
    let lastFrame = t0;

    function demote() {
      if (demoted || tier === 'low') return;
      demoted = true;
      tier = tier === 'high' ? 'mid' : 'low';
      budget = BUDGETS[tier];
      throttle = createFrameThrottle(budget.fps);
      cssW = 0; // force the resize path to re-cap the buffer
      if (!buildProgram()) return;
      gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
      gl!.enableVertexAttribArray(0);
      gl!.vertexAttribPointer(0, 2, gl!.FLOAT, false, 0, 0);
      resize();
    }

    function frame(now: number) {
      /* Park rather than spin when the gate closes: `raf = null` is what lets
         the gate's own onResume call start() again. */
      if (!gate.isActive()) {
        raf = null;
        return;
      }
      raf = requestAnimationFrame(frame);
      if (!throttle(now)) return;
      if (gl!.isContextLost()) return;

      const dt = now - lastFrame;
      lastFrame = now;
      /* Only judge frames that were not the first after a resume, and only
         while the camera is at rest — the dolly is expected to be expensive. */
      if (push === 0 && dt > 34 && dt < 500) {
        if (++slowFrames > 90) demote();
      } else if (dt < 24) {
        slowFrames = Math.max(0, slowFrames - 1);
      }

      /* Ease toward the pointer. The coefficient is deliberately low: the
         background moving as fast as the cursor is distracting behind text. */
      parX += (targetX - parX) * 0.045;
      parY += (targetY - parY) * 0.045;

      resize();
      gl!.uniform2f(uRes, canvas!.width, canvas!.height);
      gl!.uniform1f(uTime, (now - t0) * 0.001);
      gl!.uniform2f(uParallax, parX, parY);
      gl!.uniform1f(uPush, push);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }

    function start() {
      if (raf === null) {
        lastFrame = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }

    /* Pauses on tab-hide and while a full-page docs surface is composited over
       the canvas, and — importantly — while the game owns the GPU. */
    const gate = createRenderGate(host, start);
    start();

    /* -- teardown ---------------------------------------------------------- */
    const onContextLost = (e: Event) => {
      e.preventDefault();
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      root.dataset.jungleGl = 'off';
    };
    canvas.addEventListener('webglcontextlost', onContextLost, false);

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      gate.destroy();
      unsubscribePush();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      delete root.dataset.jungleGl;

      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      /* Contexts are a scarce resource (browsers cap at ~16) and this app lets
         users flip themes repeatedly from the settings page. Dropping it
         explicitly is what keeps the tenth switch from evicting someone else's. */
      const lose = gl.getExtension('WEBGL_lose_context') as { loseContext(): void } | null;
      lose?.loseContext();
    };
  }, []);

  return (
    <div ref={hostRef} aria-hidden="true" className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

export default JungleBackground;
