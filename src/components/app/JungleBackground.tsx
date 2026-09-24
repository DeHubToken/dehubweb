import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useAppTheme } from '@/contexts/ThemeContext';
import { capPixelRatio, createRenderGate, releaseContext } from '@/lib/three/scene-helpers';
import { createFrameThrottle } from '@/lib/raf-throttle';
import { getJunglePush, subscribeJunglePush } from '@/lib/jungle-cinematic';
import { getJungleMood, subscribeJungleMood, type JungleMood } from '@/lib/jungle-mood';

/**
 * Globally rendered "Jungle" background — a rainforest floor at blade height,
 * backlit through a broken canopy.
 *
 * THE LOOK IS ATMOSPHERE, NOT POLYGONS.
 *
 * The previous pass was a clean low-poly forest under a blue sky, and it read
 * as a park. What makes a scene read as JUNGLE — and what makes it read as
 * expensive — is almost entirely light and air, not triangle count:
 *
 *   LAYERED DEPTH. Foreground leaves, understory, trunks, a mid canopy, giant
 *   emergents and three receding ridgelines, each one paler than the last in a
 *   humid green-gold haze (FogExp2 matched exactly to the sky's horizon, so the
 *   far layers dissolve rather than end).
 *
 *   BACKLIGHT. The sun sits behind the forest, up and to the left. Foliage gets
 *   a cheap translucency term (see FOLIAGE_TRANSLUCENCY) so leaves between the
 *   camera and the sun glow, and light shafts fall through gaps in a canopy
 *   ceiling toward the viewer.
 *
 *   PLANT VOCABULARY. Buttress-rooted pale-barked giants, curved palms, banana
 *   and elephant-ear leaves, ferns, hanging lianas, moss on the up-facing side
 *   of every rock and root. Round "lollipop" trees alone never read as jungle.
 *
 *   BAKED OCCLUSION. Every crown darkens toward its underside, every trunk
 *   toward its foot, the ground around each trunk. It is written into vertex
 *   colours at boot, so it costs nothing per frame.
 *
 * WHAT STAYS CHEAP (the laptop budget)
 *
 *   - Nothing is downloaded. Every mesh and every shader is generated here.
 *   - ~12 draw calls. Plants merge into two batches (foliage, wood/stone);
 *     grass and flowers are instanced.
 *   - No shadow maps, no render targets, no post chain. Dappled sun on the
 *     floor is a few sines in the ground shader; the "bloom" is an additive
 *     gradient in the vignette pass.
 *   - THE SCENE IS STILL AT REST, and the loop parks when nothing moves, so
 *     an idle page costs zero GPU. The pointer stirs the plants it is over,
 *     and pollen drifts only while that is happening.
 *   - Three budgets by device, plus a live demotion when frames run long.
 *   - The canvas fades in after its first frame instead of popping.
 */
export function JungleBackground() {
  const { theme } = useAppTheme();
  if (theme !== 'jungle') return null;
  return <JungleScene />;
}

/* ==========================================================================
   Palette
   ==========================================================================
   Humid, backlit, late morning. The horizon colour IS the fog colour — that
   one equality is what makes the far layers melt instead of stopping.
   ========================================================================== */

const SKY_TOP = new THREE.Color('#3f86ad');
const HAZE = new THREE.Color('#b9cf9f');
const SUN = new THREE.Color('#ffe1a3');

/** Canopy greens, dark to bright. One is picked per crown. */
const CANOPY = [
  new THREE.Color('#1f4a22'),
  new THREE.Color('#2a5e25'),
  new THREE.Color('#35702a'),
  new THREE.Color('#437f2d'),
  new THREE.Color('#568f33'),
];
const PALM_LEAF = [new THREE.Color('#5f9230'), new THREE.Color('#6fa136'), new THREE.Color('#4d7f2a')];
const BROADLEAF = [new THREE.Color('#5d9a33'), new THREE.Color('#78ad3b'), new THREE.Color('#3f7a2c')];
const FERN = new THREE.Color('#467f2b');
const BARK = new THREE.Color('#5c4a37');
const BARK_PALE = new THREE.Color('#9a8f7b');
const PALM_BARK = new THREE.Color('#6d5d48');
const LIANA = new THREE.Color('#3a3020');
const ROCK = new THREE.Color('#7b7866');
const MOSS = new THREE.Color('#5f8a2a');
const LOAM = new THREE.Color('#4d4429');
const GROUND_MOSS = new THREE.Color('#44621f');
const GRASS = new THREE.Color('#79a83a');
const BLOOMS = [
  new THREE.Color('#ff4a2a'),
  new THREE.Color('#ffa31f'),
  new THREE.Color('#ff5c9b'),
];

/* ==========================================================================
   Time of day
   ==========================================================================
   Two lighting rigs the scene cross-fades between. Everything here is a
   uniform, a light or the fog — nothing is baked — so switching is free and
   needs no rebuild.

   DAY is backlit late morning: warm sun behind the forest, green-gold haze,
   shafts through the canopy.

   EVENING is the blue hour just after sunset: the sun is a pink-orange glow on
   the horizon, the fill is cool and blue, the haze thickens and turns
   indigo, stars come out overhead and the pollen becomes fireflies.
   ========================================================================== */

interface MoodSpec {
  skyTop: THREE.Color;
  haze: THREE.Color;
  sun: THREE.Color;
  sunDir: THREE.Vector3;
  sunI: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiI: number;
  fog: number;
  shafts: number;
  mote: THREE.Color;
  moteSize: number;
  blink: number;
  stars: number;
  vignette: THREE.Color;
  vignetteAmt: number;
  bloom: number;
  trans: number;
  dapple: number;
}

const DAY_SUN_DIR = new THREE.Vector3(-0.5, 0.58, -0.64).normalize();

const MOODS: Record<JungleMood, MoodSpec> = {
  day: {
    skyTop: SKY_TOP,
    haze: HAZE,
    sun: SUN,
    sunDir: DAY_SUN_DIR,
    sunI: 2.4,
    hemiSky: new THREE.Color('#a6d2cf'),
    hemiGround: new THREE.Color('#2c3a17'),
    hemiI: 1.3,
    fog: 0.0165,
    shafts: 1,
    mote: SUN,
    moteSize: 1,
    blink: 0,
    stars: 0,
    vignette: new THREE.Color(0.03, 0.06, 0.035),
    vignetteAmt: 0.74,
    bloom: 1,
    trans: 1,
    dapple: 1,
  },
  evening: {
    skyTop: new THREE.Color('#050a1d'),
    haze: new THREE.Color('#2a3357'),
    sun: new THREE.Color('#a58fd0'),
    /* Just below a canopy-grazing angle and very weak: the sun has set, and
       what is left is a rim of warm light on the few faces turned to it. At
       full strength a horizon sun paints every trunk salmon. */
    sunDir: new THREE.Vector3(-0.6, 0.16, -0.78).normalize(),
    sunI: 0.1,
    hemiSky: new THREE.Color('#6479bd'),
    hemiGround: new THREE.Color('#0b0e17'),
    hemiI: 1.0,
    fog: 0.026,
    shafts: 0,
    mote: new THREE.Color('#d4ff5e'),
    moteSize: 1.9,
    blink: 1,
    stars: 1,
    vignette: new THREE.Color(0.004, 0.008, 0.03),
    vignetteAmt: 0.93,
    bloom: 0.12,
    trans: 0.08,
    dapple: 0,
  },
};

/* ==========================================================================
   Device tier
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
  trees: number;
  emergents: number;
  palms: number;
  broadleaf: number;
  ferns: number;
  lianas: number;
  ceiling: number;
  rocks: number;
  grass: number;
  flowers: number;
  motes: number;
  /** Evening fireflies. They keep drifting at rest — see the ambient loop. */
  fireflies: number;
  shafts: number;
  /** Icosahedron subdivision for crowns. 1 is 80 faces, 0 is 20. */
  blobDetail: 0 | 1;
  /** Textured leaf cards per crown blob. */
  leaves: number;
  /** Shadow map size; 0 = no real shadows (dapple is faked in the shader). */
  shadow: number;
  groundSegments: number;
  fps: number;
  maxPixels: number;
  maxRatio: number;
}

/* Roughly 55k / 105k / 150k triangles. That sounds like a lot for a
   background, but it is two merged batches and it is drawn once and then
   parked — the per-frame cost only exists while someone is moving the
   pointer. Fill rate, not geometry, is what hurts integrated GPUs, which is
   why the pixel caps and the transparent layers are the numbers that shrink
   hardest on the low tier. */
const BUDGETS: Record<Tier, Budget> = {
  low: {
    trees: 26, emergents: 4, palms: 9, broadleaf: 34, ferns: 44, lianas: 22, ceiling: 4,
    rocks: 12, grass: 1200, flowers: 36, motes: 70, fireflies: 120, shafts: 3,
    blobDetail: 0, leaves: 8, shadow: 0, groundSegments: 48, fps: 30, maxPixels: 1_000_000, maxRatio: 1.25,
  },
  mid: {
    trees: 44, emergents: 7, palms: 15, broadleaf: 70, ferns: 90, lianas: 44, ceiling: 6,
    rocks: 20, grass: 2600, flowers: 70, motes: 220, fireflies: 280, shafts: 5,
    blobDetail: 1, leaves: 16, shadow: 1024, groundSegments: 72, fps: 60, maxPixels: 1_600_000, maxRatio: 1.5,
  },
  high: {
    trees: 62, emergents: 10, palms: 21, broadleaf: 110, ferns: 140, lianas: 70, ceiling: 8,
    rocks: 28, grass: 4000, flowers: 110, motes: 420, fireflies: 440, shafts: 7,
    blobDetail: 1, leaves: 22, shadow: 2048, groundSegments: 96, fps: 60, maxPixels: 2_000_000, maxRatio: 1.5,
  },
};

/* ==========================================================================
   Deterministic RNG
   ==========================================================================
   The layout is generated, but it must be the SAME layout every time: a forest
   that reshuffles on every navigation is unsettling, and it also makes any
   composition problem impossible to reproduce or fix.
   ========================================================================== */

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Stable hash of a unit-sphere vertex, so duplicated corners jitter identically. */
function hash3(x: number, y: number, z: number, seed: number) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 13.13) * 43758.5453;
  return h - Math.floor(h);
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ==========================================================================
   Tiny vector maths
   ==========================================================================
   Tuples rather than THREE.Vector3: the emitters below run a few hundred
   thousand times at boot, and allocation-light arithmetic on plain numbers is
   what keeps that under a frame or two on a laptop.
   ========================================================================== */

type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const faceNormal = (a: V3, b: V3, c: V3) => norm(cross(sub(b, a), sub(c, a)));

/* ==========================================================================
   Batch
   ==========================================================================
   Accumulates triangles into flat arrays and produces ONE non-indexed
   BufferGeometry per material. Per-vertex extras:
     color    base colour with occlusion already baked in
     aAnchor  the plant's root — the wind's distance test uses it so a whole
              plant reacts as one unit instead of shearing per-vertex
     aSway    0 where the plant is attached, up to ~1 at its free end
   Normals are authored per emitter: ellipsoid normals on crowns (soft, puffy
   volume), radial on trunks, flat on leaves (the fold facets are the detail).
   ========================================================================== */

class Batch {
  /* Growable typed arrays rather than number[] + push: the hot emitters write
     scalars straight into memory the GPU upload can take as-is, with no
     boxing and no conversion pass at build time. */
  private cap = 0;
  private n = 0;
  private pos = new Float32Array(0);
  private nrm = new Float32Array(0);
  private col = new Float32Array(0);
  private anc = new Float32Array(0);
  private sway = new Float32Array(0);
  private uv = new Float32Array(0);
  private ax = 0;
  private ay = 0;
  private az = 0;
  /* Texture coordinate for the next vertex. Only leaf cards set it; the
     untextured batches carry zeros they never read. */
  private u = 0;
  private w = 0;

  setUV(u: number, w: number) {
    this.u = u;
    this.w = w;
  }

  setAnchor(a: V3) {
    this.ax = a[0];
    this.ay = a[1];
    this.az = a[2];
  }

  private grow() {
    const cap = Math.max(8192, this.cap * 2);
    const re = (src: Float32Array, k: number) => {
      const next = new Float32Array(cap * k);
      next.set(src);
      return next;
    };
    this.pos = re(this.pos, 3);
    this.nrm = re(this.nrm, 3);
    this.col = re(this.col, 3);
    this.anc = re(this.anc, 3);
    this.sway = re(this.sway, 1);
    this.uv = re(this.uv, 2);
    this.cap = cap;
  }

