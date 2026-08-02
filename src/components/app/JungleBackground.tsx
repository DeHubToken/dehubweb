import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useAppTheme } from '@/contexts/ThemeContext';
import { capPixelRatio, createRenderGate, releaseContext } from '@/lib/three/scene-helpers';
import { createFrameThrottle } from '@/lib/raf-throttle';
import { getJunglePush, subscribeJunglePush } from '@/lib/jungle-cinematic';

/**
 * Globally rendered "Jungle" background — a rainforest hollow opening onto a
 * bright misty clearing, with the silhouette of something monumental and very
 * old standing in the haze.
 *
 * THE COMPOSITION IS THE WHOLE THING.
 *
 * The reference for this theme is a painted jungle interior, and what makes
 * that image work is not the leaves — it is the DEPTH ORDER:
 *
 *   near   almost-black mossy roots and rock, framing the bottom corners
 *   mid    colossal buttressed trunks left and right, in shadow
 *   gap    a bright, desaturated blue-grey mist in the centre
 *   far    a vast ribbed ruin, barely readable inside that mist
 *   over   canopy and hanging lianas across the top, backlit
 *
 * You are looking OUT of somewhere dark INTO somewhere bright. Every decision
 * below serves that read, and the palette follows from it: the darks are
 * green-black and nearly flat, the mist is cool and low-contrast, and the only
 * warm light in the frame is the trail in the middle distance.
 *
 * An earlier version of this file drew the whole scene as one full-screen
 * fragment shader. That was the wrong instrument and it looked like it: a flat
 * shader can fake foliage, but it cannot produce parallax between five depth
 * planes, it cannot put a silhouette BEHIND mist and IN FRONT of a sky, and it
 * has no geometry to bend when the wind hits. Real depth needs a real camera.
 *
 * WHAT IS ACTUALLY DRAWN (10 draw calls total)
 *
 *   1  sky        one far plane, vertical gradient + the light in the gap
 *   2  monument   the ruin, an SDF on a plane, composited into the mist
 *   3  ground     the forest floor and the lit trail
 *   4  trunks     ONE merged geometry holding every tree, built on the CPU
 *   5  canopy     instanced leaf cards overhead
 *   6  understory instanced ferns at the trail edges
 *   7  vines      instanced hanging lianas
 *   8  rays       additive light shafts out of the gap
 *   9  motes      drifting spores
 *  10  frame      a screen-space vignette that darkens the corners
 *
 * Everything instanced uses InstancedBufferGeometry with a 6-float
 * per-instance record rather than THREE.InstancedMesh: a full instanceMatrix
 * is 16 floats to say what a position, a scale, a rotation and a phase say in
 * six, and the transform is reconstructed in the vertex shader for less than
 * the bandwidth costs.
 *
 * ZERO DOWNLOADED ART. Every texture is drawn with canvas 2D at boot (see the
 * atlas section) — a handful of 256px alpha maps, generated in well under a
 * frame. Nothing here can 404 on a deploy, which matters because this repo's
 * SPA catch-all answers a missing asset with an HTML page and a 200.
 *
 * THE WIND IS THE INTERACTION.
 *
 * Every plant in the scene reads three uniforms: a steady breeze, a gust, and
 * a scroll impulse. Scrolling the feed injects into the gust, so the understory
 * you are scrolling past bends and springs back. The impulse is signed by
 * scroll direction and decays on a spring, so it reads as air being pushed
 * rather than as an animation being triggered.
 *
 * COST. Tiers scale instance counts and buffer size, not features, so a low-end
 * phone gets the same picture with a thinner canopy rather than a different
 * scene. Low is ~390 quads, 30 fps and a 1 MP buffer; high is ~2000 quads at
 * 60 fps and 2 MP. There is a frame-time watchdog on top that demotes once.
 */
export function JungleBackground() {
  const { theme } = useAppTheme();
  if (theme !== 'jungle') return null;
  return <JungleScene />;
}

/* ==========================================================================
   Palette
   ==========================================================================
   Keep in sync with the token block at the top of styles/jungle-frame.css. The
   chrome locks to one accent; the canvas is allowed the full range, because a
   jungle that is one green is a golf course.
   ========================================================================== */

/** The mist in the gap. Cool, desaturated, and BRIGHTER than anything else. */
const MIST = new THREE.Color(0.706, 0.761, 0.769);
/** Sky above the canopy, seen only in slivers. */
const SKY = new THREE.Color(0.83, 0.87, 0.87);
/** Canopy shadow. Green-black — never pure black, or the frame dies. */
const SHADE = new THREE.Color(0.043, 0.075, 0.055);
/** Lit leaf face. */
const LEAF = new THREE.Color(0.322, 0.451, 0.196);
/** Backlit leaf — the sun coming THROUGH the blade. Much yellower. */
const LEAF_LIT = new THREE.Color(0.663, 0.741, 0.353);
/** Wet bark. */
const BARK = new THREE.Color(0.184, 0.176, 0.145);
/** Moss on the north side of everything. */
const MOSS = new THREE.Color(0.267, 0.361, 0.204);
/** The trail: warm ochre, the only warm note in the frame. */
const TRAIL = new THREE.Color(0.545, 0.475, 0.333);

/* ==========================================================================
   Device tier + budgets
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
  canopy: number;
  understory: number;
  vines: number;
  trunks: number;
  rays: number;
  motes: number;
  fps: number;
  maxPixels: number;
  maxRatio: number;
  /** Texture edge for the generated atlases. Halving this quarters the memory. */
  tex: number;
}

