import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useAppTheme } from '@/contexts/ThemeContext';
import { capPixelRatio, createRenderGate, releaseContext } from '@/lib/three/scene-helpers';
import { createFrameThrottle } from '@/lib/raf-throttle';
import { getJunglePush, subscribeJunglePush } from '@/lib/jungle-cinematic';

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
const BARK = new THREE.Color('#3b2d21');
const BARK_PALE = new THREE.Color('#9a8f7b');
const PALM_BARK = new THREE.Color('#6d5d48');
const LIANA = new THREE.Color('#3a3020');
const ROCK = new THREE.Color('#7b7866');
const MOSS = new THREE.Color('#5f8a2a');
const LOAM = new THREE.Color('#3a3420');
const GROUND_MOSS = new THREE.Color('#44621f');
const GRASS = new THREE.Color('#79a83a');
const BLOOMS = [
  new THREE.Color('#ff4a2a'),
  new THREE.Color('#ffa31f'),
  new THREE.Color('#ff5c9b'),
];

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
  shafts: number;
  /** Icosahedron subdivision for crowns. 1 is 80 faces, 0 is 20. */
  blobDetail: 0 | 1;
  /** Loose leaves scattered over each crown blob. */
  leaves: number;
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
    trees: 30, emergents: 5, palms: 9, broadleaf: 34, ferns: 44, lianas: 22, ceiling: 16,
    rocks: 12, grass: 4500, flowers: 36, motes: 0, shafts: 3,
    blobDetail: 0, leaves: 6, groundSegments: 48, fps: 30, maxPixels: 1_000_000, maxRatio: 1.25,
  },
  mid: {
    trees: 50, emergents: 8, palms: 15, broadleaf: 70, ferns: 90, lianas: 44, ceiling: 26,
    rocks: 20, grass: 11000, flowers: 70, motes: 220, shafts: 5,
    blobDetail: 1, leaves: 12, groundSegments: 72, fps: 60, maxPixels: 1_600_000, maxRatio: 1.5,
  },
  high: {
    trees: 70, emergents: 11, palms: 21, broadleaf: 110, ferns: 140, lianas: 70, ceiling: 34,
    rocks: 28, grass: 18000, flowers: 110, motes: 420, shafts: 7,
    blobDetail: 1, leaves: 18, groundSegments: 96, fps: 60, maxPixels: 2_000_000, maxRatio: 1.5,
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
  private ax = 0;
  private ay = 0;
  private az = 0;

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

/**
 * Loose leaves scattered over a crown's surface, pointing outward. A smooth
 * blob alone reads as a green cushion; the ragged silhouette these give it is
 * what makes it read as foliage. Each is a folded diamond — two triangles.
 */
function leafClump(
  b: Batch,
  c: V3,
  s: V3,
  rot: THREE.Quaternion,
  count: number,
  base: THREE.Color,
  rng: () => number,
  sway: number,
) {
  const u = new THREE.Vector3();
  const col = base.clone().offsetHSL(0.01, 0.04, 0.05);
  for (let i = 0; i < count; i++) {
    /* Biased to the upper and outer surface — leaves hang where the light is. */
    u.set(rng() * 2 - 1, rng() * 1.4 - 0.4, rng() * 2 - 1).normalize();
    const surf = new THREE.Vector3(u.x * s[0], u.y * s[1], u.z * s[2]).applyQuaternion(rot);
    const p: V3 = [c[0] + surf.x * 0.92, c[1] + surf.y * 0.92, c[2] + surf.z * 0.92];
    const out = u.clone().applyQuaternion(rot);
    const dir = norm([out.x + (rng() - 0.5) * 0.8, out.y * 0.5 - 0.35, out.z + (rng() - 0.5) * 0.8]);
    const { side, up } = frame(dir);
    const len = Math.min(s[0], s[2]) * (0.3 + rng() * 0.25);
    const w = len * 0.42;
    const tip = add(p, mul(dir, len));
    const midp = add(p, mul(dir, len * 0.45));
    const l = add(add(midp, mul(side, w)), mul(up, w * 0.3));
    const r = add(sub(midp, mul(side, w)), mul(up, w * 0.3));
    const k = 0.85 + rng() * 0.3;
    b.tri(p, tip, l, col, 0.8, k, k * 0.95, sway, sway, sway);
    b.tri(p, r, tip, col, 0.8, k * 0.9, k, sway, sway, sway);
  }
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
) {
  const rings: { p: V3; n: V3 }[][] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const t = norm(sub(next, prev));
    const ref: V3 = Math.abs(t[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cross(t, ref));
    const w = cross(t, u);
    const ring: { p: V3; n: V3 }[] = [];
    for (let k = 0; k <= sides; k++) {
      const ang = (k / sides) * Math.PI * 2;
      const d = add(mul(u, Math.cos(ang)), mul(w, Math.sin(ang)));
      ring.push({ p: add(pts[i], mul(d, radii[i])), n: d });
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    const s0 = swayAt(i);
    const s1 = swayAt(i + 1);
    const k0 = shadeAt(i, pts[i][1]);
    const k1 = shadeAt(i + 1, pts[i + 1][1]);
    for (let k = 0; k < sides; k++) {
      const a0 = rings[i][k];
      const a1 = rings[i][k + 1];
      const b0 = rings[i + 1][k];
      const b1 = rings[i + 1][k + 1];
      const put = (q: { p: V3; n: V3 }, k: number, s: number) =>
        b.v(q.p[0], q.p[1], q.p[2], q.n[0], q.n[1], q.n[2], base, k, s);
      put(a0, k0, s0);
      put(a1, k0, s0);
      put(b1, k1, s1);
      put(a0, k0, s0);
      put(b1, k1, s1);
      put(b0, k1, s1);
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
    float trans = pow(back, 4.0) * 0.75 + 0.05;
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
        `uniform vec3 uSunView;\nuniform vec3 uSunCol;\n` +
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
            `outgoingLight *= 0.72 + dapple(vWorldXZ) * 0.85 * uSunCol;
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
  const SUN_DIR = new THREE.Vector3(-0.58, 0.44, -0.68).normalize();
  const sun = new THREE.DirectionalLight(SUN, 2.3);
  sun.position.copy(SUN_DIR).multiplyScalar(60);
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xa6d2cf, 0x2c3a17, 1.15);
  scene.add(hemi);

  const U: SceneUniforms = {
    uTime: { value: 0 },
    uHover: { value: new THREE.Vector3(0, 0, -9999) },
    uHoverRadius: { value: 5.5 },
    uStrength: { value: 0 },
    uSunView: { value: new THREE.Vector3() },
    uSunCol: { value: SUN.clone() },
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
            uTop: { value: SKY_TOP.clone() },
            uLow: { value: HAZE.clone() },
            uSun: { value: SUN.clone() },
            uSunDir: { value: SUN_DIR.clone() },
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
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float t = pow(clamp(d.y, 0.0, 1.0), 0.55);
    vec3 c = mix(uLow, uTop, t);
    float s = max(dot(d, uSunDir), 0.0);
    c += uSun * (pow(s, 280.0) * 1.6 + pow(s, 18.0) * 0.45 + pow(s, 3.0) * 0.12);
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
       4. CANOPY TREES
       ======================================================================
       The thicket: trunks with a branch or two, and crowns of four to seven
       broad, squat blobs that darken toward their undersides. Kept out of the
       trail corridor and at least ~10 units off, so a silhouette has room to
       read as a tree rather than as a wall.
       ====================================================================== */
    for (let i = 0; i < budget.trees; i++) {
      if (i % 6 === 5) yield;
      const near = i < budget.trees * 0.3;
      const angle = rng() * Math.PI * 2;
      const radius = near ? r(10, 20) : r(20, 52);
      const x = Math.cos(angle) * radius;
      const z = -Math.abs(Math.sin(angle) * radius) - (near ? 1 : 8);
      if (z > 4 || inCorridor(x, z, 1.5)) continue;

      const h = (near ? 8 : 10) + rng() * (near ? 4 : 6);
      const tr = r(0.16, 0.34);
      const lean: V3 = [r(-0.4, 0.4), 0, r(-0.4, 0.4)];
      const top: V3 = add([x, h, z], lean);
      trunks.push({ x, z, r: tr });

      wood.setAnchor([x, 0, z]);
      const pts: V3[] = [];
      const radii: number[] = [];
      for (let k = 0; k <= 4; k++) {
        const t = k / 4;
        pts.push([x + lean[0] * t * t, -0.3 + (h + 0.3) * t, z + lean[2] * t * t]);
        radii.push(tr * (1.25 - 0.55 * t));
      }
      tube(wood, pts, radii, 6, BARK, () => 0);
      /* A branch or two into the crown, so it is held up by something. */
      const branches = 1 + Math.floor(rng() * 2);
      for (let k = 0; k < branches; k++) {
        const a = rng() * Math.PI * 2;
        const from: V3 = [x + lean[0] * 0.5, h * r(0.6, 0.75), z + lean[2] * 0.5];
        const to: V3 = [from[0] + Math.cos(a) * r(1.4, 2.4), h * r(0.85, 0.95), from[2] + Math.sin(a) * r(1.4, 2.4)];
        tube(wood, [from, to], [tr * 0.55, tr * 0.25], 4, BARK, () => 0);
      }

      const green = pick(CANOPY);
      const blobs = 4 + Math.floor(rng() * 4);
      for (let k = 0; k < blobs; k++) {
        const rad = (near ? 2.1 : 1.9) + rng() * 1.5;
        const c: V3 = [top[0] + r(-2.3, 2.3), h * r(0.8, 1.08), top[2] + r(-2.3, 2.3)];
        foliage.setAnchor(c);
        const col = green.clone().lerp(CANOPY[(CANOPY.indexOf(green) + 1) % CANOPY.length], rng() * 0.35);
        const sc: V3 = [rad * r(1.2, 1.5), rad * r(0.55, 0.75), rad * r(1.2, 1.5)];
        const q = quat(r(-0.3, 0.3), rng() * 6, r(-0.3, 0.3));
        blob(foliage, c, sc, q, budget.blobDetail, col, rng() * 100, 1);
        leafClump(foliage, c, sc, q, budget.leaves, col, rng, 1);
        if (k < 2 && z > -34) hangPoints.push([c[0] + r(-1, 1), c[1] - rad * 0.5, c[2] + r(-1, 1)]);
      }
    }

    yield;
    /* ======================================================================
       5. EMERGENTS
       ======================================================================
       The giants: pale-barked, buttress-rooted, with a flat umbrella crown far
       above everything else. Only a handful, all in the middle distance where
       the haze has started to take them — that is what makes them feel huge.
       ====================================================================== */
    for (let i = 0; i < budget.emergents; i++) {
      const x = r(-46, 46);
      const z = r(-58, -26);
      if (inCorridor(x, z, 4)) continue;
      const h = r(17, 25);
      const tr = r(0.55, 0.85);
      trunks.push({ x, z, r: tr * 2.2 });

      wood.setAnchor([x, 0, z]);
      const pts: V3[] = [];
      const radii: number[] = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        pts.push([x, -0.3 + (h + 0.3) * t, z]);
        radii.push(tr * (1.15 - 0.45 * t));
      }
      tube(wood, pts, radii, 7, BARK_PALE, () => 0, (_i, y) => 0.55 + 0.45 * smooth(0, 8, y));

      /* Buttresses: thin curved fins from ~3m up the trunk out to the ground,
         mossy along their upper edge. */
      const fins = 4 + Math.floor(rng() * 2);
      for (let f = 0; f < fins; f++) {
        const a = (f / fins) * Math.PI * 2 + r(-0.3, 0.3);
        const dx = Math.cos(a);
        const dz = Math.sin(a);
        const reach = r(1.8, 3.2);
        const hb = r(2.4, 3.6);
        const steps = 4;
        for (let s = 0; s < steps; s++) {
          const t0 = s / steps;
          const t1 = (s + 1) / steps;
          /* Concave profile: the fin hugs the trunk high up and sweeps out low. */
          const y0 = hb * Math.pow(1 - t0, 1.8);
          const y1 = hb * Math.pow(1 - t1, 1.8);
          const o0: V3 = [x + dx * (tr + reach * t0), y0 - 0.25, z + dz * (tr + reach * t0)];
          const o1: V3 = [x + dx * (tr + reach * t1), y1 - 0.25, z + dz * (tr + reach * t1)];
          const i0: V3 = [x + dx * tr * 0.6, y0 * 0.2 - 0.25, z + dz * tr * 0.6];
          const i1: V3 = [x + dx * tr * 0.6, y1 * 0.2 - 0.25, z + dz * tr * 0.6];
          wood.tri(i0, o0, o1, BARK_PALE, 0.55, 0.75, 0.6, 0, 0, 0);
          wood.tri(i0, o1, i1, BARK_PALE, 0.55, 0.6, 0.45, 0, 0, 0);
        }
      }

      /* Umbrella crown on a few radiating limbs. */
      const green = pick(CANOPY.slice(1));
      const top: V3 = [x, h, z];
      const lobes = 6 + Math.floor(rng() * 4);
      for (let k = 0; k < lobes; k++) {
        const a = (k / lobes) * Math.PI * 2 + r(-0.3, 0.3);
        const d = r(2.5, 6.5);
        const c: V3 = [x + Math.cos(a) * d, h + r(1, 3.2), z + Math.sin(a) * d];
        if (k < 4) {
          wood.setAnchor([x, 0, z]);
          tube(wood, [[x, h * 0.86, z], [c[0] * 0.7 + x * 0.3, c[1] - 0.6, c[2] * 0.7 + z * 0.3]], [tr * 0.4, tr * 0.18], 5, BARK_PALE, () => 0);
        }
        foliage.setAnchor(c);
        const rad = r(2.6, 4);
        const sc: V3 = [rad * 1.45, rad * 0.5, rad * 1.45];
        const q = quat(r(-0.2, 0.2), rng() * 6, r(-0.2, 0.2));
        const col = green.clone().lerp(CANOPY[4], rng() * 0.3);
        blob(foliage, c, sc, q, budget.blobDetail, col, rng() * 100, 0.6);
        leafClump(foliage, c, sc, q, Math.round(budget.leaves * 0.6), col, rng, 0.6);
      }
      foliage.setAnchor(top);
    }

    yield;
    /* ======================================================================
       6. CANOPY CEILING
       ======================================================================
       A broken layer of crowns high overhead, close enough to frame the top of
       the shot in dark leaf and far enough that it never covers the lens.
       The GAPS are the point: they are where the sky, the sun glow and the
       shafts come through.
       ====================================================================== */
    for (let i = 0; i < budget.ceiling; i++) {
      const x = r(-34, 34);
      const z = r(-30, 2);
      const c: V3 = [x, r(14, 18), z];
      /* Leave a clear window roughly where the sun sits in frame. */
      if (x < -4 && x > -20 && z < -12) continue;
      const rad = r(2.2, 3.6);
      foliage.setAnchor(c);
      const sc: V3 = [rad * 1.4, rad * 0.6, rad * 1.25];
      const q = quat(r(-0.2, 0.2), rng() * 6, r(-0.2, 0.2));
      const col = pick(CANOPY.slice(0, 3));
      blob(foliage, c, sc, q, budget.blobDetail, col, rng() * 100, 0.4, { ao: 0.7 });
      leafClump(foliage, c, sc, q, budget.leaves + 6, col, rng, 0.4);
      if (rng() < 0.6) hangPoints.push([c[0] + r(-1.5, 1.5), c[1] - rad * 0.4, c[2] + r(-1.5, 1.5)]);
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

    /* -- commit the two batches ------------------------------------------- */
    {
      const geo = track(foliage.build());
      const mat = track(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      patchMerged(mat, U, true);
      const mesh = new THREE.Mesh(geo, mat);
      /* Wind moves vertices outside the baked bounds; culling against them
         could pop a whole batch out of frame. */
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
    {
      const geo = track(wood.build());
      const mat = track(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      patchMerged(mat, U, false);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      scene.add(mesh);
    }

    /* -- 3. GROUND (now the trunks are known) ------------------------------ */
    {
      const seg = budget.groundSegments;
      const geo = track(new THREE.PlaneGeometry(260, 260, seg, seg));
      geo.rotateX(-Math.PI / 2);
      const p = geo.getAttribute('position') as THREE.BufferAttribute;
      const colors = new Float32Array(p.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
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
      const mat = track(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uSunCol = U.uSunCol;
        shader.vertexShader = shader.vertexShader
          .replace('void main() {', 'varying vec2 vWorldXZ;\nvoid main() {')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
        shader.fragmentShader =
          `varying vec2 vWorldXZ;\n${DAPPLE_FN}\n` +
          shader.fragmentShader.replace(
            '#include <opaque_fragment>',
            `outgoingLight *= 0.62 + dapple(vWorldXZ) * 1.1 * uSunCol;
             #include <opaque_fragment>`,
          );
      };
      scene.add(new THREE.Mesh(geo, mat));
    }

    yield;
    /* ======================================================================
       12. GRASS
       ======================================================================
       Instanced blades, dark at the root and light at the tip, sun-flecked by
       the same dapple as the floor so the two read as one surface.
       ====================================================================== */
    {
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.035, 0, 0, 0.035, 0, 0, 0, 1, 0], 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0.25, 0, 1, 0.25, 0, 1, 0.25], 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1.25, 1.25, 1.2], 3));
      const mat = track(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      patchInstanced(mat, U, 'position.y', true);

      const mesh = new THREE.InstancedMesh(geo, mat, budget.grass);
      const dummy = new THREE.Object3D();
      const tint = new THREE.Color();
      for (let i = 0; i < budget.grass; i++) {
        /* A full disc around the camera (not a half-plane in front of it), so
           the near field is turf rather than bare ground. */
        const d = Math.sqrt(rng()) * 30;
        const a = rng() * Math.PI * 2;
        dummy.position.set(Math.cos(a) * d, -0.2, -10 + Math.sin(a) * d);
        dummy.rotation.set(0, rng() * Math.PI, (rng() - 0.5) * 0.4);
        dummy.scale.set(0.8 + rng() * 0.8, 0.2 + rng() * 0.5, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        tint.copy(GRASS).lerp(rng() < 0.3 ? BROADLEAF[1] : CANOPY[2], rng() * 0.5);
        mesh.setColorAt(i, tint);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
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
            uniforms: { uCol: { value: HAZE.clone() }, uOpacity: { value: opacity }, uSeed: { value: z } },
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
    float a = edge * along * streak * nearFade * uIntensity;
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
            uCol: { value: SUN.clone() },
            uScale: { value: renderer.getPixelRatio() * window.innerHeight * 0.5 },
          },
          vertexShader: `
  uniform float uTime;
  uniform float uScale;
  attribute float aSeed;
  varying float vA;
  void main() {
    vec3 p = position;
    float t = uTime * 0.25 + aSeed * 40.0;
    p += vec3(sin(t) * 0.35, sin(t * 0.7 + 1.3) * 0.25, cos(t * 0.8) * 0.3);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float d = -mv.z;
    gl_PointSize = clamp(uScale * (0.018 + aSeed * 0.022) / d, 1.0, 9.0);
    vA = (0.35 + 0.65 * (0.5 + 0.5 * sin(t * 2.3))) * smoothstep(1.2, 4.0, d) * (1.0 - smoothstep(18.0, 26.0, d));
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
    uSunCol: { value: SUN.clone() },
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
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float v = length(p * vec2(0.72, 0.86) + vec2(0.0, 0.1));
  float a = smoothstep(0.62, 1.45, v) * 0.74;
  vec3 dark = vec3(0.03, 0.06, 0.035) * a;
  vec2 d = (p - uSun) * vec2(uAspect, 1.0);
  float g = exp(-dot(d, d) * 0.9) * 0.34 + exp(-dot(d, d) * 7.0) * 0.18;
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

    renderer.render(scene, camera);
    renderer.autoClear = false;
    renderer.render(overlayScene, overlayCam);
    renderer.autoClear = true;

    if (!shown) {
      shown = true;
      host.style.opacity = '1';
    }

    /* Park the loop when nothing is moving. It restarts on any pointer move,
       resize or dolly. */
    const moving =
      U.uStrength.value > 0 ||
      prevStrength > 0 ||
      push > 0 ||
      Math.abs(targetYaw - yaw) > 0.0005 ||
      Math.abs(targetPitch - pitch) > 0.0005;
    idleFrames = moving ? 0 : idleFrames + 1;
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
          ready = true;
          start();
        };
        Promise.all([renderer.compileAsync(scene, camera), renderer.compileAsync(overlayScene, overlayCam)]).then(go, go);
        return;
      }
    }
    setTimeout(pump, 0);
  };
  pump();

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
    releaseContext(renderer);
  };
}

export default JungleBackground;