  /** One vertex. `k` scales the colour (baked occlusion). */
  v(
    px: number, py: number, pz: number,
    nx: number, ny: number, nz: number,
    c: THREE.Color, k: number, s: number,
  ) {
    if (this.n === this.cap) this.grow();
    const i = this.n * 3;
    this.pos[i] = px; this.pos[i + 1] = py; this.pos[i + 2] = pz;
    this.nrm[i] = nx; this.nrm[i + 1] = ny; this.nrm[i + 2] = nz;
    this.col[i] = c.r * k; this.col[i + 1] = c.g * k; this.col[i + 2] = c.b * k;
    this.anc[i] = this.ax; this.anc[i + 1] = this.ay; this.anc[i + 2] = this.az;
    this.sway[this.n] = s;
    this.uv[this.n * 2] = this.u;
    this.uv[this.n * 2 + 1] = this.w;
    this.n++;
  }

  /** A flat-shaded triangle. `k` scales the colour per corner (occlusion). */
  tri(a: V3, b: V3, c: V3, col: THREE.Color, ka: number, kb: number, kc: number, sa: number, sb: number, sc: number) {
    const n = faceNormal(a, b, c);
    this.v(a[0], a[1], a[2], n[0], n[1], n[2], col, ka, sa);
    this.v(b[0], b[1], b[2], n[0], n[1], n[2], col, kb, sb);
    this.v(c[0], c[1], c[2], n[0], n[1], n[2], col, kc, sc);
  }

  build(): THREE.BufferGeometry {
    const n = this.n;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.subarray(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm.subarray(0, n * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.subarray(0, n * 3), 3));
    g.setAttribute('aAnchor', new THREE.BufferAttribute(this.anc.subarray(0, n * 3), 3));
    g.setAttribute('aSway', new THREE.BufferAttribute(this.sway.subarray(0, n), 1));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.subarray(0, n * 2), 2));
    return g;
  }
}

/* ==========================================================================
   Emitters
   ========================================================================== */

const ICO: Partial<Record<0 | 1, ArrayLike<number>>> = {};
function icoPositions(detail: 0 | 1) {
  let a = ICO[detail];
  if (!a) {
    const g = new THREE.IcosahedronGeometry(1, detail);
    a = Array.from(g.getAttribute('position').array as Float32Array);
    g.dispose();
    ICO[detail] = a;
  }
  return a;
}

interface BlobOpts {
  /** 0..1 — how dark the underside goes. */
  ao?: number;
  /** Colour blended onto up-facing faces (moss on rocks). */
  top?: THREE.Color;
  jitter?: number;
  /** Mix of face normal into the smooth ellipsoid normal. More = more faceted. */
  facet?: number;
}

/** A knocked-about ellipsoid: crowns, bushes, rocks, distant ridgelines. */
function blob(
  b: Batch,
  c: V3,
  s: V3,
  rot: THREE.Quaternion,
  detail: 0 | 1,
  base: THREE.Color,
  seed: number,
  sway: number,
  opts: BlobOpts = {},
) {
  const { ao = 0.55, top, jitter = 0.34, facet = 0.4 } = opts;
  const arr = icoPositions(detail);
  /* Rotation as a 3x3, applied by hand: this loop is the hottest code at boot
     and a Vector3.applyQuaternion per vertex was most of its cost. */
  const e = BLOB_M.makeRotationFromQuaternion(rot).elements;
  const m00 = e[0], m01 = e[4], m02 = e[8];
  const m10 = e[1], m11 = e[5], m12 = e[9];
  const m20 = e[2], m21 = e[6], m22 = e[10];
  const P = BLOB_P;
  const N = BLOB_N;
  const colTmp = BLOB_C;
  for (let i = 0; i < arr.length; i += 9) {
    for (let k = 0; k < 3; k++) {
      const ux = arr[i + k * 3];
      const uy = arr[i + k * 3 + 1];
      const uz = arr[i + k * 3 + 2];
      const j = 1 + (hash3(ux, uy, uz, seed) - 0.5) * jitter;
      const lx = ux * j * s[0];
      const ly = uy * j * s[1];
      const lz = uz * j * s[2];
      P[k * 3] = c[0] + m00 * lx + m01 * ly + m02 * lz;
      P[k * 3 + 1] = c[1] + m10 * lx + m11 * ly + m12 * lz;
      P[k * 3 + 2] = c[2] + m20 * lx + m21 * ly + m22 * lz;
      /* Ellipsoid normal: the gradient of the implicit surface, not the
         scaled position — a squat crown should shade squat. */
      const gx = ux / s[0];
      const gy = uy / s[1];
      const gz = uz / s[2];
      N[k * 3] = m00 * gx + m01 * gy + m02 * gz;
      N[k * 3 + 1] = m10 * gx + m11 * gy + m12 * gz;
      N[k * 3 + 2] = m20 * gx + m21 * gy + m22 * gz;
      N[9 + k] = uy;
    }
    const e1x = P[3] - P[0], e1y = P[4] - P[1], e1z = P[5] - P[2];
    const e2x = P[6] - P[0], e2y = P[7] - P[1], e2z = P[8] - P[2];
    let fx = e1y * e2z - e1z * e2y;
    let fy = e1z * e2x - e1x * e2z;
    let fz = e1x * e2y - e1y * e2x;
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    for (let k = 0; k < 3; k++) {
      let sx = N[k * 3], sy = N[k * 3 + 1], sz = N[k * 3 + 2];
      const sl = Math.hypot(sx, sy, sz) || 1;
      sx = (sx / sl) * (1 - facet) + fx * facet;
      sy = (sy / sl) * (1 - facet) + fy * facet;
      sz = (sz / sl) * (1 - facet) + fz * facet;
      const nl = Math.hypot(sx, sy, sz) || 1;
      sx /= nl; sy /= nl; sz /= nl;
      const k0 = 1 - ao + ao * smooth(-0.95, 0.75, N[9 + k]);
      const col = top ? colTmp.copy(base).lerp(top, smooth(0.25, 0.75, sy)) : base;
      b.v(P[k * 3], P[k * 3 + 1], P[k * 3 + 2], sx, sy, sz, col, k0, sway);
    }
  }
}
const BLOB_M = new THREE.Matrix4();
const BLOB_P = new Float64Array(9);
const BLOB_N = new Float64Array(12);
const BLOB_C = new THREE.Color();
const TUBE_C = new THREE.Color();
let TUBE_RING = new Float64Array(0);
const TUBE_ALONG = new Float64Array(64);
const CORE_TMP = new THREE.Color();
/** Card corners as (-1|1) offsets along its two axes, their UVs, and the two-triangle order. */
const CARD_SIGN = [-1, -1, 1, -1, 1, 1, -1, 1];
const CARD_UV = [0, 0, 1, 0, 1, 1, 0, 1];
const CARD_ORDER = [0, 1, 2, 0, 2, 3];

/**
 * The leaf atlas: one 256px canvas of overlapping leaves radiating from the
 * centre, painted in greys so vertex colour tints it per crown. Generated at
 * boot — about a millisecond of canvas work instead of a texture download.
 */