const BUDGETS: Record<Tier, Budget> = {
  low: {
    canopy: 200, understory: 110, vines: 60, trunks: 7, rays: 0, motes: 0,
    fps: 30, maxPixels: 1_000_000, maxRatio: 1.25, tex: 128,
  },
  mid: {
    canopy: 520, understory: 240, vines: 130, trunks: 11, rays: 4, motes: 420,
    fps: 60, maxPixels: 1_600_000, maxRatio: 1.5, tex: 256,
  },
  high: {
    canopy: 940, understory: 430, vines: 240, trunks: 15, rays: 6, motes: 900,
    fps: 60, maxPixels: 2_000_000, maxRatio: 1.5, tex: 256,
  },
};

/* ==========================================================================
   Procedural atlases
   ==========================================================================
   Canvas 2D, once, at boot. Three of these plus a bark stripe is every texture
   in the scene.

   These are ALPHA MAPS with colour variation baked in as luminance — the
   shaders tint them. Painting the final green here instead would mean a leaf
   overhead and a leaf in deep shade were the same pixel, which is exactly the
   flatness this scene is trying to avoid.
   ========================================================================== */

/** One leaf blade: a lens, drawn as two arcs, with a midrib. */
function drawLeaf(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  len: number,
  wide: number,
  rot: number,
  shade: number,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(0, -len);
  ctx.quadraticCurveTo(wide, 0, 0, len);
  ctx.quadraticCurveTo(-wide, 0, 0, -len);
  ctx.closePath();
  const g = ctx.createLinearGradient(-wide, 0, wide, 0);
  const lo = Math.round(shade * 150);
  const hi = Math.round(shade * 255);
  g.addColorStop(0, `rgb(${lo},${lo},${lo})`);
  g.addColorStop(0.55, `rgb(${hi},${hi},${hi})`);
  g.addColorStop(1, `rgb(${lo},${lo},${lo})`);
  ctx.fillStyle = g;
  ctx.fill();
  // Midrib. A leaf without one reads as a petal.
  ctx.strokeStyle = `rgba(0,0,0,0.28)`;
  ctx.lineWidth = Math.max(1, len * 0.035);
  ctx.beginPath();
  ctx.moveTo(0, -len * 0.92);
  ctx.lineTo(0, len * 0.92);
  ctx.stroke();
  ctx.restore();
}

function makeTexture(size: number, paint: (ctx: CanvasRenderingContext2D, s: number) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) paint(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

/** A cluster of blades radiating from a stem — one canopy card. */
function canopyTexture(size: number) {
  return makeTexture(size, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const r = s * (0.16 + Math.random() * 0.1);
      drawLeaf(
        ctx,
        s / 2 + Math.cos(a) * r,
        s / 2 + Math.sin(a) * r,
        s * (0.17 + Math.random() * 0.11),
        s * (0.055 + Math.random() * 0.035),
        a + Math.PI / 2,
        0.6 + Math.random() * 0.4,
      );
    }
  });
}

/** A frond: a central rachis with pinnae down both sides. */
function fernTexture(size: number) {
  return makeTexture(size, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const pairs = 13;
    for (let i = 0; i < pairs; i++) {
      const t = i / (pairs - 1);
      const y = s * (0.93 - t * 0.84);
      // Pinnae shorten toward the tip, which is what makes a frond a frond.
      const len = s * 0.3 * (1 - t * 0.72) + s * 0.02;
      const droop = 0.42 + t * 0.3;
      drawLeaf(ctx, s / 2 - len * 0.55, y, len * 0.5, s * 0.035, -droop, 0.55 + t * 0.4);
      drawLeaf(ctx, s / 2 + len * 0.55, y, len * 0.5, s * 0.035, droop, 0.55 + t * 0.4);
    }
    ctx.strokeStyle = 'rgba(200,200,200,0.55)';
    ctx.lineWidth = Math.max(1, s * 0.012);
    ctx.beginPath();
    ctx.moveTo(s / 2, s * 0.98);
    ctx.lineTo(s / 2, s * 0.08);
    ctx.stroke();
  });
}

/** A hanging liana: a thin strand with sparse leaves and a lit tip. */
function vineTexture(size: number) {
  return makeTexture(size, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(190,190,190,0.85)';
    ctx.lineWidth = Math.max(1, s * 0.02);
    ctx.beginPath();
    ctx.moveTo(s / 2, 0);
    // A slight wander, so a wall of vines does not read as a comb.
    for (let y = 0; y <= s; y += s / 12) {
      ctx.lineTo(s / 2 + Math.sin(y / s * 6) * s * 0.05, y);
    }
    ctx.stroke();
    for (let i = 0; i < 9; i++) {
      const t = 0.1 + (i / 9) * 0.86;
      const y = t * s;
      const x = s / 2 + Math.sin(t * 6) * s * 0.05;
      drawLeaf(ctx, x + (i % 2 ? 1 : -1) * s * 0.07, y, s * 0.055, s * 0.022,
        (i % 2 ? 1 : -1) * 1.1, 0.5 + t * 0.5);
    }
  });
}

/* ==========================================================================
   Shared GLSL
   ==========================================================================
   One wind function, used by everything that grows. Keeping it in a single
   string is what stops the canopy and the understory drifting out of phase
   with each other, which instantly reads as two separate effects.
   ========================================================================== */