function makeLeafTexture(rng: () => number): THREE.Texture | null {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const cx = size / 2;
  const n = 120;
  for (let i = 0; i < n; i++) {
    /* Back-to-front: darker leaves first so the rim of the cluster is lit and
       its heart sits in its own shade — self-shadowing for free. */
    const t = i / n;
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(0.05 + rng() * 0.95) * cx * 0.78;
    const x = cx + Math.cos(a) * d;
    const y = cx + Math.sin(a) * d;
    const len = 52 + rng() * 44;
    const wid = len * (0.3 + rng() * 0.12);
    g.save();
    g.translate(x, y);
    /* Leaves point outward from the twig, with some droop and scatter. */
    g.rotate(a + (rng() - 0.5) * 1.1);
    const v = 105 + t * 120 + rng() * 25;
    /* A little hue in the texture itself — some leaves younger and yellower,
       some older and bluer — so a crown is never one flat tint. */
    const warm = (rng() - 0.4) * 22;
    const rC = Math.min(255, v + warm);
    const gC = Math.min(255, v + warm * 0.4);
    const bC = Math.min(255, v - warm * 0.8);
    const grad = g.createLinearGradient(0, 0, len, 0);
    grad.addColorStop(0, `rgb(${rC * 0.62},${gC * 0.62},${bC * 0.62})`);
    grad.addColorStop(0.55, `rgb(${rC},${gC},${bC})`);
    grad.addColorStop(1, `rgb(${rC * 0.9},${gC * 0.9},${bC * 0.9})`);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(len * 0.25, -wid * 1.05, len * 0.75, -wid * 0.7, len, 0);
    g.bezierCurveTo(len * 0.75, wid * 0.7, len * 0.25, wid * 1.05, 0, 0);
    g.fill();
    /* Veins: a midrib and a few pairs of side veins, faint. */
    g.strokeStyle = 'rgba(255,255,240,0.22)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(3, 0);
    g.lineTo(len * 0.94, 0);
    g.stroke();
    g.lineWidth = 0.9;
    g.strokeStyle = 'rgba(255,255,240,0.13)';
    for (let k = 1; k <= 4; k++) {
      const vx = len * (0.14 + k * 0.17);
      const reach = wid * 0.75 * Math.sin(Math.PI * (vx / len));
      g.beginPath();
      g.moveTo(vx, 0);
      g.lineTo(vx + reach * 0.9, -reach);
      g.moveTo(vx, 0);
      g.lineTo(vx + reach * 0.9, reach);
      g.stroke();
    }
    g.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Bark: a tiling canvas of vertical fibre with a few horizontal checks, in
 * greys so the trunk's vertex colour (and its moss) tints it. It is what
 * turns a tapered tube into a tree trunk at close range.
 */
function makeBarkTexture(rng: () => number): THREE.Texture | null {
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = 'rgb(196,196,196)';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const x = rng() * w;
    const width = 1 + rng() * 5;
    const shade = Math.round(120 + rng() * 120);
    g.strokeStyle = `rgba(${shade},${shade},${shade},0.75)`;
    g.lineWidth = width;
    for (const ox of [-w, 0, w]) {
      g.beginPath();
      let px = x + ox;
      g.moveTo(px, -4);
      for (let y = 0; y <= h + 8; y += 16) {
        /* Wobble that returns to its start, so the tile wraps vertically. */
        px = x + ox + Math.sin((y / h) * Math.PI * 2 + i) * (2 + width);
        g.lineTo(px, y);
      }
      g.stroke();
    }
  }
  g.fillStyle = 'rgba(40,40,40,0.35)';
  for (let i = 0; i < 26; i++) {
    const x = rng() * w;
    const y = rng() * h;
    g.fillRect(x, y, 4 + rng() * 14, 1 + rng() * 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Leaf litter for the floor: a tiling canvas of small dead leaves in greys,
 * multiplied over the ground's vertex colour. It is the near-field detail
 * that stops the floor reading as a flat green sheet.
 */
function makeLitterTexture(rng: () => number): THREE.Texture | null {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = 'rgb(205,205,205)';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 340; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const len = 5 + rng() * 11;
    const shade = Math.round(150 + rng() * 105);
    /* Wrap copies only for leaves that actually cross an edge, so the tile
       has no seams without drawing every leaf nine times. */
    const xs = x < len ? [0, size] : x > size - len ? [0, -size] : [0];
    const ys = y < len ? [0, size] : y > size - len ? [0, -size] : [0];
    const rot = rng() * Math.PI * 2;
    for (const ox of xs) {
      for (const oy of ys) {
        g.save();
        g.translate(x + ox, y + oy);
        g.rotate(rot);
        g.fillStyle = `rgb(${shade},${Math.round(shade * 0.97)},${Math.round(shade * 0.9)})`;
        g.beginPath();
        g.ellipse(0, 0, len, len * 0.38, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(64, 64);
  tex.anisotropy = 8;
  return tex;
}

/**
 * Leaf cards over a crown: textured quads scattered on its surface, facing
 * roughly outward. This is how real-time foliage is built in games — the blob
 * underneath gives the crown its mass and its shadowed core; the cards give it
 * a ragged, leafy silhouette and let light and shadow through the gaps.
 *
 * Normals are NOT the card's own: every corner takes the crown's ellipsoid
 * normal at that point, so a crown of two hundred flat cards still shades as
 * one soft volume instead of as confetti.
 */
function leafCards(
  b: Batch,
  c: V3,
  s: V3,
  rot: THREE.Quaternion,
  count: number,
  base: THREE.Color,
  rng: () => number,
  sway: number,
) {
  /* Scalar maths only. This runs for tens of thousands of cards at boot, and
     a version built on small tuple allocations spent a third of a second in
     garbage collection on its own. */
  const e = BLOB_M.makeRotationFromQuaternion(rot).elements;
  const m00 = e[0], m01 = e[4], m02 = e[8];
  const m10 = e[1], m11 = e[5], m12 = e[9];
  const m20 = e[2], m21 = e[6], m22 = e[10];
  const mean = (s[0] + s[1] + s[2]) / 3;
  const cx = c[0], cy = c[1], cz = c[2];
  const sx = s[0], sy = s[1], sz = s[2];
  const U = CARD_UV;
  for (let i = 0; i < count; i++) {
    let nx = rng() * 2 - 1;
    let ny = rng() * 1.6 - 0.6;
    let nz = rng() * 2 - 1;
    const ul = Math.hypot(nx, ny, nz) || 1;
    nx /= ul; ny /= ul; nz /= ul;
    const depth = 0.72 + rng() * 0.3;
    const lx = nx * sx * depth, ly = ny * sy * depth, lz = nz * sz * depth;
    const px = cx + m00 * lx + m01 * ly + m02 * lz;
    const py = cy + m10 * lx + m11 * ly + m12 * lz;
    const pz = cz + m20 * lx + m21 * ly + m22 * lz;
    const gx = nx / sx, gy = ny / sy, gz = nz / sz;
    let ox = m00 * gx + m01 * gy + m02 * gz;
    let oy = m10 * gx + m11 * gy + m12 * gz;
    let oz = m20 * gx + m21 * gy + m22 * gz;
    const ol = Math.hypot(ox, oy, oz) || 1;
    ox /= ol; oy /= ol; oz /= ol;
    /* Card basis: the outward normal nudged up and jittered, a side vector
       from it, then a random spin in that plane so no two cards line up. */
    let dx = ox + (rng() - 0.5) * 0.6, dy = oy + 0.25, dz = oz + (rng() - 0.5) * 0.6;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    let rx = -dz, rz = dx; // cross(dir, up) with up = (0,1,0)
    const rl = Math.hypot(rx, rz);
    const ry = 0;
    if (rl < 1e-4) { rx = 1; rz = 0; } else { rx /= rl; rz /= rl; }
    const qx = ry * dz - rz * dy, qy = rz * dx - rx * dz, qz = rx * dy - ry * dx;
    const spin = rng() * Math.PI * 2;
    const cs = Math.cos(spin), sn = Math.sin(spin);
    const half = mean * (0.42 + rng() * 0.22);
    const ax = (rx * cs + qx * sn) * half, ay = (ry * cs + qy * sn) * half, az = (rz * cs + qz * sn) * half;
    const bx = (-rx * sn + qx * cs) * half, by = (-ry * sn + qy * cs) * half, bz = (-rz * sn + qz * cs) * half;
    const flip = rng() < 0.5;
    const tint = 0.9 + rng() * 0.22;
    for (let t = 0; t < 6; t++) {
      const k = CARD_ORDER[t];
      const su = CARD_SIGN[k * 2], sv = CARD_SIGN[k * 2 + 1];
      const vx = px + ax * su + bx * sv;
      const vy = py + ay * su + by * sv;
      const vz = pz + az * su + bz * sv;
      /* Ellipsoid normal and height occlusion, both measured from the crown. */
      const ex = (vx - cx) / sx, ey = (vy - cy) / sy, ez = (vz - cz) / sz;
      let nnx = ex * 0.8 + ox * 0.6, nny = ey * 0.8 + oy * 0.6, nnz = ez * 0.8 + oz * 0.6;
      const nl = Math.hypot(nnx, nny, nnz) || 1;
      nnx /= nl; nny /= nl; nnz /= nl;
      const ao = 0.5 + 0.5 * smooth(-0.9, 0.8, ey / (Math.hypot(ex, ey, ez) || 1));
      b.setUV(flip ? 1 - U[k * 2] : U[k * 2], U[k * 2 + 1]);
      b.v(vx, vy, vz, nnx, nny, nnz, base, ao * tint, sway);
    }
  }
  b.setUV(0, 0);
}

/**
 * A tube along a polyline: trunks, palm stems, branches, lianas. Normals are
 * radial so a five-sided trunk still reads as round-ish under the sun.
 */
function tube(
  b: Batch,
  pts: V3[],
  radii: number[],
  sides: number,
  base: THREE.Color,
  swayAt: (i: number) => number,
  shadeAt: (i: number, y: number) => number = (_i, y) => 0.45 + 0.55 * smooth(-0.2, 3.2, y),
  /** 0..1: moss creeping up the base and over the up-facing side. */
  moss = 0,
) {
  /* Scalar maths into a reused scratch buffer. There are about a thousand
     tubes now (roots, limbs, twigs, vines), and the tuple-per-vertex version
     of this spent a quarter of a second in garbage collection at boot. */
  const n = pts.length;
  const stride = (sides + 1) * 6;
  if (TUBE_RING.length < n * stride) TUBE_RING = new Float64Array(n * stride * 2);
  const R = TUBE_RING;
  /* Bark UVs: around the tube in whole repeats (so the seam matches), and
     along it by arc length, so the fibre keeps its scale on bends. */
  const wraps = Math.max(1, Math.round(radii[0] * 5));
  let along = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const pv = pts[Math.max(0, i - 1)];
    const nx = pts[Math.min(n - 1, i + 1)];
    let tx = nx[0] - pv[0], ty = nx[1] - pv[1], tz = nx[2] - pv[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    /* u = t x ref, w = t x u */
    let ux: number, uy: number, uz: number;
    if (Math.abs(ty) < 0.95) { ux = -tz; uy = 0; uz = tx; } else { ux = 0; uy = tz; uz = -ty; }
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const wx = ty * uz - tz * uy, wy = tz * ux - tx * uz, wz = tx * uy - ty * ux;
    const rad = radii[i];
    for (let k = 0; k <= sides; k++) {
      const ang = (k / sides) * Math.PI * 2;
      const c = Math.cos(ang), sn = Math.sin(ang);
      const dx = ux * c + wx * sn, dy = uy * c + wy * sn, dz = uz * c + wz * sn;
      const o = i * stride + k * 6;
      R[o] = p[0] + dx * rad; R[o + 1] = p[1] + dy * rad; R[o + 2] = p[2] + dz * rad;
      R[o + 3] = dx; R[o + 4] = dy; R[o + 5] = dz;
    }
    TUBE_ALONG[i] = along;
    if (i < n - 1) along += Math.hypot(pts[i + 1][0] - p[0], pts[i + 1][1] - p[1], pts[i + 1][2] - p[2]);
  }
  const put = (ring: number, seg: number, k: number, sw: number) => {
    const o = ring * stride + seg * 6;
    b.setUV((seg / sides) * wraps, TUBE_ALONG[ring] * 0.45);
    let col = base;
    if (moss > 0) {
      const m = moss * Math.max(smooth(0.1, 0.8, R[o + 4]) * 0.8, 1 - smooth(0, 1.6, R[o + 1]));
      col = TUBE_C.copy(base).lerp(MOSS, Math.min(1, m));
    }
    b.v(R[o], R[o + 1], R[o + 2], R[o + 3], R[o + 4], R[o + 5], col, k, sw);
  };
  for (let i = 0; i < n - 1; i++) {
    const s0 = swayAt(i);
    const s1 = swayAt(i + 1);
    const k0 = shadeAt(i, pts[i][1]);
    const k1 = shadeAt(i + 1, pts[i + 1][1]);
    for (let k = 0; k < sides; k++) {
      put(i, k, k0, s0);
      put(i, k + 1, k0, s0);
      put(i + 1, k + 1, k1, s1);
      put(i, k, k0, s0);
      put(i + 1, k + 1, k1, s1);
      put(i + 1, k, k1, s1);
    }
  }
}

function frame(dir: V3) {
  const side = Math.abs(dir[1]) > 0.98 ? ([1, 0, 0] as V3) : norm(cross(dir, [0, 1, 0]));
  const up = norm(cross(side, dir));
  return { side, up };
}

/**
 * A single broad leaf — banana, elephant ear, heliconia. A drooping midrib with
 * the blade folded up into a shallow V, so each half catches the sun at a
 * different angle. That fold is most of what sells it as a leaf.
 */
function leaf(
  b: Batch,
  base: V3,
  dir: V3,
  length: number,
  width: number,
  droop: number,
  col: THREE.Color,
  sway0: number,
  sway1: number,
  segs = 5,
) {
  const { side, up } = frame(dir);
  const fold = 0.35;
  const mid: V3[] = [];
  const L: V3[] = [];
  const R: V3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const m = add(add(base, mul(dir, length * t)), [0, -droop * length * t * t, 0]);
    const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.98 + 0.02)), 0.7);
    mid.push(m);
    L.push(add(add(m, mul(side, w)), mul(up, fold * w)));
    R.push(add(sub(m, mul(side, w)), mul(up, fold * w)));
  }
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const s0 = sway0 + t0 * sway1;
    const s1 = sway0 + t1 * sway1;
    const kMid0 = 1.1 - 0.15 * (1 - t0);
    const kMid1 = 1.1 - 0.15 * (1 - t1);
    b.tri(mid[i], mid[i + 1], L[i + 1], col, kMid0, kMid1, 0.9, s0, s1, s1);
    b.tri(mid[i], L[i + 1], L[i], col, kMid0, 0.9, 0.9, s0, s1, s0);
    b.tri(mid[i], R[i + 1], mid[i + 1], col, kMid0, 0.82, kMid1, s0, s1, s1);
    b.tri(mid[i], R[i], R[i + 1], col, kMid0, 0.82, 0.82, s0, s0, s1);
  }
}

/**
 * A pinnate frond — palms and ferns. An arched rachis with a thin leaflet
 * triangle either side at every step. The rachis itself is never drawn; the
 * leaflets imply it, and it saves a tube per frond.
 */
function frond(
  b: Batch,
  base: V3,
  dir: V3,
  length: number,
  count: number,
  leafletLen: number,
  droop: number,
  col: THREE.Color,
  sway0: number,
  sway1: number,
) {
  const { side } = frame(dir);
  const at = (t: number): V3 => add(add(base, mul(dir, length * t)), [0, -droop * length * t * t, 0]);
  for (let i = 0; i < count; i++) {
    const t0 = 0.1 + (0.9 * i) / count;
    const t1 = 0.1 + (0.9 * (i + 1)) / count;
    const p0 = at(t0);
    const p1 = at(t1);
    const fwd = norm(sub(p1, p0));
    const ll = leafletLen * Math.sin(Math.PI * (0.18 + 0.8 * t0));
    const s0 = sway0 + t0 * sway1;
    const s1 = sway0 + t1 * sway1;
    for (const sgn of [1, -1]) {
      const tip = add(add(add(p0, mul(side, sgn * ll * 0.9)), mul(fwd, ll * 0.5)), [0, -ll * 0.38, 0]);
      if (sgn > 0) b.tri(p0, p1, tip, col, 0.85, 0.95, 1.12, s0, s1, s1);
      else b.tri(p0, tip, p1, col, 0.85, 1.12, 0.95, s0, s1, s1);
    }
  }
}

/* ==========================================================================
   Shader injection
   ==========================================================================
   Everything below is patched into MeshLambertMaterial with onBeforeCompile
   rather than written as raw ShaderMaterials: Lambert + hemisphere + fog is
   exactly the lighting we want, and reimplementing it to add a dozen lines
   would be silly.
   ========================================================================== */

interface SceneUniforms {
  uTime: { value: number };
  uHover: { value: THREE.Vector3 };
  uHoverRadius: { value: number };
  uStrength: { value: number };
  /** Direction toward the sun, in VIEW space — updated when the camera moves. */
  uSunView: { value: THREE.Vector3 };
  uSunCol: { value: THREE.Color };
  /** Foliage translucency strength (mood). */
  uTrans: { value: number };
  /** Faked sun-fleck strength on the floor (tier x mood). */
  uDapple: { value: number };
}

const WIND_DECLS = `
uniform float uTime;
uniform vec3 uHover;
uniform float uHoverRadius;
uniform float uStrength;
`;

/** Local, pointer-centred disturbance. There is no ambient breeze by design. */
const WIND_BODY = `
  float dist = distance(anchor.xz, uHover.xz);
  float influence = (1.0 - smoothstep(0.0, uHoverRadius, dist)) * uStrength;
  if (influence > 0.001) {
    float t = uTime * 2.4 + anchor.x * 0.83 + anchor.z * 0.57;
    float wob = sin(t) * 0.72 + sin(t * 2.13 + 1.1) * 0.28;
    float amp = sway * influence;
    transformed.x += wob * amp;
    transformed.z += cos(t * 0.91) * amp * 0.55;
    transformed.y += abs(wob) * amp * 0.12;
  }
`;

/** Sun flecks on the forest floor: a few interfering sines, thresholded. */
const DAPPLE_FN = `
uniform vec3 uSunCol;
uniform float uDapple;
float dapple(vec2 xz) {
  vec2 q = xz * 0.55;
  vec2 r = mat2(0.8, -0.6, 0.6, 0.8) * q * 1.7;
  float n = sin(q.x * 1.7 + sin(q.y * 1.3) * 1.9) * sin(q.y * 1.9 + sin(q.x * 1.1) * 1.7);
  n += 0.6 * sin(r.x + sin(r.y * 1.4) * 1.3) * sin(r.y * 1.2 + sin(r.x * 0.9));
  return smoothstep(0.55, 1.1, n);
}
`;

/**
 * FOLIAGE TRANSLUCENCY. When the view ray points toward the sun, a leaf between
 * the camera and the sun transmits light and glows yellow-green. One dot
 * product per fragment; it is the single biggest "this is expensive" cue in
 * the scene.
 */
const FOLIAGE_TRANSLUCENCY = `
  {
    vec3 toFrag = -normalize(vViewPosition);
    float back = max(dot(toFrag, uSunView), 0.0);
    float trans = (pow(back, 4.0) * 0.75 + 0.05) * uTrans;
    outgoingLight += diffuseColor.rgb * uSunCol * trans;
  }
  #include <opaque_fragment>
`;

function patchMerged(mat: THREE.Material, U: SceneUniforms, translucent: boolean) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader =
      `${WIND_DECLS}\nattribute vec3 aAnchor;\nattribute float aSway;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vec3 anchor = aAnchor;
       float sway = aSway;
       ${WIND_BODY}`,
    );
    if (translucent) {
      shader.fragmentShader =
        `uniform vec3 uSunView;\nuniform vec3 uSunCol;\nuniform float uTrans;\n` +
        shader.fragmentShader.replace('#include <opaque_fragment>', FOLIAGE_TRANSLUCENCY);
    }
  };
}

/**
 * For instanced meshes: the anchor is the instance's own translation column.
 * `swayExpr` is how much a vertex moves — `position.y` for a blade (0 root,
 * 1 tip); a constant for things with no meaningful local height.
 */
function patchInstanced(mat: THREE.Material, U: SceneUniforms, swayExpr: string, dappled: boolean) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = `${WIND_DECLS}\nvarying vec2 vWorldXZ;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vec3 anchor = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       float sway = ${swayExpr};
       vWorldXZ = anchor.xz;
       ${WIND_BODY}`,
    );
    if (dappled) {
      shader.fragmentShader =
        `varying vec2 vWorldXZ;\n${DAPPLE_FN}\n` +
        shader.fragmentShader
          /* A blade is lit like the turf it grows from, from either side.
             Without this the double-sided flip lights every back face as if
             it pointed into the soil, and half the lawn goes black. */
          .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
          .replace(
            '#include <opaque_fragment>',
            `outgoingLight *= mix(vec3(1.0), 0.72 + dapple(vWorldXZ) * 0.85 * uSunCol, uDapple);
             #include <opaque_fragment>`,
          );
    }
  };
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
    return mountJungle(canvas, host);
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none"
      /* Starts transparent and fades in after the first frame, so the page
         never shows a half-built scene or a black flash while it assembles. */
      style={{ zIndex: 0, opacity: 0, transition: 'opacity 700ms ease-out' }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

/** Builds the scene into `canvas` and returns its teardown. */
function mountJungle(canvas: HTMLCanvasElement, host: HTMLElement): () => void {
  const root = document.documentElement;
  let tier = detectTier();
  let budget = BUDGETS[tier];

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: false,
      /* Leaf edges and thin trunks against bright haze are the worst case for
         aliasing, so MSAA earns its cost — except on the low tier, where the
         pixel budget is the thing that matters. */
      antialias: tier !== 'low',
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
  /* No tone mapping: ACES/AgX pull the greens toward olive. The palette is
     authored in display space and the only highlights (shafts, bloom) are
     additive layers we control directly. */
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(HAZE);
  /* REAL SHADOWS, DRAWN ONCE. The scene is static, so the shadow map is
     rendered on the first frame and again only when the sun moves (the day /
     evening fade) — never per frame. Pointer wind does not update it; nobody
     can see a crown's shadow lag a few centimetres. That makes canopy dapple
     on the floor, trunks in the shade of crowns and leaf-shaped light
     through the gaps essentially free after the first frame. */
  if (budget.shadow > 0) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
  }

  const scene = new THREE.Scene();
  /* Exponential-squared: clear near the camera, then a fast roll-off into
     haze. That curve is what gives the distinct receding layers. */
  scene.fog = new THREE.FogExp2(HAZE, 0.0165);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.3, 260);
  /* CAMERA HEIGHT IS A SAFETY CONSTRAINT: the ground is flattened to zero
     within ~16 units of here and nothing taller than the camera is planted in
     the trail corridor (|x| < 2.2) it dollies down during the game hand-off. */
  const CAM_BASE = new THREE.Vector3(0, 1.8, 9);
  camera.position.copy(CAM_BASE);

  /* -- light ------------------------------------------------------------
     Sun behind the forest, up and to the left, so we look INTO the light:
     leaves glow, shafts come toward us, trunks go to silhouette. The
     hemisphere fill is stronger than a sunny scene would want because under
     a canopy most light is bounced sky and bounced green. */
  /* Live sun direction — the mood fade moves it. Shafts are aimed at build
     time along the DAY sun, and simply fade out at dusk. */
  const SUN_DIR = DAY_SUN_DIR.clone();
  const sun = new THREE.DirectionalLight(SUN, 2.3);
  const SUN_TARGET = new THREE.Vector3(0, 0, -14);
  sun.target.position.copy(SUN_TARGET);
  sun.position.copy(SUN_TARGET).addScaledVector(SUN_DIR, 70);
  if (budget.shadow > 0) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(budget.shadow, budget.shadow);
    const sc = sun.shadow.camera;
    sc.left = -42;
    sc.right = 42;
    sc.top = 42;
    sc.bottom = -42;
    sc.near = 1;
    sc.far = 170;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    sun.shadow.radius = 3;
    /* Not black: under a real canopy the shade is full of bounced green
       light. The hemisphere fill is the other half of that. */
    sun.shadow.intensity = 0.72;
  }
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xa6d2cf, 0x2c3a17, 1.15);
  scene.add(hemi);

  const U: SceneUniforms = {
    uTime: { value: 0 },
    uHover: { value: new THREE.Vector3(0, 0, -9999) },
    uHoverRadius: { value: 5.5 },
    uStrength: { value: 0 },
    uSunView: { value: new THREE.Vector3() },
    uSunCol: { value: SUN.clone() },
    uTrans: { value: 1 },
    uDapple: { value: 1 },
  };

  /* Mood uniforms, shared by reference into every shader that needs them, so
     applyMood() below is one pass of assignments. */
  const M = {
    uTop: { value: SKY_TOP.clone() },
    uLow: { value: HAZE.clone() },
    uSunDir: { value: SUN_DIR },
    uStars: { value: 0 },
    uShafts: { value: 1 },
    uMote: { value: SUN.clone() },
    uMoteSize: { value: 1 },
    uBlink: { value: 0 },
  };

  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const rng = makeRng(20260924);
  const r = (a: number, b: number) => a + rng() * (b - a);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
  const quat = (x: number, y: number, z: number) =>
    new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));

  const foliage = new Batch();
  const wood = new Batch();
  /** Leaf cards: the one alpha-tested, textured batch. */
  const cards = new Batch();
  /** Trunk footprints, for occlusion baked into the ground. */
  const trunks: { x: number; z: number; r: number }[] = [];
  /** Crown undersides lianas can hang from. */
  const hangPoints: V3[] = [];

  /** The trail the game dolly runs down. Nothing tall may stand in it. */
  const inCorridor = (x: number, z: number, pad = 0) => Math.abs(x) < 2.2 + pad && z > -32;

  /* Filled in by populate(); read by the loop and demote(). */
  const shaftMats: THREE.ShaderMaterial[] = [];
  let motesMat: THREE.ShaderMaterial | null = null;

  /* The build runs as a generator so it can be sliced across frames — see
     the pump at the bottom. Each yield is a safe point to hand the main
     thread back to the page. */
  function* populate(): Generator<void, void, void> {
    /* ======================================================================
       1. SKY
       ======================================================================
       Gradient dome with a sun glow. Most of it is hidden behind canopy; what
       shows through the gaps is what makes the canopy read as backlit.
       ====================================================================== */
    {
      const geo = track(new THREE.SphereGeometry(200, 20, 14));
      const mat = track(
        new THREE.ShaderMaterial({
          side: THREE.BackSide,
          depthWrite: false,
          fog: false,
          uniforms: {
            uTop: M.uTop,
            uLow: M.uLow,
            uSun: U.uSunCol,
            uSunDir: M.uSunDir,
            uStars: M.uStars,
          },
          vertexShader: `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`,
          fragmentShader: `
  uniform vec3 uTop;
  uniform vec3 uLow;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  uniform float uStars;
  varying vec3 vDir;
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  void main() {
    vec3 d = normalize(vDir);
    float t = pow(clamp(d.y, 0.0, 1.0), 0.55);
    vec3 c = mix(uLow, uTop, t);
    float s = max(dot(d, uSunDir), 0.0);
    c += uSun * (pow(s, 280.0) * 1.6 * (1.0 - uStars) + pow(s, 18.0) * 0.45 * (1.0 - uStars * 0.8) + pow(s, 3.0) * 0.12 * (1.0 - uStars * 0.85));
    /* Evening: a band of afterglow along the horizon on the sun's side, and
       stars that only appear well clear of the haze. */
    float band = exp(-abs(d.y) * 12.0) * pow(s, 7.0) * uStars;
    c += uSun * band * 0.4;
    if (uStars > 0.0) {
      vec3 cell = floor(d * 260.0);
      float h = hash(cell);
      float star = step(0.9965, h) * smoothstep(0.12, 0.45, d.y);
      c += vec3(0.85, 0.9, 1.0) * star * (0.5 + 0.5 * fract(h * 97.0)) * uStars;
    }
    gl_FragColor = vec4(c, 1.0);
  }`,
        }),
      );
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = -10;
      scene.add(mesh);
    }

    yield;
    /* ======================================================================
       2. DISTANT RIDGELINES
       ======================================================================
       Three rows of huge crowns far back. Fog does all the work: each row sits
       another ~30 units into the haze, so they step from dark green to almost
       sky. Twenty-face blobs — at that distance nobody can count facets.
       ====================================================================== */
    for (let layer = 0; layer < 3; layer++) {
      const z = -78 - layer * 30;
      for (let x = -170; x <= 170; x += 8 + rng() * 5) {
        const rad = r(7, 12) + layer * 2;
        const c: V3 = [x, layer * 3.5 + r(1, 6), z + r(-6, 6)];
        foliage.setAnchor(c);
        blob(foliage, c, [rad * 1.2, rad * 0.85, rad], quat(0, rng() * 6, 0), 0, pick(CANOPY), rng() * 100, 0, {
          ao: 0.35,
        });
      }
    }

    yield;
    /* ======================================================================
       3. GROUND
       ======================================================================
       Loam with moss patches, darkened around every trunk, with sun flecks
       painted in the fragment shader. Built last-but-one so it can read the
       trunk list — see below.
       ====================================================================== */

    yield;
    /* ======================================================================
       4. TREES
       ======================================================================
       Every broadleaf tree — thicket, giants and the overhang — is grown the
       same way, like a real tree rather than a lollipop:

         trunk     a bent, tapering tube with a flared foot and surface roots,
                   bark-textured, with moss creeping up its base and over its
                   up-facing side;
         limbs     three to eight curved branches forking out of the upper
                   trunk, about half of them splitting off a twig;
         clusters  foliage only at branch tips — a small dark core (the shade
                   inside the clump) wrapped in dense leaf cards.

       Foliage living only at the tips is what makes the difference: sky and
       light show between clusters, branches are visible inside the crown, and
       the silhouette breaks up into clumps the way real canopy does.
       ====================================================================== */
    interface TreeSpec {
      x: number;
      z: number;
      h: number;
      tr: number;
      spread: number;
      limbs: number;
      cluster: number;
      bark: THREE.Color;
      green: THREE.Color;
      /** Radians: limbs favour this direction (the overhang reaches over the trail). */
      lean?: number;
      buttress?: boolean;
      sway: number;
    }

    const cluster = (c: V3, cr: number, green: THREE.Color, sway: number, hang: boolean) => {
      const q = quat(r(-0.3, 0.3), rng() * 6, r(-0.3, 0.3));
      const core: V3 = [cr * 0.72, cr * 0.46, cr * 0.72];
      foliage.setAnchor(c);
      /* The core is darker than the leaves: it is the inside of the clump. It
         is always the 20-face blob — the cards hide its outline completely,
         and at 80 faces it was a third of the geometry uploaded on frame one. */
      blob(foliage, c, core, q, 0, CORE_TMP.copy(green).multiplyScalar(0.62), rng() * 100, sway, { ao: 0.7 });
      const shell: V3 = [cr * r(1.05, 1.25), cr * r(0.72, 0.85), cr * r(1.05, 1.25)];
      cards.setAnchor(c);
      leafCards(cards, c, shell, q, budget.leaves, green.clone().lerp(CANOPY[4], rng() * 0.25), rng, sway);
      if (hang) hangPoints.push([c[0] + r(-0.6, 0.6), c[1] - cr * 0.55, c[2] + r(-0.6, 0.6)]);
    };

    const growTree = (t: TreeSpec) => {
      const { x, z, h, tr, bark } = t;
      trunks.push({ x, z, r: tr * (t.buttress ? 2.4 : 1.4) });
      wood.setAnchor([x, 0, z]);

      /* Trunk: a random walk of small bends, plus a flared foot. */
      const segs = 8;
      const pts: V3[] = [];
      const radii: number[] = [];
      let bx = 0;
      let bz = 0;
      const leanX = r(-0.5, 0.5);
      const leanZ = r(-0.5, 0.5);
      for (let k = 0; k <= segs; k++) {
        const u = k / segs;
        if (k > 1) {
          bx += (rng() - 0.5) * 0.22;
          bz += (rng() - 0.5) * 0.22;
        }
        pts.push([x + leanX * u * u + bx, -0.35 + (h + 0.35) * u, z + leanZ * u * u + bz]);
        radii.push(tr * (1 - 0.6 * u) * (1 + 1.1 * Math.pow(1 - u, 10)));
      }
      tube(wood, pts, radii, 8, bark, () => 0, (_i, y) => 0.5 + 0.5 * smooth(-0.2, 4, y), 0.75);
      const trunkAt = (u: number): V3 => {
        const f = u * segs;
        const i = Math.min(segs - 1, Math.floor(f));
        const k = f - i;
        return [
          pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k,
          pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k,
          pts[i][2] + (pts[i + 1][2] - pts[i][2]) * k,
        ];
      };

      /* Surface roots snaking out from the foot. */
      const roots = t.buttress ? 0 : 3 + Math.floor(rng() * 3);
      for (let k = 0; k < roots; k++) {
        const a = rng() * Math.PI * 2;
        const dx = Math.cos(a);
        const dz = Math.sin(a);
        const reach = tr * r(3, 5.5);
        tube(
          wood,
          [
            [x + dx * tr * 0.6, 0.35, z + dz * tr * 0.6],
            [x + dx * reach * 0.5, 0.02, z + dz * reach * 0.5 + r(-0.2, 0.2)],
            [x + dx * reach, -0.3, z + dz * reach],
          ],
          [tr * 0.42, tr * 0.24, tr * 0.08],
          5,
          bark,
          () => 0,
          () => 0.62,
          0.9,
        );
      }

      /* Buttresses on the giants: thin concave fins out to the ground. */
      if (t.buttress) {
        const fins = 4 + Math.floor(rng() * 2);
        for (let f = 0; f < fins; f++) {
          const a = (f / fins) * Math.PI * 2 + r(-0.3, 0.3);
          const dx = Math.cos(a);
          const dz = Math.sin(a);
          const reach = r(1.8, 3.2);
          const hb = r(2.4, 3.6);
          for (let st = 0; st < 4; st++) {
            const t0 = st / 4;
            const t1 = (st + 1) / 4;
            const y0 = hb * Math.pow(1 - t0, 1.8);
            const y1 = hb * Math.pow(1 - t1, 1.8);
            const o0: V3 = [x + dx * (tr + reach * t0), y0 - 0.25, z + dz * (tr + reach * t0)];
            const o1: V3 = [x + dx * (tr + reach * t1), y1 - 0.25, z + dz * (tr + reach * t1)];
            const i0: V3 = [x + dx * tr * 0.6, y0 * 0.2 - 0.25, z + dz * tr * 0.6];
            const i1: V3 = [x + dx * tr * 0.6, y1 * 0.2 - 0.25, z + dz * tr * 0.6];
            wood.tri(i0, o0, o1, bark, 0.55, 0.75, 0.6, 0, 0, 0);
            wood.tri(i0, o1, i1, bark, 0.55, 0.6, 0.45, 0, 0, 0);
          }
        }
      }

      /* Limbs, each curving up and out to a cluster, some forking a twig. */
      const hang = z > -36;
      for (let k = 0; k < t.limbs; k++) {
        const a = t.lean !== undefined
          ? t.lean + r(-1.1, 1.1)
          : (k / t.limbs) * Math.PI * 2 + r(-0.45, 0.45);
        const u0 = r(0.5, 0.88);
        const o = trunkAt(u0);
        const len = t.spread * r(0.55, 1);
        const rise = len * r(0.3, 0.75);
        const dx = Math.cos(a);
        const dz = Math.sin(a);
        const mid: V3 = [o[0] + dx * len * 0.5, o[1] + rise * 0.62, o[2] + dz * len * 0.5];
        const tip: V3 = [o[0] + dx * len, o[1] + rise, o[2] + dz * len];
        const lr = tr * (0.55 - 0.25 * u0);
        tube(wood, [o, mid, tip], [lr, lr * 0.65, lr * 0.3], 5, bark, (i) => i * 0.15 * t.sway, () => 0.7, 0.35);
        cluster(tip, t.cluster * r(0.85, 1.15), t.green, t.sway, hang && k < 2);
        if (rng() < 0.55) {
          const ta = a + r(-1, 1);
          const tl = len * r(0.35, 0.55);
          const twig: V3 = [mid[0] + Math.cos(ta) * tl, mid[1] + tl * r(0.2, 0.6), mid[2] + Math.sin(ta) * tl];
          tube(wood, [mid, twig], [lr * 0.45, lr * 0.15], 4, bark, (i) => i * 0.2 * t.sway, () => 0.7, 0.3);
          cluster(twig, t.cluster * r(0.6, 0.8), t.green, t.sway, false);
        }
      }
      /* The leader: the trunk's own top clump. */
      cluster(trunkAt(1), t.cluster * r(1, 1.25), t.green, t.sway, false);
    };

    /* -- the thicket ------------------------------------------------------- */
    for (let i = 0; i < budget.trees; i++) {
      if (i % 4 === 3) yield;
      const near = i < budget.trees * 0.3;
      const angle = rng() * Math.PI * 2;
      const radius = near ? r(10, 20) : r(20, 52);
      const x = Math.cos(angle) * radius;
      const z = -Math.abs(Math.sin(angle) * radius) - (near ? 1 : 8);
      if (z > 4 || inCorridor(x, z, 1.5)) continue;
      const h = (near ? 8.5 : 10) + rng() * (near ? 4 : 6);
      growTree({
        x, z, h,
        tr: r(0.2, 0.36),
        spread: r(2.6, 4.2),
        limbs: 3 + Math.floor(rng() * 3),
        cluster: r(1.25, 1.8),
        bark: BARK,
        green: pick(CANOPY),
        sway: 1,
      });
    }

    yield;
    /* -- the giants: pale-barked, buttressed, spreading over everything ---- */
    for (let i = 0; i < budget.emergents; i++) {
      yield;
      const x = r(-46, 46);
      const z = r(-58, -26);
      if (inCorridor(x, z, 4)) continue;
      growTree({
        x, z,
        h: r(17, 25),
        tr: r(0.55, 0.85),
        spread: r(6, 9),
        limbs: 6 + Math.floor(rng() * 3),
        cluster: r(2.2, 3),
        bark: BARK_PALE,
        green: pick(CANOPY.slice(1)),
        buttress: true,
        sway: 0.6,
      });
    }

    yield;
    /* -- the overhang ------------------------------------------------------
       Tall trees just off either side of the trail whose limbs reach in over
       it. This is the canopy overhead — made of real branches and clumps with
       sky between them, where an earlier version floated flat slabs. The sun
       side is left open so light still falls down the trail. */
    for (let i = 0; i < budget.ceiling; i++) {
      yield;
      const side = i % 2 === 0 ? 1 : -1;
      const x = side * r(7, 16);
      const z = r(-26, 0);
      if (side < 0 && z < -8) continue;
      growTree({
        x, z,
        h: r(14, 18),
        tr: r(0.35, 0.5),
        spread: r(6, 8.5),
        limbs: 4 + Math.floor(rng() * 3),
        cluster: r(1.7, 2.3),
        bark: BARK,
        green: pick(CANOPY.slice(0, 3)),
        lean: side > 0 ? Math.PI : 0,
        sway: 0.4,
      });
    }

    yield;
    /* ======================================================================
       7. PALMS
       ======================================================================
       Curved, ringed stems with a crown of arching fronds. Their silhouettes
       against the haze are the fastest "tropical" read there is.
       ====================================================================== */
    for (let i = 0; i < budget.palms; i++) {
      const side = rng() < 0.5 ? -1 : 1;
      const x = side * r(3.5, 26);
      const z = r(-30, -3);
      if (inCorridor(x, z, 1.5)) continue;
      const h = r(4.5, 8.5);
      const tr = r(0.12, 0.18);
      trunks.push({ x, z, r: tr });
      const la = rng() * Math.PI * 2;
      const bend = r(0.6, 2.2);
      const pts: V3[] = [];
      const radii: number[] = [];
      const segs = 8;
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        pts.push([x + Math.cos(la) * bend * t * t, -0.2 + (h + 0.2) * t, z + Math.sin(la) * bend * t * t]);
        radii.push(tr * (1.35 - 0.4 * t));
      }
      wood.setAnchor([x, 0, z]);
      /* Alternating ring tone — the scars where old fronds fell. */
      tube(wood, pts, radii, 6, PALM_BARK, () => 0, (k, y) => (k % 2 ? 0.8 : 1) * (0.5 + 0.5 * smooth(0, 3, y)));

      const top = pts[segs];
      foliage.setAnchor(top);
      const fronds = 8 + Math.floor(rng() * 4);
      const col = pick(PALM_LEAF);
      for (let f = 0; f < fronds; f++) {
        const a = (f / fronds) * Math.PI * 2 + r(-0.2, 0.2);
        const pitch = r(0.15, 0.75);
        const dir = norm([Math.cos(a), pitch, Math.sin(a)]);
        frond(foliage, top, dir, r(2.6, 3.8), 13, r(0.7, 0.95), r(0.35, 0.6), col, 0.5, 0.9);
      }
      /* A few coconuts tucked under the crown. */
      for (let k = 0; k < 3; k++) {
        const c: V3 = [top[0] + r(-0.2, 0.2), top[1] - 0.25, top[2] + r(-0.2, 0.2)];
        blob(foliage, c, [0.13, 0.15, 0.13], quat(0, 0, 0), 0, PALM_BARK, rng() * 100, 0.3, { ao: 0.4 });
      }
    }

    yield;
    /* ======================================================================
       8. LIANAS
       ======================================================================
       Hanging vines from crown undersides, and a few swags slung between two
       crowns. Thin three-sided tubes — at this width no one sees the sides.
       ====================================================================== */
    {
      const n = Math.min(budget.lianas, hangPoints.length);
      for (let i = 0; i < n; i++) {
        const p = hangPoints[Math.floor(rng() * hangPoints.length)];
        if (inCorridor(p[0], p[2], 0.5) && p[1] < 12) continue;
        const rad = r(0.025, 0.055);
        const pts: V3[] = [];
        const radii: number[] = [];
        const segs = 10;
        wood.setAnchor(p);
        if (rng() < 0.3) {
          /* A swag between two crowns: a catenary, approximated by a parabola. */
          const q = hangPoints[Math.floor(rng() * hangPoints.length)];
          const span = Math.hypot(q[0] - p[0], q[2] - p[2]);
          if (span < 2 || span > 12) continue;
          const sag = span * r(0.25, 0.5);
          for (let k = 0; k <= segs; k++) {
            const t = k / segs;
            pts.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t - sag * 4 * t * (1 - t), p[2] + (q[2] - p[2]) * t]);
            radii.push(rad);
          }
          tube(wood, pts, radii, 3, LIANA, (k) => Math.sin((k / segs) * Math.PI) * 0.5, () => 0.8);
        } else {
          const len = Math.min(p[1] - 0.6, r(3, 9));
          const drift = r(-0.6, 0.6);
          for (let k = 0; k <= segs; k++) {
            const t = k / segs;
            pts.push([p[0] + drift * t * t, p[1] - len * t, p[2] + drift * 0.5 * t * t]);
            radii.push(rad * (1 - 0.4 * t));
          }
          tube(wood, pts, radii, 3, LIANA, (k) => (k / segs) * 0.8, () => 0.8);
          /* Leaf tufts along the lower half, so it reads as a living vine. */
          foliage.setAnchor(p);
          for (let k = 5; k <= segs; k += 2) {
            const a = rng() * Math.PI * 2;
            leaf(foliage, pts[k], norm([Math.cos(a), r(-0.2, 0.3), Math.sin(a)]), r(0.25, 0.4), 0.09, 0.3, CANOPY[3], (k / segs) * 0.8, 0.1, 2);
          }
        }
      }
    }

    yield;
    /* ======================================================================
       9. UNDERSTORY — broadleaf plants and bananas
       ======================================================================
       Big simple leaves at knee-to-head height. The few nearest the camera sit
       in the lower corners and do the framing the near blobs of an earlier
       version could not: they are low, thin and leafy, so they read as a
       foreground rather than as a wall.
       ====================================================================== */
    const plantAt = (x: number, z: number, scale: number, banana: boolean) => {
      const col = pick(BROADLEAF);
      const base: V3 = [x, -0.1, z];
      foliage.setAnchor(base);
      if (banana) {
        /* Pseudostem, then long leaves arching up and over. */
        const sh = r(1.0, 1.8) * scale;
        wood.setAnchor(base);
        tube(wood, [base, [x, sh, z]], [0.1 * scale, 0.07 * scale], 5, new THREE.Color('#6f8a3a'), (k) => k * 0.2);
        const leaves = 5 + Math.floor(rng() * 3);
        for (let k = 0; k < leaves; k++) {
          const a = (k / leaves) * Math.PI * 2 + r(-0.3, 0.3);
          leaf(foliage, [x, sh, z], norm([Math.cos(a), r(0.5, 1.1), Math.sin(a)]), r(1.6, 2.4) * scale, r(0.32, 0.42) * scale, r(0.45, 0.7), col, 0.2, 0.8, 6);
        }
      } else {
        const leaves = 4 + Math.floor(rng() * 4);
        for (let k = 0; k < leaves; k++) {
          const a = rng() * Math.PI * 2;
          const stem = r(0.35, 0.8) * scale;
          const tip: V3 = [x + Math.cos(a) * stem * 0.5, stem, z + Math.sin(a) * stem * 0.5];
          wood.setAnchor(base);
          tube(wood, [base, tip], [0.025 * scale, 0.018 * scale], 3, new THREE.Color('#5d7c2c'), (i) => i * 0.3);
          leaf(foliage, tip, norm([Math.cos(a), r(-0.05, 0.4), Math.sin(a)]), r(0.7, 1.2) * scale, r(0.3, 0.45) * scale, r(0.3, 0.55), col, 0.3, 0.6, 4);
        }
      }
    };

    /* Framing plants: bottom corners, just in front of the camera's feet. */
    plantAt(-3.7, 5.2, 1.2, false);
    plantAt(4.1, 4.6, 1.3, false);
    plantAt(-5.6, 1.5, 1.1, true);
    plantAt(6.2, 0.4, 1.05, true);

    for (let i = 0; i < budget.broadleaf; i++) {
      if (i % 20 === 19) yield;
      const x = (rng() < 0.5 ? -1 : 1) * r(2.4, 30);
      const z = r(-40, 3);
      if (inCorridor(x, z, 0.4)) continue;
      plantAt(x, z, r(0.7, 1.2), rng() < 0.25);
    }

    yield;
    /* ======================================================================
       10. FERNS
       ====================================================================== */
    for (let i = 0; i < budget.ferns; i++) {
      if (i % 25 === 24) yield;
      const x = (rng() < 0.5 ? -1 : 1) * r(1.6, 32);
      const z = r(-42, 7);
      if (Math.abs(x) < 2.2 && z > -12) continue;
      const base: V3 = [x, -0.1, z];
      foliage.setAnchor(base);
      const fronds = 7 + Math.floor(rng() * 5);
      const s = r(0.6, 1.3);
      const col = FERN.clone().lerp(BROADLEAF[1], rng() * 0.4);
      for (let f = 0; f < fronds; f++) {
        const a = (f / fronds) * Math.PI * 2 + r(-0.3, 0.3);
        frond(foliage, base, norm([Math.cos(a), r(0.7, 1.4), Math.sin(a)]), r(0.9, 1.5) * s, 10, 0.26 * s, r(0.55, 0.9), col, 0, 0.7);
      }
    }

    yield;
    /* ======================================================================
       11. ROCKS
       ======================================================================
       Squashed hard so they sit on the ground rather than in it, with moss
       grown over every face that points up.
       ====================================================================== */
    for (let i = 0; i < budget.rocks; i++) {
      const x = (rng() - 0.5) * 70;
      const z = r(-44, 7);
      if (inCorridor(x, z)) continue;
      const rad = r(0.4, 1.6);
      const c: V3 = [x, rad * 0.25 - 0.15, z];
      wood.setAnchor(c);
      blob(wood, c, [rad * 1.3, rad * 0.62, rad * 1.1], quat(r(-0.2, 0.2), rng() * 6, r(-0.2, 0.2)), budget.blobDetail, ROCK, rng() * 100, 0, { top: MOSS, ao: 0.5, facet: 0.7, jitter: 0.4 });
    }

    /* -- commit the batches ----------------------------------------------- */
    const shadowed = budget.shadow > 0;
    const commit = (batch: Batch, mat: THREE.Material, translucent: boolean) => {
      const geo = track(batch.build());
      track(mat);
      patchMerged(mat, U, translucent);
      const mesh = new THREE.Mesh(geo, mat);
      /* Wind moves vertices outside the baked bounds; culling against them
         could pop a whole batch out of frame. */
      mesh.frustumCulled = false;
      mesh.castShadow = shadowed;
      mesh.receiveShadow = shadowed;
      scene.add(mesh);
    };
    commit(foliage, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), true);
    yield;
    {
      const bark = makeBarkTexture(rng);
      if (bark) track(bark);
      commit(wood, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: bark }), false);
    }
    yield;
    {
      const tex = makeLeafTexture(rng);
      if (tex) {
        track(tex);
        commit(
          cards,
          new THREE.MeshLambertMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
            map: tex,
            /* The shadow pass reads alphaTest too, so the light that reaches
               the floor is shaped like leaves, not like cards. With MSAA on,
               alpha-to-coverage turns the hard cut-out edge into a soft one. */
            alphaTest: 0.5,
            alphaToCoverage: tier !== 'low',
          }),
          true,
        );
      }
    }

    yield;
    /* -- 3. GROUND (now the trunks are known) ------------------------------ */
    {
      const seg = budget.groundSegments;
      const geo = track(new THREE.PlaneGeometry(260, 260, seg, seg));
      geo.rotateX(-Math.PI / 2);
      const p = geo.getAttribute('position') as THREE.BufferAttribute;
      const colors = new Float32Array(p.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        if (i % 2500 === 2499) yield;
        const x = p.getX(i);
        const z = p.getZ(i);
        /* THE CAMERA MUST NEVER BE INSIDE THE TERRAIN: small amplitude, and
           faded to dead flat within ~16 units of the viewer. */
        const nearCam = Math.max(0, 1 - Math.hypot(x, z - 9) / 16);
        const roll = Math.sin(x * 0.07) * 0.32 + Math.cos(z * 0.05) * 0.38 + (rng() - 0.5) * 0.12;
        p.setY(i, roll * (1 - nearCam) - 0.25);

        const mossy = smooth(-0.2, 0.7, Math.sin(x * 0.19 + Math.cos(z * 0.23) * 1.7) * Math.cos(z * 0.17 - x * 0.05));
        c.copy(LOAM).lerp(GROUND_MOSS, mossy * 0.85);
        let ao = 1;
        for (const t of trunks) {
          const d = Math.hypot(x - t.x, z - t.z);
          if (d < t.r * 12) ao = Math.min(ao, 0.5 + 0.5 * smooth(t.r, t.r * 12, d));
        }
        const k = ao * (0.9 + rng() * 0.2);
        colors[i * 3] = c.r * k;
        colors[i * 3 + 1] = c.g * k;
        colors[i * 3 + 2] = c.b * k;
      }
      p.needsUpdate = true;
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      yield;
      const litter = makeLitterTexture(rng);
      if (litter) track(litter);
      const mat = track(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: litter }));
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uSunCol = U.uSunCol;
        shader.uniforms.uDapple = U.uDapple;
        shader.vertexShader = shader.vertexShader
          .replace('void main() {', 'varying vec2 vWorldXZ;\nvoid main() {')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
        shader.fragmentShader =
          `varying vec2 vWorldXZ;\n${DAPPLE_FN}\n` +
          shader.fragmentShader.replace(
            '#include <opaque_fragment>',
            `outgoingLight *= mix(vec3(1.0), 0.62 + dapple(vWorldXZ) * 1.1 * uSunCol, uDapple);
             #include <opaque_fragment>`,
          );
      };
      const ground = new THREE.Mesh(geo, mat);
      ground.receiveShadow = budget.shadow > 0;
      scene.add(ground);
    }

    yield;
    /* ======================================================================
       12. GROUND COVER
       ======================================================================
       A rainforest floor is not a lawn. An earlier pass used single-triangle
       grass blades, and thousands of identical straight spikes read as fake
       at a glance. This is low, broad-leaved cover instead — rosettes of
       drooping oval leaves and small seedlings on a stem — instanced, tinted
       per plant, and thinned out down the middle into a faint worn trail.
       ====================================================================== */
    {
      const white = new THREE.Color(1, 1, 1);
      const stem = new THREE.Color(0.85, 0.9, 0.75);
      const shapeRng = makeRng(77);
      const sr = (a: number, b: number) => a + shapeRng() * (b - a);
      const toGeo = (bt: Batch) => {
        const g = bt.build();
        g.deleteAttribute('aAnchor');
        g.deleteAttribute('aSway');
        g.deleteAttribute('uv');
        return track(g);
      };

      /* Rosette: six drooping oval leaves round a low centre. */
      const rosette = new Batch();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + sr(-0.25, 0.25);
        leaf(rosette, [0, 0.03, 0], norm([Math.cos(a), sr(0.25, 0.6), Math.sin(a)]), sr(0.26, 0.34), sr(0.1, 0.13), sr(0.55, 0.85), white, 0, 1, 2);
      }
      /* Seedling: a short stem with paired leaves up it. */
      const sprig = new Batch();
      tube(sprig, [[0, 0, 0], [0.02, 0.2, 0.01], [0.03, 0.38, 0]], [0.012, 0.009, 0.006], 3, stem, (i) => i * 0.5, () => 0.85);
      for (const [y, len] of [[0.14, 0.15], [0.26, 0.13], [0.36, 0.11]] as const) {
        const a = sr(0, Math.PI);
        for (const sgn of [1, -1]) {
          leaf(sprig, [0.02, y, 0], norm([Math.cos(a) * sgn, 0.35, Math.sin(a) * sgn]), len, len * 0.42, 0.5, white, 0, 1, 2);
        }
      }

      const tints = [GRASS, BROADLEAF[0], BROADLEAF[2], CANOPY[3], FERN, new THREE.Color('#9aae45')];
      const place = (geo: THREE.BufferGeometry, count: number, scaleMin: number, scaleMax: number) => {
        const mat = track(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
        patchInstanced(mat, U, 'clamp(position.y * 2.5 + length(position.xz) * 1.4, 0.0, 1.0)', true);
        const mesh = new THREE.InstancedMesh(geo, mat, count);
        mesh.receiveShadow = budget.shadow > 0;
        const dummy = new THREE.Object3D();
        const tint = new THREE.Color();
        let n = 0;
        for (let i = 0; i < count; i++) {
          /* Densest at the viewer's feet, where each plant is big enough to
             read; thinning out to where the haze takes over anyway. */
          const d = Math.pow(rng(), 0.75) * 30;
          const a = rng() * Math.PI * 2;
          const x = Math.cos(a) * d;
          const z = -3 + Math.sin(a) * d;
          /* The trail: a wandering strip down the middle that plants mostly
             leave alone, as if it is walked. */
          if (z > -34 && Math.abs(x - Math.sin(z * 0.18) * 0.5) < 0.85 && rng() < 0.9) continue;
          dummy.position.set(x, -0.22, z);
          dummy.rotation.set((rng() - 0.5) * 0.25, rng() * Math.PI * 2, (rng() - 0.5) * 0.25);
          dummy.scale.setScalar(r(scaleMin, scaleMax));
          dummy.updateMatrix();
          mesh.setMatrixAt(n, dummy.matrix);
          tint.copy(pick(tints)).lerp(pick(tints), rng() * 0.5).multiplyScalar(0.85 + rng() * 0.3);
          mesh.setColorAt(n, tint);
          n++;
        }
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.frustumCulled = false;
        scene.add(mesh);
      };
      place(toGeo(rosette), Math.round(budget.grass * 0.65), 0.9, 2.1);
      place(toGeo(sprig), Math.round(budget.grass * 0.35), 1, 2);
    }

    yield;
    /* ======================================================================
       13. FLOWERS
       ======================================================================
       Rare pops of heliconia red, orange and orchid pink. They only read as
       precious because there are few of them.
       ====================================================================== */
    {
      const geo = track(new THREE.IcosahedronGeometry(0.06, 0));
      const mat = track(new THREE.MeshLambertMaterial({ emissive: new THREE.Color('#2a0c05') }));
      patchInstanced(mat, U, '0.5', false);
      const mesh = new THREE.InstancedMesh(geo, mat, budget.flowers);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < budget.flowers; i++) {
        const d = Math.sqrt(rng()) * 24;
        const a = rng() * Math.PI * 2;
        const x = Math.cos(a) * d;
        const z = -9 + Math.sin(a) * d;
        dummy.position.set(Math.abs(x) < 1.2 ? x + Math.sign(x || 1) * 1.5 : x, r(0.15, 0.9), z);
        dummy.rotation.set(rng() * 3, rng() * 3, rng() * 3);
        dummy.scale.set(r(0.7, 1.4), r(1.2, 2.2), r(0.7, 1.4));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, pick(BLOOMS));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
    }

    yield;
    /* ======================================================================
       14. MIST
       ======================================================================
       Ground-hugging haze in three wide cards at increasing depth: opaque-ish
       at the base, gone by treetop height, with a slow horizontal variation so
       it is not a ruler-straight band. Transparent layers are pure fill rate,
       so there are three and they only cover the lower part of the frame.
       ====================================================================== */
    {
      const geo = track(new THREE.PlaneGeometry(1, 1));
      const layers: [number, number, number][] = [
        [-22, 7, 0.32],
        [-42, 11, 0.45],
        [-64, 16, 0.6],
      ];
      for (const [z, height, opacity] of layers) {
        const mat = track(
          new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            fog: false,
            uniforms: { uCol: M.uLow, uOpacity: { value: opacity }, uSeed: { value: z } },
            vertexShader: `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`,
            fragmentShader: `
  uniform vec3 uCol;
  uniform float uOpacity;
  uniform float uSeed;
  varying vec2 vUv;
  void main() {
    float x = vUv.x * 18.0 + uSeed;
    float wave = 0.14 * sin(x * 1.3) + 0.09 * sin(x * 3.7 + 1.2) + 0.05 * sin(x * 7.1);
    float h = clamp(vUv.y - wave, 0.0, 1.0);
    float a = pow(1.0 - h, 2.2) * uOpacity;
    a *= smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
    gl_FragColor = vec4(uCol, a);
  }`,
          }),
        );
        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.set(320, height, 1);
        mesh.position.set(0, height / 2 - 0.4, z);
        scene.add(mesh);
      }
    }

    yield;
    /* ======================================================================
       15. LIGHT SHAFTS
       ======================================================================
       Open cones along the sun direction, additive, with their edges faded by
       how side-on the surface is to the eye. That view-dependent fade is the
       whole trick — without it you see a cone; with it you see a beam.
       ====================================================================== */
    {
      const geo = track(new THREE.CylinderGeometry(0.9, 2.6, 1, 16, 1, true));
      /* Pivot at the ground end so scale.y is simply the beam's length. */
      geo.translate(0, 0.5, 0);
      const up = new THREE.Vector3(0, 1, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(up, SUN_DIR);
      for (let i = 0; i < budget.shafts; i++) {
        const gx = r(-20, 16);
        const gz = r(-34, -6);
        if (Math.abs(gx) < 1.5 && gz > -10) continue;
        const mat = track(
          new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            fog: false,
            uniforms: {
              uCol: { value: SUN.clone() },
              uIntensity: { value: r(0.32, 0.55) },
              uShafts: M.uShafts,
              uTime: U.uTime,
              uSeed: { value: rng() * 10 },
            },
            vertexShader: `
  varying vec3 vN;
  varying vec3 vView;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = mv.xyz;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }`,
            fragmentShader: `
  uniform vec3 uCol;
  uniform float uIntensity;
  uniform float uShafts;
  uniform float uTime;
  uniform float uSeed;
  varying vec3 vN;
  varying vec3 vView;
  varying vec2 vUv;
  void main() {
    float facing = abs(dot(normalize(vN), normalize(-vView)));
    float edge = pow(facing, 2.5);
    /* Bright where the beam leaves the canopy, fading as it reaches the floor
       and fading out entirely at the canopy end so it has no hard cap. */
    float along = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
    float streak = 0.7 + 0.3 * sin(vUv.x * 6.2832 * 5.0 + uSeed + uTime * 0.15);
    float nearFade = smoothstep(2.0, 9.0, -vView.z);
    float a = edge * along * streak * nearFade * uIntensity * uShafts;
    gl_FragColor = vec4(uCol * a, a);
  }`,
          }),
        );
        shaftMats.push(mat);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(gx, -0.2, gz);
        mesh.quaternion.copy(q);
        mesh.scale.set(r(0.8, 1.5), 16 / SUN_DIR.y, r(0.8, 1.5));
        mesh.renderOrder = 5;
        scene.add(mesh);
      }
    }

    yield;
    /* ======================================================================
       16. POLLEN
       ======================================================================
       Warm specks hanging in the air near the camera. They drift only while
       the loop is running (i.e. while the pointer is stirring the scene) —
       at rest they are a still frame like everything else.
       ====================================================================== */
    if (budget.motes > 0) {
      const n = budget.motes;
      const pos = new Float32Array(n * 3);
      const seeds = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = r(-11, 11);
        pos[i * 3 + 1] = r(0.3, 6.5);
        pos[i * 3 + 2] = r(-18, 6);
        seeds[i] = rng();
      }
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
      motesMat = track(
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
          uniforms: {
            uTime: U.uTime,
            uCol: M.uMote,
            uSize: M.uMoteSize,
            uBlink: M.uBlink,
            uScale: { value: renderer.getPixelRatio() * window.innerHeight * 0.5 },
          },
          vertexShader: `
  uniform float uTime;
  uniform float uScale;
  uniform float uSize;
  uniform float uBlink;
  attribute float aSeed;
  varying float vA;
  void main() {
    vec3 p = position;
    float t = uTime * 0.25 + aSeed * 40.0;
    p += vec3(sin(t) * 0.35, sin(t * 0.7 + 1.3) * 0.25, cos(t * 0.8) * 0.3);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float d = -mv.z;
    gl_PointSize = clamp(uScale * (0.018 + aSeed * 0.022) * uSize / d, 1.0, 14.0);
    vA = (0.35 + 0.65 * (0.5 + 0.5 * sin(t * 2.3))) * smoothstep(1.2, 4.0, d) * (1.0 - smoothstep(18.0, 26.0, d));
    /* Daytime only: at dusk the fireflies below take over. */
    vA *= 1.0 - uBlink;
    gl_Position = projectionMatrix * mv;
  }`,
          fragmentShader: `
  uniform vec3 uCol;
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(c)) * vA * 0.8;
    gl_FragColor = vec4(uCol * a, a);
  }`,
        }),
      );
      const pts = new THREE.Points(geo, motesMat);
      pts.frustumCulled = false;
      pts.renderOrder = 6;
      scene.add(pts);
    }

    yield;
  }

  /* ======================================================================
     17. VIGNETTE + SUN BLOOM (screen-space overlay pass)
     ======================================================================
     One full-screen quad after the scene. It darkens the corners toward
     canopy-shadow green — legibility for the dark wood chrome on top — and
     adds a warm glow toward the sun's screen position, which does most of
     what a bloom pass would for none of the render-target cost.

     Premultiplied blending (ONE, ONE_MINUS_SRC_ALPHA) lets a single shader
     do both: alpha darkens, and the RGB on top of that adds light.
     ====================================================================== */
  const overlayScene = new THREE.Scene();
  const overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const overlayU = {
    uSun: { value: new THREE.Vector2(-0.6, 0.9) },
    uAspect: { value: window.innerWidth / Math.max(1, window.innerHeight) },
    uSunCol: U.uSunCol,
    uVig: { value: MOODS.day.vignette.clone() },
    uVigAmt: { value: MOODS.day.vignetteAmt },
    uBloom: { value: 1 },
  };
  {
    const geo = track(new THREE.PlaneGeometry(2, 2));
    const mat = track(
      new THREE.ShaderMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        uniforms: overlayU,
        vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,
        fragmentShader: `
uniform vec2 uSun;
uniform float uAspect;
uniform vec3 uSunCol;
uniform vec3 uVig;
uniform float uVigAmt;
uniform float uBloom;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float v = length(p * vec2(0.72, 0.86) + vec2(0.0, 0.1));
  float a = smoothstep(0.62, 1.45, v) * uVigAmt;
  vec3 dark = uVig * a;
  vec2 d = (p - uSun) * vec2(uAspect, 1.0);
  float g = (exp(-dot(d, d) * 0.9) * 0.34 + exp(-dot(d, d) * 7.0) * 0.18) * uBloom;
  gl_FragColor = vec4(dark + uSunCol * g * (1.0 - a), a);
}`,
      }),
    );
    overlayScene.add(new THREE.Mesh(geo, mat));
  }

  const sunScratch = new THREE.Vector3();
  function updateSun() {
    camera.updateMatrixWorld();
    U.uSunView.value.copy(SUN_DIR).transformDirection(camera.matrixWorldInverse);
    sunScratch.copy(camera.position).addScaledVector(SUN_DIR, 150).project(camera);
    /* Behind the camera the projection mirrors; park the glow off-screen. */
    if (sunScratch.z > 1) overlayU.uSun.value.set(0, 9);
    else overlayU.uSun.value.set(sunScratch.x, sunScratch.y);
  }

  /* ======================================================================
     Fireflies
     ======================================================================
     Their own little scene, drawn after the forest, so they can keep moving
     while the forest stays a still frame. Each one wanders on a slow loop and
     blinks on its own clock: mostly dark, then a soft green-gold flash with a
     halo. At dusk this is the whole mood, so there are a lot of them.
     ====================================================================== */
  const fireflyScene = new THREE.Scene();
  const fireflyU = {
    uTime: U.uTime,
    uEve: { value: 0 },
    uScale: { value: renderer.getPixelRatio() * window.innerHeight * 0.5 },
    uCol: { value: new THREE.Color('#d8ff6e') },
  };
  if (budget.fireflies > 0) {
    const frng = makeRng(4242);
    const n = budget.fireflies;
    const pos = new Float32Array(n * 3);
    const seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const z = -36 + Math.pow(frng(), 0.7) * 43;
      pos[i * 3] = (frng() - 0.5) * (14 + (7 - z) * 0.6);
      pos[i * 3 + 1] = 0.2 + Math.pow(frng(), 1.6) * 4.8;
      pos[i * 3 + 2] = z;
      seeds[i] = frng();
    }
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    const mat = track(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        uniforms: fireflyU,
        vertexShader: `
uniform float uTime;
uniform float uScale;
uniform float uEve;
attribute float aSeed;
varying float vA;
void main() {
  float s = aSeed;
  float t = uTime * 0.32 + s * 50.0;
  vec3 p = position + vec3(
    sin(t * 0.9 + s * 13.0) * 0.9 + sin(t * 2.1 + s * 3.0) * 0.25,
    sin(t * 0.7 + s * 7.0) * 0.45,
    cos(t * 0.8 + s * 11.0) * 0.9
  );
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = -mv.z;
  float blink = smoothstep(0.05, 1.0, sin(uTime * (0.7 + s * 0.9) + s * 40.0));
  vA = blink * uEve * smoothstep(0.8, 3.0, d);
  gl_PointSize = clamp(uScale * (0.42 + s * 0.3) / d, 5.0, 56.0) * (0.55 + 0.45 * blink);
  gl_Position = projectionMatrix * mv;
}`,
        fragmentShader: `
uniform vec3 uCol;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c);
  /* A tiny hot core inside a wide soft glow: at this size the sprite is
     mostly halo, which is what reads as a light rather than a dot. */
  float core = exp(-r2 * 260.0) * 1.4;
  float halo = exp(-r2 * 22.0) * 0.5 + exp(-r2 * 7.0) * 0.12;
  float a = (core + halo) * vA;
  gl_FragColor = vec4(mix(uCol, vec3(1.0, 1.0, 0.8), min(core, 1.0) * 0.5) * a, a);
}`,
      }),
    );
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    fireflyScene.add(pts);
  }

  /* -- the cached frame ----------------------------------------------------
     Letting fireflies move at rest must not mean redrawing the forest 30
     times a second. The forest is rendered once into a texture (colour AND
     depth); each ambient frame copies it to the screen — writing the depth
     back too, so fireflies still disappear behind trunks and leaves — and
     draws only the fireflies on top. An idle evening page therefore costs a
     full-screen copy and a few hundred points, not 200k triangles.

     The target is sRGB so it stores exactly what the screen would have shown
     with the same precision in the darks; the copy decodes and re-encodes, so
     the cached path is pixel-identical to the direct one. */
  const stillPreferred =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ambientAllowed = !stillPreferred && budget.fireflies > 0;
  const ambientThrottle = createFrameThrottle(30);
  let cache: THREE.WebGLRenderTarget | null = null;
  let sceneDirty = true;
  const bufSize = new THREE.Vector2();
  const blitScene = new THREE.Scene();
  const blitU = {
    tColor: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
  };
  {
    const geo = track(new THREE.PlaneGeometry(2, 2));
    const mat = track(
      new THREE.ShaderMaterial({
        depthTest: true,
        depthWrite: true,
        depthFunc: THREE.AlwaysDepth,
        uniforms: blitU,
        vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,
        fragmentShader: `
uniform sampler2D tColor;
uniform sampler2D tDepth;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(tColor, vUv);
  gl_FragDepth = texture2D(tDepth, vUv).x;
  #include <colorspace_fragment>
}`,
      }),
    );
    const quad = new THREE.Mesh(geo, mat);
    quad.frustumCulled = false;
    blitScene.add(quad);
  }

  function drawForestIntoCache() {
    renderer.getDrawingBufferSize(bufSize);
    if (!cache) {
      cache = new THREE.WebGLRenderTarget(bufSize.x, bufSize.y, {
        samples: tier === 'low' ? 0 : 4,
        colorSpace: THREE.SRGBColorSpace,
        depthTexture: new THREE.DepthTexture(bufSize.x, bufSize.y),
      });
      blitU.tColor.value = cache.texture;
      blitU.tDepth.value = cache.depthTexture;
    } else if (cache.width !== bufSize.x || cache.height !== bufSize.y) {
      cache.setSize(bufSize.x, bufSize.y);
    }
    renderer.setRenderTarget(cache);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    sceneDirty = false;
  }

  function drawFromCache() {
    renderer.render(blitScene, overlayCam);
  }

  /* ======================================================================
     Time of day
     ======================================================================
     moodT runs 0 (day) to 1 (evening). Every mood parameter is lerped from
     it, so the switch is a ~1.4s dusk/dawn rather than a cut. While it runs
     the shadow map is redrawn each frame (the sun is moving); once it lands
     the map is static again.
     ====================================================================== */
  const tmpC = new THREE.Color();
  const tierDapple = budget.shadow > 0 ? 0.3 : 1;
  const hazeNow = new THREE.Color();
  function applyMood(t: number) {
    const a = MOODS.day;
    const b = MOODS.evening;
    const k = t * t * (3 - 2 * t);
    const L = (x: number, y: number) => x + (y - x) * k;
    const C = (out: THREE.Color, x: THREE.Color, y: THREE.Color) => out.copy(x).lerp(y, k);
    C(M.uTop.value, a.skyTop, b.skyTop);
    C(hazeNow, a.haze, b.haze);
    M.uLow.value.copy(hazeNow);
    (scene.fog as THREE.FogExp2).color.copy(hazeNow);
    (scene.fog as THREE.FogExp2).density = L(a.fog, b.fog);
    renderer.setClearColor(hazeNow);
    C(U.uSunCol.value, a.sun, b.sun);
    sun.color.copy(U.uSunCol.value);
    sun.intensity = L(a.sunI, b.sunI);
    SUN_DIR.copy(a.sunDir).lerp(b.sunDir, k).normalize();
    sun.position.copy(SUN_TARGET).addScaledVector(SUN_DIR, 70);
    C(hemi.color, a.hemiSky, b.hemiSky);
    C(hemi.groundColor, a.hemiGround, b.hemiGround);
    hemi.intensity = L(a.hemiI, b.hemiI);
    M.uShafts.value = L(a.shafts, b.shafts);
    C(M.uMote.value, a.mote, b.mote);
    M.uMoteSize.value = L(a.moteSize, b.moteSize);
    M.uBlink.value = L(a.blink, b.blink);
    fireflyU.uEve.value = smooth(0.35, 1, t);
    M.uStars.value = L(a.stars, b.stars);
    C(tmpC, a.vignette, b.vignette);
    overlayU.uVig.value.copy(tmpC);
    overlayU.uVigAmt.value = L(a.vignetteAmt, b.vignetteAmt);
    overlayU.uBloom.value = L(a.bloom, b.bloom);
    U.uTrans.value = L(a.trans, b.trans);
    U.uDapple.value = L(a.dapple, b.dapple) * tierDapple;
    renderer.shadowMap.needsUpdate = true;
  }

  let moodTarget = getJungleMood() === 'evening' ? 1 : 0;
  let moodT = moodTarget;
  applyMood(moodT);
  const unsubscribeMood = subscribeJungleMood((m) => {
    moodTarget = m === 'evening' ? 1 : 0;
    if (gate.isActive() && raf === null) start();
  });

  /* ======================================================================
     Interaction
     ====================================================================== */

  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Pointer -> a point on the ground, against a math plane rather than the
     ground mesh: closed-form, and it cannot miss through a gap. */
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  let targetStrength = 0;
  let targetYaw = 0;
  let targetPitch = 0;
  let yaw = 0;
  let pitch = 0;

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    ndc.x = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
    ndc.y = -((e.clientY / Math.max(1, window.innerHeight)) * 2 - 1);
    ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(groundPlane, hit)) {
      U.uHover.value.copy(hit);
    }
    targetStrength = reduced ? 0 : 1;
    targetYaw = ndc.x * 0.05;
    targetPitch = ndc.y * 0.03;
    if (gate.isActive() && raf === null) start();
  };
  const onPointerLeave = () => {
    targetStrength = 0;
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('blur', onPointerLeave);

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
  let idleFrames = 0;
  let shown = false;

  function demote() {
    if (demoted || tier === 'low') return;
    demoted = true;
    tier = tier === 'high' ? 'mid' : 'low';
    budget = BUDGETS[tier];
    throttle = createFrameThrottle(budget.fps);
    capPixelRatio(renderer, window.innerWidth, window.innerHeight, budget.maxPixels, budget.maxRatio);
    /* The expensive transparent layers go first: they are pure fill rate. */
    for (const m of shaftMats) m.uniforms.uIntensity.value *= 0.7;
    sceneDirty = true;
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    capPixelRatio(renderer, w, h, budget.maxPixels, budget.maxRatio);
    overlayU.uAspect.value = camera.aspect;
    if (motesMat) motesMat.uniforms.uScale.value = renderer.getPixelRatio() * h * 0.5;
    fireflyU.uScale.value = renderer.getPixelRatio() * h * 0.5;
    sceneDirty = true;
    idleFrames = 0;
    if (gate.isActive() && raf === null) start();
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
    if (dt > 34 && dt < 500) {
      if (++slowFrames > 90) demote();
    } else if (dt < 24) {
      slowFrames = Math.max(0, slowFrames - 1);
    }

    U.uTime.value = clock.getElapsedTime();

    if (moodT !== moodTarget) {
      const step = Math.min(dt, 100) / 1400;
      moodT = moodTarget > moodT ? Math.min(moodTarget, moodT + step) : Math.max(moodTarget, moodT - step);
      applyMood(moodT);
    }

    const prevStrength = U.uStrength.value;
    U.uStrength.value += (targetStrength - U.uStrength.value) * 0.08;
    if (U.uStrength.value < 0.002) U.uStrength.value = 0;

    yaw += (targetYaw - yaw) * 0.05;
    pitch += (targetPitch - pitch) * 0.05;
    camera.position.x = CAM_BASE.x + yaw * 5;
    camera.position.y = CAM_BASE.y - pitch * 1.6;
    camera.position.z = CAM_BASE.z - push * 18;
    /* Nearly level from blade height: horizon just above centre, forest floor
       across the lower third, crowns and the canopy ceiling in the upper. */
    camera.lookAt(yaw * 3, 2.6 - pitch * 1.4, -26);
    updateSun();

    const moving =
      U.uStrength.value > 0 ||
      prevStrength > 0 ||
      push > 0 ||
      moodT !== moodTarget ||
      Math.abs(targetYaw - yaw) > 0.0005 ||
      Math.abs(targetPitch - pitch) > 0.0005;
    const ambient = ambientAllowed && fireflyU.uEve.value > 0.01;

    if (ambient) {
      /* Cached-frame path: the forest is drawn into a texture only when it
         actually changes; in between, each frame is one full-screen copy plus
         a few hundred points. */
      if (moving || sceneDirty || !cache) {
        drawForestIntoCache();
      } else if (!ambientThrottle(now)) {
        return;
      }
      drawFromCache();
      renderer.autoClear = false;
      renderer.render(fireflyScene, camera);
    } else {
      renderer.render(scene, camera);
      sceneDirty = true;
      renderer.autoClear = false;
    }
    renderer.render(overlayScene, overlayCam);
    renderer.autoClear = true;

    if (!shown) {
      shown = true;
      host.style.opacity = '1';
    }

    /* Park the loop when nothing is moving. It restarts on any pointer move,
       resize or dolly. In the evening it never parks — the fireflies are the
       one thing allowed to move on their own, and they run on the cache. */
    idleFrames = moving || ambient ? 0 : idleFrames + 1;
    if (idleFrames > 8) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  }

  function start() {
    if (!ready) return;
    if (raf === null) {
      lastFrame = performance.now();
      idleFrames = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  const gate = createRenderGate(host, start);

  /* BUILD IN SLICES. Generating ~150k triangles is a few hundred ms of CPU on
     a laptop; done in one go it freezes the page right as it is trying to
     become interactive. Instead the generator is pumped for ~8ms at a time
     and the page gets the thread back in between. The canvas stays hidden
     until the first frame, then fades in. */
  let ready = false;
  let cancelled = false;
  const work = populate();
  const pump = () => {
    if (cancelled) return;
    const until = performance.now() + 8;
    while (performance.now() < until) {
      if (work.next().done) {
        /* Shader compilation is the other freeze. A dozen programs compiled
           synchronously on the first render cost the better part of a second
           on Windows/ANGLE; compileAsync lets the driver do it in parallel
           off the critical path, and the first frame only draws once they
           are all ready. */
        const go = () => {
          if (cancelled) return;
          warmUp(0);
        };
        Promise.all([
          renderer.compileAsync(scene, camera),
          renderer.compileAsync(overlayScene, overlayCam),
          renderer.compileAsync(fireflyScene, camera),
        ]).then(go, go);
        return;
      }
    }
    setTimeout(pump, 0);
  };
  pump();

  /* GPU WARM-UP. The first draw uploads every vertex buffer and texture, and
     with ~15 meshes that is a quarter-second freeze in one go. While the
     canvas is still invisible, draw one mesh per task on its own, so each
     upload lands in its own slice instead of all of them in one frame.
     Shadows join last, on the first real frame. */
  let warmList: THREE.Object3D[] = [];
  function warmUp(i: number) {
    if (cancelled) return;
    if (i === 0) {
      warmList = scene.children.filter((o) => (o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints);
    }
    if (i >= warmList.length) {
      for (const o of warmList) o.visible = true;
      renderer.shadowMap.needsUpdate = true;
      ready = true;
      start();
      return;
    }
    const needs = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.needsUpdate = false;
    warmList.forEach((o, k) => {
      o.visible = k === i;
    });
    if (!renderer.getContext().isContextLost()) renderer.render(scene, camera);
    renderer.shadowMap.needsUpdate = needs;
    setTimeout(() => warmUp(i + 1), 0);
  }

  const onContextLost = (e: Event) => {
    e.preventDefault();
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    root.dataset.jungleGl = 'off';
  };
  canvas.addEventListener('webglcontextlost', onContextLost, false);

  return () => {
    cancelled = true;
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    gate.destroy();
    unsubscribePush();
    unsubscribeMood();
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerleave', onPointerLeave);
    window.removeEventListener('blur', onPointerLeave);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    delete root.dataset.jungleGl;

    for (const d of disposables) {
      try {
        d.dispose();
      } catch {
        // a double dispose is not worth crashing an unmount over
      }
    }
    cache?.dispose();
    releaseContext(renderer);
  };
}

export default JungleBackground;