const WIND_GLSL = `
uniform float uTime;
/** Steady breeze amplitude. */
uniform float uWind;
/** Scroll impulse, signed, spring-decayed on the CPU. */
uniform float uGust;

/* Displace a point by the wind.
   `h` is 0 at the anchor (root, or the branch the card hangs from) and 1 at the
   free end — so everything pivots where it is actually attached instead of
   sliding sideways as a whole.
   `phase` decorrelates neighbours; without it the entire forest breathes in
   unison, which is the single most artificial thing a wind system can do. */
vec3 windOffset(vec3 pos, float h, float phase, float stiffness) {
  float w = h * h * stiffness;
  float t = uTime * 1.1 + phase * 6.2831;
  /* Two incommensurate frequencies, so the loop never audibly repeats. */
  float sway = sin(t) * 0.62 + sin(t * 2.37 + 1.7) * 0.24;
  float flutter = sin(t * 6.1 + pos.y * 3.0) * 0.08;
  vec3 o = vec3(0.0);
  o.x += (sway + flutter) * uWind * w;
  o.z += (sway * 0.4) * uWind * w;
  /* The gust pushes DOWN the trail (-Z) and lifts slightly, because air moving
     through a hollow is not a sideways nudge. */
  o.z -= uGust * w * 1.35;
  o.y += abs(uGust) * w * 0.35;
  o.x += uGust * w * 0.5 * sin(phase * 12.0);
  return o;
}
`;

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
    let tier = detectTier();
    let budget = BUDGETS[tier];

    /* -- renderer ---------------------------------------------------------- */
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: false,
        antialias: false, // every edge here is alpha-tested foliage; MSAA buys nothing
        depth: true,
        powerPreference: 'high-performance',
      });
    } catch {
      root.dataset.jungleGl = 'off';
      return () => {
        delete root.dataset.jungleGl;
      };
    }

    renderer.setSize(window.innerWidth, window.innerHeight);
    capPixelRatio(renderer, window.innerWidth, window.innerHeight, budget.maxPixels, budget.maxRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    /* Filmic, because the gap is genuinely brighter than the shadows by a large
       factor and a linear clamp turns the mist into a white hole. */
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setClearColor(0x0a0f0c, 1);

    const scene = new THREE.Scene();
    /* Fog does most of the depth work. The far plane sits just past the
       monument, so the ruin is dissolving into it rather than sitting on it. */
    scene.fog = new THREE.Fog(MIST.clone().multiplyScalar(0.92), 14, 78);

    const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.5, 120);
    const CAM_BASE = new THREE.Vector3(0, 1.75, 9.5);
    camera.position.copy(CAM_BASE);
    camera.lookAt(0, 2.4, -20);

    /* -- shared uniforms ---------------------------------------------------
       One object, referenced by every material, so there is exactly one place
       the wind and the light live. */
    const U = {
      uTime: { value: 0 },
      uWind: { value: 1 },
      uGust: { value: 0 },
      uFogColor: { value: new THREE.Color().copy(MIST) },
      uFogNear: { value: 14 },
      uFogFar: { value: 78 },
    };

    /* Fog has to be applied by hand: these are ShaderMaterials, so three's fog
       chunks are not injected. Doing it in one shared snippet keeps the plants
       and the ground receding at the same rate, which is what sells the depth. */
    const FOG_GLSL = `
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
vec3 applyFog(vec3 col, float depth) {
  float f = smoothstep(uFogNear, uFogFar, depth);
  return mix(col, uFogColor, f);
}
`;

    const disposables: Array<{ dispose(): void }> = [];
    const track = <T extends { dispose(): void }>(x: T): T => {
      disposables.push(x);
      return x;
    };

    /* ======================================================================
       1. SKY
       ======================================================================
       A single plane at the back, big enough to fill the frustum there. It is
       NOT a skybox: nothing in this scene ever looks up or turns around, so six
       faces would be five wasted.
       ====================================================================== */
    {
      const mat = track(
        new THREE.ShaderMaterial({
          depthWrite: false,
          uniforms: {
            uMist: { value: new THREE.Color().copy(MIST) },
            uSky: { value: new THREE.Color().copy(SKY) },
            uShade: { value: new THREE.Color().copy(SHADE) },
          },
          vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
          fragmentShader: `
uniform vec3 uMist;
uniform vec3 uSky;
uniform vec3 uShade;
varying vec2 vUv;
void main() {
  /* Bright at the horizon (the clearing), cooler above, and darkening at the
     edges where the canopy closes in. The light source in this picture is at
     eye level and far away, not overhead. */
  float glow = exp(-pow((vUv.y - 0.44) * 2.6, 2.0));
  vec3 col = mix(uSky, uMist, smoothstep(0.85, 0.25, vUv.y));
  col = mix(col, vec3(1.0, 0.985, 0.94), glow * 0.55);
  /* Lateral falloff: the gap is a hole in a wall of trees, so it has sides. */
  float sides = smoothstep(0.0, 0.34, vUv.x) * smoothstep(1.0, 0.66, vUv.x);
  col = mix(uShade, col, 0.25 + 0.75 * sides);
  gl_FragColor = vec4(col, 1.0);
}`,
        }),
      );
      const geo = track(new THREE.PlaneGeometry(220, 120));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 14, -72);
      mesh.renderOrder = -10;
      scene.add(mesh);
    }

    /* ======================================================================
       2. THE MONUMENT
       ======================================================================
       The ruin in the haze. This is the single element that makes the frame
       feel like somewhere rather than like foliage, and it is one plane with an
       SDF on it — geometry would be absurd for something this dissolved.

       It reads as: a colossal ribbed dome, half sunk, seen through 60 m of mist.
       Contrast is deliberately almost nothing. The moment it is legible it
       stops being mysterious and starts being a spaceship.
       ====================================================================== */
    {
      const mat = track(
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          uniforms: { uTime: U.uTime, uMist: { value: new THREE.Color().copy(MIST) } },
          vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
          fragmentShader: `
uniform float uTime;
uniform vec3 uMist;
varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x),
             mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y);
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  p.y += 0.42;                      /* sink it below the treeline */

  /* The shell: an ellipse, cut flat at the bottom. */
  float dome = length(p * vec2(1.0, 1.55)) - 0.72;
  float body = smoothstep(0.02, -0.03, dome) * step(-0.02, p.y + 0.6);

  /* Ribs. Radial, so they converge at the crown the way a real vault does. */
  float ang = atan(p.x, p.y + 0.35);
  float ribs = abs(sin(ang * 11.0));
  ribs = smoothstep(0.55, 0.98, ribs);

  /* A broken edge, so the top is ruined rather than cut. */
  float crumble = noise(p * 7.0 + 3.0) * 0.09;
  body *= smoothstep(0.03 + crumble, -0.02, dome);

  float mass = body * (0.55 + 0.45 * ribs);

  /* Everything above is a MASK. The colour is just mist, slightly darker —
     which is what an object that far away through this much water vapour
     actually looks like. */
  vec3 col = uMist * mix(0.86, 0.7, ribs);

  /* Drifting haze eats into it, so the silhouette is never fully resolved. */
  float haze = noise(vUv * 3.0 + vec2(uTime * 0.014, 0.0));
  float a = mass * 0.5 * (0.55 + 0.45 * haze);
  a *= smoothstep(0.0, 0.22, vUv.y);

  gl_FragColor = vec4(col, a);
}`,
        }),
      );
      const geo = track(new THREE.PlaneGeometry(74, 46));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(-2, 15, -60);
      mesh.renderOrder = -9;
      scene.add(mesh);
    }

    /* ======================================================================
       3. GROUND
       ======================================================================
       One plane, procedurally shaded: leaf litter at the edges, a compacted lit
       trail down the middle, wet patches catching the sky.
       ====================================================================== */
    {
      const mat = track(
        new THREE.ShaderMaterial({
          uniforms: {
            uTime: U.uTime,
            uFogColor: U.uFogColor,
            uFogNear: U.uFogNear,
            uFogFar: U.uFogFar,
            uShade: { value: new THREE.Color().copy(SHADE) },
            uTrail: { value: new THREE.Color().copy(TRAIL) },
            uMoss: { value: new THREE.Color().copy(MOSS) },
          },
          vertexShader: `
varying vec2 vUv;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,
          fragmentShader: `
uniform vec3 uShade;
uniform vec3 uTrail;
uniform vec3 uMoss;
varying vec2 vUv;
varying float vDepth;
${FOG_GLSL}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x),
             mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {
  return noise(p) * 0.55 + noise(p * 2.3 + 4.0) * 0.3 + noise(p * 5.1) * 0.15;
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(60.0, 120.0);

  /* The trail wanders — a path that is a straight corridor reads as a road. */
  float bend = sin(p.y * 0.045) * 3.4 + sin(p.y * 0.017) * 2.0;
  float d = abs(p.x - bend);
  float onTrail = smoothstep(4.6, 1.4, d);

  float litter = fbm(p * 0.55);
  vec3 col = mix(uShade * 1.25, uMoss * 0.7, litter);
  col = mix(col, uTrail, onTrail * (0.55 + 0.35 * fbm(p * 1.7)));

  /* Wet ground bounces the gap's light back up. Only on the trail, and only in
     the middle distance, which is where the reference has its brightest floor. */
  float wet = smoothstep(0.62, 0.95, fbm(p * 0.9 + 11.0)) * onTrail;
  col += vec3(0.42, 0.45, 0.4) * wet * 0.35;

  /* Light falls off hard toward the camera: we are standing in shadow. */
  float toGap = smoothstep(-40.0, 12.0, p.y);
  col *= mix(0.22, 1.15, toGap);

  gl_FragColor = vec4(applyFog(col, vDepth), 1.0);
}`,
        }),
      );
      const geo = track(new THREE.PlaneGeometry(60, 120, 1, 1));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0, -35);
      scene.add(mesh);
    }

    /* ======================================================================
       4. TRUNKS
       ======================================================================
       Built on the CPU into ONE merged geometry. Every trunk is a tapered tube
       with a wandering centreline and a flared, lobed base — the buttress roots
       that make a rainforest tree read as a rainforest tree rather than a
       telegraph pole.

       Merged rather than instanced BECAUSE the variety is the point: instancing
       would give fifteen copies of one tree, and the eye finds that immediately
       on a shape this large and this close.
       ====================================================================== */
    {
      const RINGS = 9;
      const SIDES = 9;
      const positions: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const sway: number[] = [];
      const indices: number[] = [];

      /* Placed by hand-ish rule rather than at random: two heroes framing the
         near corners, then a receding file down each side of the trail. A
         random scatter puts trunks in the middle of the gap and closes it. */
      const layout: Array<{ x: number; z: number; r: number; h: number }> = [];
      layout.push({ x: -5.2, z: 4.5, r: 1.5, h: 26 });
      layout.push({ x: 6.1, z: 3.0, r: 1.7, h: 28 });
      for (let i = 0; i < budget.trunks - 2; i++) {
        const side = i % 2 ? 1 : -1;
        const t = i / Math.max(1, budget.trunks - 3);
        layout.push({
          x: side * (4.6 + Math.sin(i * 2.3) * 2.6 + t * 3.5),
          z: -3 - t * 40 - (i % 3) * 2.5,
          r: 0.62 + Math.sin(i * 1.7) * 0.3 + 0.5 * (1 - t),
          h: 17 + Math.sin(i * 3.1) * 5 + t * 6,
        });
      }

      let vertexBase = 0;
      for (let ti = 0; ti < layout.length; ti++) {
        const tree = layout[ti];
        const seed = ti * 7.13;
        for (let ri = 0; ri <= RINGS; ri++) {
          const v = ri / RINGS;
          const y = Math.pow(v, 0.85) * tree.h;

          /* Taper, plus the buttress flare in the bottom 12%. */
          const taper = 1 - v * 0.72;
          const flare = 1 + Math.pow(Math.max(0, 1 - v / 0.12), 2.2) * 1.35;

          /* Lean and wander. Real trunks are not plumb. */
          const cx = tree.x + Math.sin(v * 1.6 + seed) * v * 1.5;
          const cz = tree.z + Math.cos(v * 1.2 + seed) * v * 0.9;

          for (let si = 0; si <= SIDES; si++) {
            const u = si / SIDES;
            const a = u * Math.PI * 2;
            /* Lobes: the flutes between buttresses. They fade out with height,
               which is exactly what the real thing does. */
            const lobe = 1 + Math.sin(a * 5 + seed) * 0.16 * Math.max(0, 1 - v / 0.3);
            const r = tree.r * taper * flare * lobe;

            positions.push(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
            normals.push(Math.cos(a), 0.12, Math.sin(a));
            uvs.push(u * 3, v * 6);
            /* Trunks barely move. A swaying tree this thick would look absurd;
               it is the crown that moves, and that is the canopy's job. */
            sway.push(v * v * 0.16);
          }
        }

        const ringVerts = SIDES + 1;
        for (let ri = 0; ri < RINGS; ri++) {
          for (let si = 0; si < SIDES; si++) {
            const a = vertexBase + ri * ringVerts + si;
            const b = a + ringVerts;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
          }
        }
        vertexBase += (RINGS + 1) * ringVerts;
      }

      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
      geo.setIndex(indices);

      const mat = track(
        new THREE.ShaderMaterial({
          uniforms: {
            uTime: U.uTime,
            uWind: U.uWind,
            uGust: U.uGust,
            uFogColor: U.uFogColor,
            uFogNear: U.uFogNear,
            uFogFar: U.uFogFar,
            uBark: { value: new THREE.Color().copy(BARK) },
            uMoss: { value: new THREE.Color().copy(MOSS) },
            uShade: { value: new THREE.Color().copy(SHADE) },
          },
          vertexShader: `
attribute float aSway;
varying vec2 vUv;
varying vec3 vNormal;
varying float vDepth;
varying float vHeight;
${WIND_GLSL}
void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vHeight = position.y;
  vec3 p = position + windOffset(position, aSway, position.x * 0.31, 1.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,
          fragmentShader: `
uniform vec3 uBark;
uniform vec3 uMoss;
uniform vec3 uShade;
varying vec2 vUv;
varying vec3 vNormal;
varying float vDepth;
varying float vHeight;
${FOG_GLSL}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x),
             mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y);
}

void main() {
  /* Bark: stretched vertically, because bark fissures run with the grain. */
  float grain = noise(vUv * vec2(9.0, 2.2));
  float fissure = noise(vUv * vec2(26.0, 3.0));
  vec3 col = mix(uBark * 0.68, uBark * 1.25, grain);
  col *= 0.72 + 0.42 * smoothstep(0.35, 0.75, fissure);

  /* Moss climbs from the base and prefers the side away from the gap. */
  float damp = smoothstep(9.0, 0.0, vHeight);
  float facing = smoothstep(0.1, 0.9, -vNormal.z * 0.5 + 0.5);
  col = mix(col, uMoss, damp * facing * 0.62 * smoothstep(0.4, 0.8, noise(vUv * 5.0)));

  /* THE RIM IS THE WHOLE TRICK. These trunks are between the camera and the
     bright gap, so they are lit only at their silhouette edge. Without this
     they are black cylinders; with it they are massive and backlit. */
  float rim = pow(1.0 - abs(vNormal.z), 3.0);
  col += vec3(0.55, 0.6, 0.55) * rim * 0.5;

  /* Otherwise: deep shadow. We are on the dark side of these. */
  col = mix(uShade * 0.85, col, 0.42);

  gl_FragColor = vec4(applyFog(col, vDepth), 1.0);
}`,
        }),
      );
      scene.add(new THREE.Mesh(geo, mat));
    }

    /* ======================================================================
       5-7. INSTANCED FOLIAGE
       ======================================================================
       One builder for canopy, understory and vines. Each instance is six
       floats: offset(3), scale, rotation, phase — reconstructed in the vertex
       shader. A full 4x4 instanceMatrix would be 16 floats to say the same
       thing, and these are cards, so most of it would be identity.
       ====================================================================== */

    type FoliageOpts = {
      count: number;
      texture: THREE.Texture;
      /** Places one instance. Returns null to skip (used to keep the gap clear). */
      place: (i: number) => { pos: THREE.Vector3; scale: number; rot: number } | null;
      /** 0 = anchored at the card's centre, 1 = anchored at its top (vines). */
      hang: number;
      stiffness: number;
      /** How much backlight bleeds through the blade. */
      translucency: number;
      tint: THREE.Color;
      tintLit: THREE.Color;
      renderOrder: number;
    };

    function addFoliage(o: FoliageOpts) {
      const offsets = new Float32Array(o.count * 3);
      const scales = new Float32Array(o.count);
      const rots = new Float32Array(o.count);
      const phases = new Float32Array(o.count);

      let n = 0;
      // Try harder than `count` times: `place` rejects positions that would
      // block the gap, and a rejected slot must not become a hole.
      for (let i = 0; i < o.count * 4 && n < o.count; i++) {
        const p = o.place(i);
        if (!p) continue;
        offsets[n * 3] = p.pos.x;
        offsets[n * 3 + 1] = p.pos.y;
        offsets[n * 3 + 2] = p.pos.z;
        scales[n] = p.scale;
        rots[n] = p.rot;
        phases[n] = Math.random();
        n++;
      }
      if (n === 0) return;

      const geo = track(new THREE.InstancedBufferGeometry());
      // A unit quad. `hang` shifts its pivot to the top edge for vines.
      const y0 = -0.5 + o.hang * 0.5;
      const y1 = 0.5 + o.hang * 0.5;
      geo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [-0.5, y0, 0, 0.5, y0, 0, 0.5, y1, 0, -0.5, y1, 0],
          3,
        ),
      );
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets.subarray(0, n * 3), 3));
      geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales.subarray(0, n), 1));
      geo.setAttribute('aRot', new THREE.InstancedBufferAttribute(rots.subarray(0, n), 1));
      geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases.subarray(0, n), 1));
      geo.instanceCount = n;

      const mat = track(
        new THREE.ShaderMaterial({
          transparent: true,
          /* alphaTest rather than blending: these overlap heavily and sorting
             thousands of blended quads correctly is not affordable. A cutout
             writes depth and simply does not have the problem. */
          alphaTest: 0.42,
          depthWrite: true,
          side: THREE.DoubleSide,
          uniforms: {
            uTime: U.uTime,
            uWind: U.uWind,
            uGust: U.uGust,
            uFogColor: U.uFogColor,
            uFogNear: U.uFogNear,
            uFogFar: U.uFogFar,
            uMap: { value: o.texture },
            uTint: { value: o.tint.clone() },
            uTintLit: { value: o.tintLit.clone() },
            uStiff: { value: o.stiffness },
            uTrans: { value: o.translucency },
            uHang: { value: o.hang },
          },
          vertexShader: `
attribute vec3 aOffset;
attribute float aScale;
attribute float aRot;
attribute float aPhase;
uniform float uStiff;
uniform float uHang;
varying vec2 vUv;
varying float vDepth;
varying float vPhase;
${WIND_GLSL}
void main() {
  vUv = uv;
  vPhase = aPhase;

  vec3 local = position * aScale;

  /* Roll around Z so a card is not obviously a rectangle. */
  float c = cos(aRot), s = sin(aRot);
  local.xy = vec2(local.x * c - local.y * s, local.x * s + local.y * c);

  /* Wind anchor: for a vine the top edge is fixed (uv.y=1 is the attachment),
     for a leaf card the base is. */
  float h = mix(uv.y, 1.0 - uv.y, uHang);
  vec3 world = aOffset + local + windOffset(aOffset, h, aPhase, uStiff);

  /* Billboard on Y only. Full spherical billboarding makes ground plants tip
     toward the camera and lose contact with the floor. */
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,
          fragmentShader: `
uniform sampler2D uMap;
uniform vec3 uTint;
uniform vec3 uTintLit;
uniform float uTrans;
varying vec2 vUv;
varying float vDepth;
varying float vPhase;
${FOG_GLSL}
void main() {
  vec4 tex = texture2D(uMap, vUv);
  if (tex.a < 0.42) discard;

  /* The texture's luminance is a shading MASK, not a colour: it decides where
     on the blade we are, and the tint decides what a blade is made of. */
  float shade = tex.r;

  /* Backlight. Leaves between the camera and the gap glow through, and it is
     strongest at the thin edges — hence the (1 - shade) weighting. */
  float back = uTrans * (0.35 + 0.65 * (1.0 - shade));
  vec3 col = mix(uTint, uTintLit, clamp(shade * 0.55 + back, 0.0, 1.0));

  /* Per-instance variation, or a thousand identical cards read as wallpaper. */
  col *= 0.78 + 0.44 * vPhase;

  gl_FragColor = vec4(applyFog(col, vDepth), 1.0);
}`,
        }),
      );

      const mesh = new THREE.Mesh(geo, mat);
      /* The scene is composed by hand, so frustum culling on a merged bound is
         both wrong (the wind moves verts outside it) and pointless (there is
         one draw call per layer). */
      mesh.frustumCulled = false;
      mesh.renderOrder = o.renderOrder;
      scene.add(mesh);
    }

    const texCanopy = track(canopyTexture(budget.tex));
    const texFern = track(fernTexture(budget.tex));
    const texVine = track(vineTexture(budget.tex));

    /** Keep the centre of the frame clear: that hole IS the composition. */
    const blocksGap = (x: number, z: number) => z < -8 && Math.abs(x) < 7.5;

    // -- canopy ------------------------------------------------------------
    addFoliage({
      count: budget.canopy,
      texture: texCanopy,
      hang: 0,
      stiffness: 1.0,
      translucency: 0.85,
      tint: SHADE.clone().multiplyScalar(1.5),
      tintLit: LEAF_LIT.clone(),
      renderOrder: 2,
      place: (i) => {
        const x = (Math.random() - 0.5) * 46;
        const z = 8 - Math.random() * 56;
        /* Denser and lower at the sides; the middle of the roof stays open so
           light gets to the trail. */
        const edge = Math.min(1, Math.abs(x) / 16);
        if (Math.abs(x) < 9 && Math.random() > 0.25 + edge) return null;
        const y = 8.5 + Math.random() * 12 - edge * 3.5;
        return {
          pos: new THREE.Vector3(x, y, z),
          scale: 3.2 + Math.random() * 4.4,
          rot: (Math.random() - 0.5) * 1.6,
        };
      },
    });

    // -- understory --------------------------------------------------------
    addFoliage({
      count: budget.understory,
      texture: texFern,
      hang: 0,
      stiffness: 1.45, // the softest thing in the scene: this is what scroll moves
      translucency: 0.5,
      tint: SHADE.clone().multiplyScalar(1.9),
      tintLit: LEAF.clone(),
      renderOrder: 3,
      place: () => {
        const z = 7 - Math.random() * 46;
        /* Hug the trail edges. The bend has to match the ground shader's, or
           the ferns grow through the path. */
        const bend = Math.sin(-z * 0.045) * 3.4 + Math.sin(-z * 0.017) * 2.0;
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = bend + side * (2.6 + Math.random() * 12);
        if (blocksGap(x, z)) return null;
        const s = 1.5 + Math.random() * 2.3;
        return {
          pos: new THREE.Vector3(x, s * 0.42, z),
          scale: s,
          rot: (Math.random() - 0.5) * 0.5,
        };
      },
    });

    // -- vines -------------------------------------------------------------
    addFoliage({
      count: budget.vines,
      texture: texVine,
      hang: -1, // pivot at the top edge: these hang
      stiffness: 1.9,
      translucency: 0.7,
      tint: SHADE.clone().multiplyScalar(1.4),
      tintLit: LEAF_LIT.clone().multiplyScalar(0.9),
      renderOrder: 4,
      place: () => {
        const x = (Math.random() - 0.5) * 40;
        const z = 6 - Math.random() * 44;
        /* Lianas across the gap are the reference image's best detail — they
           read as depth cues against the bright mist. So these are ALLOWED in
           the centre, unlike everything else. */
        return {
          pos: new THREE.Vector3(x, 11 + Math.random() * 7, z),
          scale: 4 + Math.random() * 7,
          rot: (Math.random() - 0.5) * 0.16,
        };
      },
    });

    /* ======================================================================
       8. LIGHT SHAFTS
       ======================================================================
       Additive quads leaning out of the gap. Not volumetrics — a handful of
       soft planes is what matte painters use for this and it is three orders
       of magnitude cheaper.
       ====================================================================== */
    if (budget.rays > 0) {
      const mat = track(
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          uniforms: { uTime: U.uTime },
          vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
          fragmentShader: `
uniform float uTime;
varying vec2 vUv;
void main() {
  /* Soft across, fading at both ends — a shaft has no hard edge and does not
     reach the floor. */
  float across = smoothstep(0.0, 0.42, vUv.x) * smoothstep(1.0, 0.58, vUv.x);
  float along = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.35, vUv.y);
  /* Slow breathing, so dust drifting through is implied. */
  float breathe = 0.75 + 0.25 * sin(uTime * 0.35 + vUv.x * 3.0);
  gl_FragColor = vec4(vec3(0.85, 0.87, 0.72) * across * along * breathe * 0.16, 1.0);
}`,
        }),
      );
      const geo = track(new THREE.PlaneGeometry(7, 40));
      for (let i = 0; i < budget.rays; i++) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(-9 + i * 3.4 + Math.sin(i) * 1.5, 11, -22 - i * 3);
        m.rotation.set(-0.55, 0.12 * (i - budget.rays / 2), 0.2 * Math.sin(i));
        m.renderOrder = 5;
        scene.add(m);
      }
    }

    /* ======================================================================
       9. MOTES
       ====================================================================== */
    if (budget.motes > 0) {
      const pos = new Float32Array(budget.motes * 3);
      const ph = new Float32Array(budget.motes);
      for (let i = 0; i < budget.motes; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 34;
        pos[i * 3 + 1] = Math.random() * 13;
        pos[i * 3 + 2] = 6 - Math.random() * 44;
        ph[i] = Math.random();
      }
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(ph, 1));
      const mat = track(
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          uniforms: { uTime: U.uTime },
          vertexShader: `
attribute float aPhase;
uniform float uTime;
varying float vA;
void main() {
  vec3 p = position;
  /* Rise and wander. Spores do not fall. */
  p.y += mod(uTime * (0.14 + aPhase * 0.3) + aPhase * 13.0, 13.0);
  p.x += sin(uTime * 0.4 + aPhase * 20.0) * 0.7;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  /* Fade in the distance and near the top, so they enter and leave rather
     than popping. */
  vA = (0.35 + 0.65 * aPhase) * smoothstep(60.0, 12.0, -mv.z) * smoothstep(13.0, 8.0, p.y);
  gl_PointSize = (2.0 + aPhase * 2.5) * (18.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`,
          fragmentShader: `
varying float vA;
void main() {
  /* Round, soft. A square mote is a bug report. */
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d) * vA;
  gl_FragColor = vec4(vec3(0.95, 0.96, 0.82), a);
}`,
        }),
      );
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      pts.renderOrder = 6;
      scene.add(pts);
    }

    /* ======================================================================
       10. FRAME
       ======================================================================
       A screen-space vignette drawn last. The reference's corners are almost
       black, and that is what makes the gap read as bright — the scene itself
       is not actually that contrasty. This also guarantees legible chrome over
       the corners, where side panels sit.
       ====================================================================== */
    const overlayScene = new THREE.Scene();
    const overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    {
      const geo = track(new THREE.PlaneGeometry(2, 2));
      const mat = track(
        new THREE.ShaderMaterial({
          transparent: true,
          depthTest: false,
          depthWrite: false,
          uniforms: { uShade: { value: new THREE.Color().copy(SHADE) } },
          vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,
          fragmentShader: `
uniform vec3 uShade;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  /* Elliptical, heavier at the bottom: the forest floor near the camera is in
     full shadow in the reference. */
  float v = length(p * vec2(0.78, 0.92) + vec2(0.0, 0.16));
  float a = smoothstep(0.62, 1.5, v) * 0.88;
  gl_FragColor = vec4(uShade * 0.5, a);
}`,
        }),
      );
      overlayScene.add(new THREE.Mesh(geo, mat));
    }

    /* ======================================================================
       Interaction
       ====================================================================== */

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) U.uWind.value = 0.12;

    // -- pointer parallax ---------------------------------------------------
    let targetYaw = 0;
    let targetPitch = 0;
    let yaw = 0;
    let pitch = 0;
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      targetYaw = ((e.clientX / Math.max(1, window.innerWidth)) * 2 - 1) * 0.055;
      targetPitch = ((e.clientY / Math.max(1, window.innerHeight)) * 2 - 1) * 0.03;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    /* -- scroll ------------------------------------------------------------
       Two separate effects from one signal:

         gust     scroll VELOCITY, spring-decayed. This is the "plants wave as
                  you scroll past them" ask — the understory is the softest
                  thing in the scene (stiffness 1.45) so it takes the most.
         walk     scroll POSITION, eased. The camera creeps down the trail as
                  the feed scrolls, so the jungle has somewhere to go.

       Listening in the CAPTURE phase on document is what makes this work at
       all: the feed is not always the window scroller — several routes scroll
       an inner container, and a plain window listener sees nothing there.
       Scroll events do not bubble, but they DO capture. */
    let gust = 0;
    let gustVel = 0;
    let walkTarget = 0;
    let walk = 0;
    let lastScroll = -1;
    let lastScrollAt = 0;

    const onScroll = (e: Event) => {
      const t = e.target as (HTMLElement & Document) | null;
      let top = 0;
      let range = 1;
      if (!t || t === (document as unknown as HTMLElement) || t === (document.documentElement as HTMLElement)) {
        top = window.scrollY;
        range = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      } else if (t instanceof HTMLElement) {
        top = t.scrollTop;
        range = Math.max(1, t.scrollHeight - t.clientHeight);
      }

      const now = performance.now();
      if (lastScroll >= 0) {
        const dt = Math.max(16, now - lastScrollAt);
        const px = top - lastScroll;
        /* Normalised to a viewport per second, then clamped: a fling on a
           trackpad can be thousands of pixels in one event, and an unclamped
           impulse folds every plant flat. */
        const v = (px / dt) * 1000 / Math.max(1, window.innerHeight);
        gustVel += Math.max(-2.4, Math.min(2.4, v)) * 0.09;
      }
      lastScroll = top;
      lastScrollAt = now;
      walkTarget = Math.min(1, top / range);

      if (gate.isActive() && raf === null) start();
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });

    // -- the game's cinematic dolly ----------------------------------------
    let push = getJunglePush();
    const unsubscribePush = subscribeJunglePush((v) => {
      push = v;
      if (gate.isActive() && raf === null) start();
    });

    /* ======================================================================
       Loop
       ====================================================================== */
    let raf: number | null = null;
    let throttle = createFrameThrottle(budget.fps);
    const clock = new THREE.Clock();
    let slowFrames = 0;
    let demoted = false;
    let lastFrame = performance.now();

    /** One demotion, never back up. An oscillating quality level looks worse
     *  than the lower one permanently would. */
    function demote() {
      if (demoted || tier === 'low') return;
      demoted = true;
      tier = tier === 'high' ? 'mid' : 'low';
      budget = BUDGETS[tier];
      throttle = createFrameThrottle(budget.fps);
      /* Rebuilding the whole scene graph mid-session would stutter far worse
         than the frames being dropped. Cutting the buffer is most of the win
         and is instant. */
      capPixelRatio(renderer, window.innerWidth, window.innerHeight, budget.maxPixels, budget.maxRatio);
    }

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      capPixelRatio(renderer, w, h, budget.maxPixels, budget.maxRatio);
    }
    window.addEventListener('resize', resize, { passive: true });

    function frame() {
      if (!gate.isActive()) {
        raf = null;
        return;
      }
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      if (!throttle(now)) return;
      if (renderer.getContext().isContextLost()) return;

      const dt = now - lastFrame;
      lastFrame = now;
      if (push === 0 && dt > 34 && dt < 500) {
        if (++slowFrames > 90) demote();
      } else if (dt < 24) {
        slowFrames = Math.max(0, slowFrames - 1);
      }

      U.uTime.value = clock.getElapsedTime();

      /* Gust as a damped spring toward rest. Critically damped-ish: it has to
         settle without ringing, or the ferns wobble like jelly. */
      gustVel *= 0.86;
      gust += gustVel;
      gust *= 0.9;
      U.uGust.value = reduced ? 0 : gust;

      // Camera: pointer parallax + scroll walk + the game's dolly.
      yaw += (targetYaw - yaw) * 0.05;
      pitch += (targetPitch - pitch) * 0.05;
      walk += (walkTarget - walk) * 0.035;

      camera.position.x = CAM_BASE.x + yaw * 9;
      camera.position.y = CAM_BASE.y - pitch * 3 + walk * 0.25;
      camera.position.z = CAM_BASE.z - walk * 7 - push * 16;
      camera.lookAt(yaw * 5, 2.4 - pitch * 2, -20);

      renderer.render(scene, camera);
      /* The vignette is a second, cleared-depth pass rather than part of the
         scene: as an object it would need to be in front of everything, and
         anything that gets between the camera and the near foliage will
         eventually z-fight with it. */
      renderer.autoClear = false;
      renderer.render(overlayScene, overlayCam);
      renderer.autoClear = true;
    }

    function start() {
      if (raf === null) {
        lastFrame = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }

    const gate = createRenderGate(host, start);
    start();

    /* ======================================================================
       Teardown
       ====================================================================== */
    const onContextLost = (e: Event) => {
      e.preventDefault();
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
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
      document.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      delete root.dataset.jungleGl;

      /* Every geometry, material and texture went through track(). Themes get
         switched repeatedly from the settings page, so a leak here is a leak
         per switch, and the canvas textures are the expensive part. */
      for (const d of disposables) {
        try {
          d.dispose();
        } catch {
          // a double dispose is not worth crashing an unmount over
        }
      }
      releaseContext(renderer);
    };
  }, []);

  return (
    <div ref={hostRef} aria-hidden="true" className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

export default JungleBackground;
