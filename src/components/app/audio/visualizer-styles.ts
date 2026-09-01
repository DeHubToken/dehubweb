export type VisualizerStyle = 'static' | 'bars' | 'waveform' | 'circular' | 'spectrum' | 'mirror' | 'rings' | 'pulse' | 'terrain' | 'orb';


/* ─── Shared ───────────────────────────────────────────────────────────── */

const TAU = Math.PI * 2;

/**
 * Colour for every style.
 *
 * **Hue 0 is monochrome, everywhere.** The colour slider starts at 0 and the
 * house style is chrome, so an audio post is white-on-black until someone
 * deliberately asks for colour. This used to be true of Default and Orb only —
 * the other eight read hue 0 as *red*, so a card that had never been touched
 * played back in a colour nobody chose.
 *
 * `l` is the lightness the **monochrome** default wants, 0–100. Monochrome is
 * what an untouched card plays, so it is the thing worth tuning against, and
 * with no saturation only lightness is left to carry contrast — mono needs the
 * whole range, including the near-white top of it.
 *
 * Colour cannot use the same number. HSL desaturates towards white as lightness
 * climbs, so a 90%-light purple is a white line with a hint of purple in it —
 * which is exactly what happened the first time this was written against one
 * scale. The coloured path compresses `l` into the 30–72 band where the hue
 * still reads, and lets saturation carry the contrast instead.
 */
const COLOUR_L = (l: number) => (30 + l * 0.42).toFixed(1);

function palette(hue: number) {
  const mono = hue === 0;
  const h = mono ? 0 : hue;
  const c = (l: number, a: number) =>
    mono ? `hsla(0, 0%, ${l}%, ${a})` : `hsla(${h}, 82%, ${COLOUR_L(l)}%, ${a})`;
  /** The same, for a hue rotated off the base — a no-op in monochrome. */
  const shift = (deg: number, l: number, a: number) =>
    mono ? c(l, a) : `hsla(${(hue + deg) % 360}, 82%, ${COLOUR_L(l)}%, ${a})`;
  return { mono, h, c, shift };
}

/** Mean level of a frequency range, 0–1. */
function bandLevel(data: Uint8Array, from: number, to: number) {
  if (!data.length) return 0;
  const lo = Math.min(from, data.length);
  const hi = Math.min(to, data.length);
  if (hi <= lo) return 0;
  let sum = 0;
  for (let i = lo; i < hi; i++) sum += data[i];
  return sum / (hi - lo) / 255;
}

/**
 * Bars are the one style with per-frame state and no reset hook of their own,
 * and adding one means three call sites have to remember to call it. A long gap
 * in frames means the style was switched away and back, so treat that as a
 * fresh start instead.
 *
 * Nothing else uses this. Spectrum, Rings and Terrain all have real resets that
 * AudioVisualizer already calls, and a frame-gap heuristic actively hurts them:
 * a hidden tab throttles rAF to seconds apart, and Spectrum would throw away a
 * whole screen of history every time it woke up — which reads as the scroll
 * never having worked at all.
 */
const STALE_MS = 400;
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : 0);

/* ─── Bars ─────────────────────────────────────────────────────────────── */

let barPeaks: number[] = [];
let barStamp = 0;

export function drawBars(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  hue: number = 0
) {
  const { c } = palette(hue);
  ctx.clearRect(0, 0, width, height);

  const barCount = 56;
  const gap = Math.max(1, (width / barCount) * 0.22);
  const barWidth = Math.max(1, (width - gap * (barCount - 1)) / barCount);
  const radius = Math.min(barWidth / 2, 4);
  const maxH = height * 0.88;

  const now = nowMs();
  if (barPeaks.length !== barCount || now - barStamp > STALE_MS) {
    barPeaks = new Array(barCount).fill(0);
  }
  barStamp = now;

  const body = new Path2D();
  const caps = new Path2D();

  for (let i = 0; i < barCount; i++) {
    const idx = Math.floor((i / barCount) * (frequencyData.length * 0.62));
    // Gamma. A linear map puts everything above the bass end on the floor,
    // which is why the old bars looked like three loud columns and a flat line.
    const v = Math.pow((frequencyData[idx] ?? 0) / 255, 0.72);
    const barH = Math.max(2, v * maxH);
    const x = i * (barWidth + gap);
    body.roundRect(x, height - barH, barWidth, barH, radius);

    // Peak hold, falling slowly. It is what turns a wall of bars into
    // something you can read the dynamics of.
    barPeaks[i] = Math.max(barPeaks[i] - 0.011, v);
    const capH = Math.max(2, Math.min(3, height * 0.02));
    const capY = height - Math.max(barH + capH, barPeaks[i] * maxH);
    caps.roundRect(x, capY, barWidth, capH, capH / 2);
  }

  const grad = ctx.createLinearGradient(0, height, 0, height - maxH);
  grad.addColorStop(0, c(68, 0.5));
  grad.addColorStop(0.45, c(84, 0.85));
  grad.addColorStop(1, c(100, 1));
  ctx.fillStyle = grad;
  // One shadow for the whole field. Setting shadowBlur per bar is 56 separate
  // blur passes a frame, which is what the old build did on every loud bar.
  ctx.shadowColor = c(84, 0.45);
  ctx.shadowBlur = Math.min(18, height * 0.09);
  ctx.fill(body);
  ctx.shadowBlur = 0;

  ctx.fillStyle = c(100, 0.85);
  ctx.fill(caps);
}

/* ─── Wave ─────────────────────────────────────────────────────────────── */

export function drawWaveform(
  ctx: CanvasRenderingContext2D,
  timeData: Uint8Array,
  width: number,
  height: number,
  hue: number = 0
) {
  const { c } = palette(hue);
  ctx.clearRect(0, 0, width, height);
  const n = timeData.length;
  if (n < 3) return;

  const centre = height / 2;
  const amp = height * 0.4;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    pts.push({ x: (i / (n - 1)) * width, y: centre + ((timeData[i] - 128) / 128) * amp });
  }

  // Quadratics anchored on the *midpoints* between samples, with each sample as
  // the control point. Anchoring on the samples themselves overshoots at every
  // reversal, and a plain polyline of 128 points reads as a saw at this width.
  const trace = new Path2D();
  trace.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < n - 1; i++) {
    trace.quadraticCurveTo(
      pts[i].x,
      pts[i].y,
      (pts[i].x + pts[i + 1].x) / 2,
      (pts[i].y + pts[i + 1].y) / 2
    );
  }
  trace.lineTo(pts[n - 1].x, pts[n - 1].y);

  // A skirt back to the zero line, so the trace sits on a body rather than
  // floating as a hairline in an empty box.
  const skirt = new Path2D(trace);
  skirt.lineTo(width, centre);
  skirt.lineTo(0, centre);
  skirt.closePath();
  const fill = ctx.createLinearGradient(0, 0, 0, height);
  fill.addColorStop(0, c(80, 0.18));
  fill.addColorStop(0.5, c(80, 0.04));
  fill.addColorStop(1, c(80, 0.18));
  ctx.fillStyle = fill;
  ctx.fill(skirt);

  ctx.strokeStyle = c(90, 0.14);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, centre);
  ctx.lineTo(width, centre);
  ctx.stroke();

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Wide soft pass, then a thin hot core on top: one stroke drawn twice at the
  // same width just makes a slightly darker line.
  ctx.strokeStyle = c(82, 0.32);
  ctx.lineWidth = Math.max(4, height * 0.035);
  ctx.shadowColor = c(86, 0.7);
  ctx.shadowBlur = Math.min(22, height * 0.12);
  ctx.stroke(trace);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = c(100, 0.95);
  ctx.lineWidth = Math.max(1.5, height * 0.012);
  ctx.stroke(trace);
}

/* ─── Radial ───────────────────────────────────────────────────────────── */

export function drawCircular(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  hue: number = 0
) {
  const { c } = palette(hue);
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const box = Math.min(width, height);
  const radius = box * 0.26;
  const maxLen = box * 0.2;
  const spokes = 96;
  const bass = bandLevel(frequencyData, 0, 8);

  // Centre bloom under the spokes, so the ring has something inside it.
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * (1 + bass * 0.3));
  glow.addColorStop(0, c(84, 0.05 + bass * 0.2));
  glow.addColorStop(1, c(84, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.3, 0, TAU);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, radius - 4, 0, TAU);
  ctx.strokeStyle = c(92, 0.26);
  ctx.lineWidth = 1;
  ctx.stroke();

  const path = new Path2D();
  for (let i = 0; i < spokes; i++) {
    // Mirrored about the vertical axis. Walked once around the circle the
    // spectrum has a seam where the top bin meets the bottom one, and the ring
    // reads as permanently loud down one side; mirrored, it reads as a shape.
    const half = i < spokes / 2 ? i : spokes - i;
    const idx = Math.floor((half / (spokes / 2)) * (frequencyData.length * 0.55));
    const v = Math.pow((frequencyData[idx] ?? 0) / 255, 0.8);
    const len = 2 + v * maxLen;
    const a = (i / spokes) * TAU - Math.PI / 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    path.moveTo(cx + ca * radius, cy + sa * radius);
    path.lineTo(cx + ca * (radius + len), cy + sa * (radius + len));
  }

  const spokeW = Math.max(1.5, ((TAU * radius) / spokes) * 0.62);
  ctx.lineCap = 'round';
  ctx.strokeStyle = c(80, 0.45);
  ctx.lineWidth = spokeW;
  ctx.shadowColor = c(86, 0.6);
  ctx.shadowBlur = Math.min(16, box * 0.06);
  ctx.stroke(path);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = c(100, 0.9);
  ctx.lineWidth = Math.max(1, spokeW * 0.45);
  ctx.stroke(path);
}

/* ─── Spectrum ─────────────────────────────────────────────────────────── */

/**
 * The scrolling history lives in its own buffer rather than on the visible
 * canvas, because anything drawn on the visible canvas scrolls with it — the
 * lit edge would smear a trail across the frame within a second.
 */
let spectrumBuf: HTMLCanvasElement | null = null;
let spectrumScratch: HTMLCanvasElement | null = null;

export function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  hue: number = 0
) {
  const { mono, h } = palette(hue);
  if (!spectrumBuf) spectrumBuf = document.createElement('canvas');
  if (!spectrumScratch) spectrumScratch = document.createElement('canvas');
  // Only a resize starts over. `resetSpectrum` handles the style change.
  const fresh = spectrumBuf.width !== width || spectrumBuf.height !== height;
  if (fresh) {
    spectrumBuf.width = width;
    spectrumBuf.height = height;
    spectrumScratch.width = width;
    spectrumScratch.height = height;
  }

  const bctx = spectrumBuf.getContext('2d');
  const sctx = spectrumScratch.getContext('2d');
  if (!bctx || !sctx) return;
  if (fresh) bctx.clearRect(0, 0, width, height);

  const step = Math.max(1, Math.round(width * 0.006));

  // Scroll by blitting, not by moving pixels. The old build shifted the frame
  // buffer one pixel at a time in JS — at fullscreen that is a megapixel of
  // byte copies per frame, all of it on the main thread.
  //
  // It goes through a scratch canvas rather than drawing the buffer onto
  // itself. A self-blit under `copy` clears the destination before it has
  // finished reading the source, and the history comes out blank — which looks
  // exactly like the scroll not running.
  sctx.globalCompositeOperation = 'copy';
  sctx.drawImage(spectrumBuf, 0, 0);
  bctx.clearRect(0, 0, width, height);
  bctx.drawImage(spectrumScratch, -step, 0);

  const col = bctx.createLinearGradient(0, height, 0, 0);
  const stops = 24;
  for (let s = 0; s <= stops; s++) {
    const f = s / stops; // 0 is the bottom of the frame: low frequencies.
    const idx = Math.min(frequencyData.length - 1, Math.floor(f * frequencyData.length));
    const v = Math.pow((frequencyData[idx] ?? 0) / 255, 0.62);
    col.addColorStop(
      f,
      mono
        ? `hsla(0, 0%, ${Math.round(12 + v * 88)}%, ${(0.04 + v * 0.96).toFixed(3)})`
        : `hsla(${Math.round((hue + v * 70) % 360)}, ${Math.round(65 + v * 30)}%, ${Math.round(
            8 + v * 58
          )}%, ${(0.04 + v * 0.96).toFixed(3)})`
    );
  }
  bctx.fillStyle = col;
  bctx.fillRect(width - step, 0, step, height);

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(spectrumBuf, 0, 0);

  // Lit edge where new frames arrive — on the visible canvas only, so it never
  // becomes part of the history.
  const edge = ctx.createLinearGradient(width - Math.max(3, step * 2), 0, width, 0);
  edge.addColorStop(0, mono ? 'hsla(0, 0%, 100%, 0)' : `hsla(${h}, 85%, 65%, 0)`);
  edge.addColorStop(1, mono ? 'hsla(0, 0%, 100%, 0.55)' : `hsla(${h}, 85%, 65%, 0.55)`);
  ctx.fillStyle = edge;
  ctx.fillRect(width - Math.max(3, step * 2), 0, Math.max(3, step * 2), height);
}

export function resetSpectrum() {
  spectrumBuf = null;
  spectrumScratch = null;
}

/* ─── Mirror ───────────────────────────────────────────────────────────── */

export function drawMirror(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  hue: number = 0
) {
  const { c } = palette(hue);
  ctx.clearRect(0, 0, width, height);

  const barCount = 56;
  const gap = Math.max(1, (width / barCount) * 0.22);
  const barWidth = Math.max(1, (width - gap * (barCount - 1)) / barCount);
  const radius = Math.min(barWidth / 2, 4);
  const centreY = height / 2;
  const maxH = height * 0.44;

  const body = new Path2D();
  for (let i = 0; i < barCount; i++) {
    const idx = Math.floor((i / barCount) * (frequencyData.length * 0.62));
    const v = Math.pow((frequencyData[idx] ?? 0) / 255, 0.72);
    const barH = Math.max(1.5, v * maxH);
    const x = i * (barWidth + gap);
    body.roundRect(x, centreY - barH, barWidth, barH, radius);
    body.roundRect(x, centreY, barWidth, barH, radius);
  }

  // Brightest at the centre line and falling away in both directions, so the
  // reflection reads as one object rather than two rows of bars.
  const grad = ctx.createLinearGradient(0, centreY - maxH, 0, centreY + maxH);
  grad.addColorStop(0, c(74, 0.45));
  grad.addColorStop(0.5, c(100, 1));
  grad.addColorStop(1, c(74, 0.45));
  ctx.fillStyle = grad;
  ctx.shadowColor = c(84, 0.45);
  ctx.shadowBlur = Math.min(16, height * 0.08);
  ctx.fill(body);
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.strokeStyle = c(100, 0.3);
  ctx.lineWidth = 1;
  ctx.moveTo(0, centreY);
  ctx.lineTo(width, centreY);
  ctx.stroke();
}

/* ─── Rings ────────────────────────────────────────────────────────────── */

interface Ring {
  radius: number;
  opacity: number;
  lift: number;
}

let rings: Ring[] = [];
let ringCooldown = 0;
/** Fast follower — one frame's worth of "where the level just was". */
let ringLevel = 0;
/** Slow follower, for the floor below which nothing counts as a hit. */
let ringFloor = 0;

export function drawRings(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  hue: number = 0
) {
  const { c } = palette(hue);
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.min(width, height) / 2;
  const level = bandLevel(frequencyData, 0, Math.max(1, Math.floor(frequencyData.length / 4)));

  /* Onset detection, not a loudness gate. The old threshold was an absolute
     0.5, so a quietly mastered track threw no ripples at all and a loud one
     threw one every frame. Comparing against the track's own *average* is no
     better — the average converges up to the music and the ripples stop.
     What survives both is the rise: a transient is a jump above where the
     level was a frame ago, at any volume. The cooldown keeps a sustained
     passage from filling the frame with rings a pixel apart. */
  const rise = level - ringLevel;
  ringLevel += (level - ringLevel) * 0.35;
  ringFloor += (level - ringFloor) * 0.02;
  ringCooldown = Math.max(0, ringCooldown - 1);
  if (rise > 0.03 && level > ringFloor * 0.85 && ringCooldown === 0 && rings.length < 7) {
    rings.push({ radius: maxRadius * 0.08, opacity: 0.4 + level * 0.5, lift: level });
    ringCooldown = 7;
  }

  rings = rings.filter((ring) => {
    ring.radius += maxRadius * (0.012 + ring.lift * 0.02);
    ring.opacity -= 0.009;
    if (ring.opacity <= 0 || ring.radius > maxRadius) return false;
    // Thinner and fainter as it travels, which is what a ripple does.
    const t = ring.radius / maxRadius;
    ctx.beginPath();
    ctx.arc(cx, cy, ring.radius, 0, TAU);
    ctx.strokeStyle = c(92, ring.opacity * (1 - t * 0.5));
    ctx.lineWidth = Math.max(0.75, (1.5 + ring.lift * 3.5) * (1 - t * 0.65));
    ctx.stroke();
    return true;
  });

  const pulse = maxRadius * (0.16 + level * 0.2);
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulse);
  core.addColorStop(0, c(100, 0.5 + level * 0.45));
  core.addColorStop(0.45, c(92, 0.22 + level * 0.25));
  core.addColorStop(1, c(84, 0));
  ctx.beginPath();
  ctx.arc(cx, cy, pulse, 0, TAU);
  ctx.fillStyle = core;
  ctx.fill();
}

export function resetRings() {
  rings = [];
  ringCooldown = 0;
  ringLevel = 0;
  ringFloor = 0;
}

/* ─── Pulse ────────────────────────────────────────────────────────────── */

export function drawPulse(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  hue: number = 0
) {
  const { c, shift } = palette(hue);
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const box = Math.min(width, height);
  const base = box * 0.22;

  const bass = bandLevel(frequencyData, 0, 8);
  const mid = bandLevel(frequencyData, 8, 32);
  const high = bandLevel(frequencyData, 32, 64);
  const total = bass * 0.5 + mid * 0.3 + high * 0.2;

  const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 2.6);
  bloom.addColorStop(0, c(74, total * 0.3));
  bloom.addColorStop(0.5, c(68, total * 0.1));
  bloom.addColorStop(1, c(68, 0));
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, width, height);

  const layers = [
    { energy: high, mult: 1.34, deg: 60, alpha: 0.3, points: 72 },
    { energy: mid, mult: 1.0, deg: 30, alpha: 0.5, points: 56 },
    { energy: bass, mult: 0.72, deg: 0, alpha: 0.8, points: 48 },
  ];

  for (const layer of layers) {
    const R = base * layer.mult;

    // Radii first, so they can be smoothed and closed as a ring.
    const radii: number[] = [];
    for (let i = 0; i < layer.points; i++) {
      const idx = Math.floor((i / layer.points) * (frequencyData.length * 0.5));
      const v = (frequencyData[idx] ?? 0) / 255;
      const a = (i / layer.points) * TAU;
      radii.push(R * (1 + v * 0.5) + Math.sin(a * 3) * layer.energy * box * 0.03);
    }
    // 1-2-1 around the ring. One loud bin used to put a spike on the outline;
    // this is what makes it a blob rather than a starfish.
    const smooth = radii.map((r, i) => {
      const p = radii[(i - 1 + radii.length) % radii.length];
      const n = radii[(i + 1) % radii.length];
      return (p + 2 * r + n) / 4;
    });

    const pts = smooth.map((r, i) => {
      const a = (i / layer.points) * TAU;
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    });

    /* Quadratics between midpoints, wrapping with `% length`.
       This is the fix for the notch on the right-hand edge. The old loop ran
       `i <= points`, so it visited 3 o'clock twice — once as index 0 reading
       frequency bin 0, and once as index `points` reading bin 64. Bass and
       treble give wildly different radii, so the path ended nowhere near where
       it started and `closePath()` drew a straight chord across the gap. There
       is no seam to get wrong now: every point is visited once and the curve
       closes on itself by construction. */
    const path = new Path2D();
    const last = pts[pts.length - 1];
    path.moveTo((last.x + pts[0].x) / 2, (last.y + pts[0].y) / 2);
    for (let i = 0; i < pts.length; i++) {
      const next = pts[(i + 1) % pts.length];
      path.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + next.x) / 2, (pts[i].y + next.y) / 2);
    }
    path.closePath();

    const fill = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
    fill.addColorStop(0, shift(layer.deg, 68, layer.alpha * layer.energy));
    fill.addColorStop(0.5, shift(layer.deg, 54, layer.alpha * 0.7 * (0.3 + layer.energy * 0.7)));
    fill.addColorStop(1, shift(layer.deg, 42, 0));
    ctx.fillStyle = fill;
    ctx.fill(path);

    ctx.strokeStyle = shift(layer.deg, 66, layer.alpha * (0.5 + layer.energy * 0.5));
    ctx.lineWidth = 1.5 + layer.energy * 2;
    ctx.shadowColor = shift(layer.deg, 60, layer.energy);
    ctx.shadowBlur = Math.min(20, box * 0.06) * (0.5 + layer.energy);
    ctx.stroke(path);
    ctx.shadowBlur = 0;
  }

  const coreR = base * 0.28 + bass * box * 0.06;
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  core.addColorStop(0, c(100, 0.85 + bass * 0.15));
  core.addColorStop(0.45, c(98, 0.5 + bass * 0.3));
  core.addColorStop(1, c(84, 0));
  ctx.beginPath();
  ctx.arc(cx, cy, coreR, 0, TAU);
  ctx.fillStyle = core;
  ctx.fill();
}

export function resetPulse() {
  // No persistent state to reset.
}

/* ─── Terrain ──────────────────────────────────────────────────────────── */

let terrainOffset = 0;

export function drawTerrain(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  hue: number = 0
) {
  const { mono, c, shift } = palette(hue);
  ctx.clearRect(0, 0, width, height);

  const horizon = height * 0.38;
  const groundH = height - horizon;
  const bass = bandLevel(frequencyData, 0, 8);

  terrainOffset = (terrainOffset + 0.0035 + bass * 0.012) % 1;

  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  // Barely there in monochrome: a white gradient over a dark card is a grey
  // slab, not a sky. The light in this scene comes from the sun.
  sky.addColorStop(0, mono ? 'hsla(0, 0%, 100%, 0.015)' : `hsla(${(hue + 180) % 360}, 60%, 22%, 0.42)`);
  sky.addColorStop(1, mono ? 'hsla(0, 0%, 100%, 0.07)' : `hsla(${hue}, 80%, 48%, 0.3)`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, horizon);

  // Sun, with slats cut out of its lower half — the one detail that makes a
  // bright disc read as the synthwave sun rather than a marble.
  const sunR = Math.max(14, Math.min(width * 0.17, groundH * 0.66));
  ctx.save();
  ctx.beginPath();
  ctx.arc(width / 2, horizon, sunR, 0, TAU);
  ctx.clip();
  const sunGrad = ctx.createLinearGradient(0, horizon - sunR, 0, horizon + sunR);
  sunGrad.addColorStop(0, shift(40, 100, 0.95));
  sunGrad.addColorStop(0.55, c(80, 0.6));
  sunGrad.addColorStop(1, c(74, 0.06));
  ctx.fillStyle = sunGrad;
  ctx.fillRect(width / 2 - sunR, horizon - sunR, sunR * 2, sunR * 2);
  ctx.globalCompositeOperation = 'destination-out';
  [0.08, 0.28, 0.5, 0.71, 0.9].forEach((at, i) => {
    ctx.fillRect(width / 2 - sunR, horizon + sunR * at, sunR * 2, 1 + i * 1.5);
  });
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, horizon, width, groundH);
  ctx.clip();

  // Columns converging on the vanishing point. The old build drew these as
  // fragments inside the row loop and they never actually met.
  const cols = 15;
  ctx.lineWidth = 1;
  ctx.strokeStyle = c(80, 0.22);
  ctx.beginPath();
  for (let i = 0; i < cols; i++) {
    const spread = (i / (cols - 1) - 0.5) * 2;
    ctx.moveTo(width / 2, horizon);
    ctx.lineTo(width / 2 + spread * width * 1.15, height);
  }
  ctx.stroke();

  // Rows walking towards the viewer on a perspective curve, lifted by the
  // spectrum so the ground actually undulates.
  const rows = 18;
  const segs = 26;
  for (let r = 0; r < rows; r++) {
    const p = ((r / rows + terrainOffset) % 1 + 1) % 1;
    const depth = Math.pow(p, 2.2);
    const y = horizon + groundH * depth;
    ctx.beginPath();
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const x = t * width;
      const idx = Math.floor(Math.abs(t - 0.5) * 2 * (frequencyData.length * 0.45));
      const v = (frequencyData[idx] ?? 0) / 255;
      const lift = v * groundH * 0.18 * depth;
      if (s === 0) ctx.moveTo(x, y - lift);
      else ctx.lineTo(x, y - lift);
    }
    ctx.strokeStyle = c(84, (0.08 + 0.62 * p) * (0.45 + bass * 0.55));
    ctx.lineWidth = 0.6 + p * 1.4;
    ctx.stroke();
  }
  ctx.restore();
}

export function resetTerrain() {
  terrainOffset = 0;
}

// Static waveform - full-track amplitude display with L-R playback progress.
// Pre-decodes the audio file to extract amplitude peaks for the entire duration,
// then renders all bars at once. Bars behind the playhead are brighter/colored;
// bars ahead are dim. The playhead sweeps left→right as the audio plays.

/** Cached decoded waveform data per URL */
const waveformCache = new Map<string, number[]>();
/**
 * Decodes currently in flight, keyed by URL, each holding the cards waiting on
 * it. This used to be a single `activeDecodeUrl` string: a card whose track
 * started decoding while a *different* track was in flight returned early and
 * its `onReady` was never called, so its peaks stayed null forever and it
 * painted an empty box. A feed with more than one audio post hit that every
 * time. One entry per URL fixes it and still collapses repeat requests for the
 * same URL into a single fetch.
 */
const activeDecodes = new Map<string, ((peaks: number[]) => void)[]>();

/**
 * Decode an audio URL and cache its per-bar amplitude peaks.
 * Returns immediately if already cached.  Calls `onReady` when done.
 */
export async function decodeAudioWaveform(
  audioUrl: string,
  barCount: number,
  onReady: (peaks: number[]) => void
) {
  // Already cached
  const cached = waveformCache.get(audioUrl);
  if (cached && cached.length === barCount) {
    onReady(cached);
    return;
  }

  // Same URL already decoding — wait on that one rather than fetching twice.
  const waiting = activeDecodes.get(audioUrl);
  if (waiting) {
    waiting.push(onReady);
    return;
  }
  const subscribers: ((peaks: number[]) => void)[] = [onReady];
  activeDecodes.set(audioUrl, subscribers);

  const settle = (peaks: number[]) => {
    waveformCache.set(audioUrl, peaks);
    activeDecodes.delete(audioUrl);
    for (const fn of subscribers) fn(peaks);
  };

  try {
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    const offlineCtx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(1, 1, 44100);
    const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);

    const rawData = audioBuffer.getChannelData(0);
    const samplesPerBar = Math.floor(rawData.length / barCount);
    const peaks: number[] = [];

    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      const start = i * samplesPerBar;
      for (let j = start; j < start + samplesPerBar && j < rawData.length; j++) {
        sum += Math.abs(rawData[j]);
      }
      peaks.push(sum / samplesPerBar);
    }

    // Normalize to 0–1
    const max = Math.max(...peaks, 0.001);
    settle(peaks.map(p => p / max));
  } catch (err) {
    console.error('Failed to decode audio waveform:', err);
    // Fallback: generate a seeded pattern
    settle(generateFallbackPattern(audioUrl, barCount));
  }
}

/** Simple seeded PRNG (mulberry32) for fallback */
function seedRandom(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return () => {
    h |= 0;
    h = h + 0x6d2b79f5 | 0;
    let t = Math.imul(h ^ h >>> 15, 1 | h);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function generateFallbackPattern(seed: string, count: number): number[] {
  const rand = seedRandom(seed);
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const envelope = 0.3 + 0.7 * Math.sin(t * Math.PI);
    bars.push(envelope * (0.4 + 0.6 * rand()));
  }
  return bars;
}

/**
 * A stable, per-post waveform shape to paint before (or instead of) the real
 * decode. The decode needs the whole file, so a card that is far from the
 * viewport, offline or serving a track the browser cannot decode has nothing —
 * and a waveform of nothing is a black rectangle. Every style falls back to
 * this so an audio post always looks like an audio post.
 */
const seededPeaksCache = new Map<string, number[]>();
export function seededPeaks(seed: string, count: number): number[] {
  const key = `${seed}:${count}`;
  let cached = seededPeaksCache.get(key);
  if (!cached) {
    cached = generateFallbackPattern(seed, count);
    seededPeaksCache.set(key, cached);
  }
  return cached;
}

/**
 * Frequency-domain frame synthesised from a waveform shape, so the analyser
 * styles have something to draw while paused. Without it, switching style with
 * the audio stopped left the previous style's last frame on the canvas and the
 * picker looked dead.
 */
export function idleFrequencyData(peaks: number[], length: number): Uint8Array {
  const out = new Uint8Array(length);
  if (!peaks.length) return out;
  for (let i = 0; i < length; i++) {
    const p = peaks[Math.floor((i / length) * peaks.length)] ?? 0;
    // Tilt down across the spectrum the way real music does, so bars/spectrum
    // read as a plausible frozen frame rather than a flat wall.
    const tilt = 1 - (i / length) * 0.75;
    out[i] = Math.round(Math.min(1, p * 0.7 * tilt) * 255);
  }
  return out;
}

/** Time-domain counterpart of `idleFrequencyData`, centred on the 128 zero line. */
export function idleTimeData(peaks: number[], length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    const p = peaks.length ? (peaks[Math.floor((i / length) * peaks.length)] ?? 0) : 0;
    out[i] = Math.round(128 + Math.sin((i / length) * Math.PI * 8) * p * 40);
  }
  return out;
}

/**
 * Draw the full-track waveform. `progress` is 0–1 representing playback position.
 */
export function drawStatic(
  ctx: CanvasRenderingContext2D,
  _frequencyData: Uint8Array,
  width: number,
  height: number,
  hue: number = 0,
  seed: string = 'default',
  progress: number = 0,
  peaks: number[] | null = null,
  barCountHint = 100
) {
  ctx.clearRect(0, 0, width, height);

  // Never return without drawing: an audio card with no decoded peaks yet used
  // to be an empty black box until the whole file had downloaded.
  const shape = peaks && peaks.length ? peaks : seededPeaks(seed, barCountHint);

  const barCount = shape.length;
  const gap = 2;
  const barWidth = Math.max(1, (width - gap * (barCount - 1)) / barCount);
  const centerY = height / 2;
  const maxBarH = height * 0.8;
  // Use fractional progress for smooth sweep instead of snapping bar-by-bar
  const progressX = progress * (barCount * (barWidth + gap));

  for (let i = 0; i < barCount; i++) {
    const barH = Math.max(2, shape[i] * maxBarH);
    const x = i * (barWidth + gap);
    const y = centerY - barH / 2;
    const barEnd = x + barWidth;

    // Determine how "played" this bar is (0 = unplayed, 1 = fully played, 0-1 = partial)
    let playedRatio = 0;
    if (progressX >= barEnd) {
      playedRatio = 1;
    } else if (progressX > x) {
      playedRatio = (progressX - x) / barWidth;
    }

    // Draw unplayed portion (full bar, dim)
    ctx.fillStyle = `hsla(0, 0%, 100%, 0.2)`;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barH, 1);
    ctx.fill();

    // Draw played portion on top
    if (playedRatio > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, barWidth * playedRatio, barH);
      ctx.clip();

      if (hue === 0) {
        ctx.fillStyle = `hsla(0, 0%, 100%, 0.85)`;
      } else {
        const gradient = ctx.createLinearGradient(x, y, x, y + barH);
        gradient.addColorStop(0, `hsla(${hue}, 80%, 75%, 0.9)`);
        gradient.addColorStop(0.5, `hsla(${hue}, 85%, 60%, 0.95)`);
        gradient.addColorStop(1, `hsla(${hue}, 80%, 75%, 0.9)`);
        ctx.fillStyle = gradient;
      }

      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, 1);
      ctx.fill();
      ctx.restore();
    }
  }
}

export function resetStatic() {
  // No per-frame state to reset
}


/* ─── Orb ──────────────────────────────────────────────────────────────────
   The assistant's ball of cosmic dust, on canvas and wired to the analyser.

   This is a TRANSCRIPTION of src/components/app/chat/ReplyOrb.tsx, not a new
   effect that resembles it: same 30 grains, same uniform-y latitudes, same
   golden-angle longitudes, same -14° lean, same 0.42/0.05/0.62 ratios, same
   0.55+0.45·depth scale and 0.2+0.8·depth fade, same 9000ms idle spin. Change
   one, change all three (web orb, mobile orb, this) or the ball stops being
   the same object in three places.

   The only thing this file adds is the music, and it adds it to values the
   orb already had rather than to new geometry:
     · spin sweeps between the orb's own idle (9000ms) and thinking (2600ms)
       rates with loudness, so a loud track really is the "thinking" ball;
     · the haze pulse the orb runs on a timer is driven by bass instead;
     · each grain owns a slice of the spectrum, so its own band brightens it,
       fattens it and pushes it a little off the sphere;
     · loudness opens up the glow and the colour saturation. */

/** Mirrors ReplyOrb's MOTES. */
const ORB_MOTES = 30;
/** Golden-angle fraction (137.5°/360°) — ReplyOrb's GOLDEN_FRACTION. */
const ORB_GOLDEN_FRACTION = 0.381966;
/** ms — ReplyOrb's DURATION, and the two ends the music interpolates between. */
const ORB_DURATION = {
  idle: { spin: 9000, haze: 3000 },
  thinking: { spin: 2600, haze: 1200 },
} as const;
/** ReplyOrb's RATIO: sphere radius, grain size and haze size over the box. */
const ORB_RATIO = { sphere: 0.42, mote: 0.05, haze: 0.62 } as const;
/** ReplyOrb's TILT_DEG. */
const ORB_TILT = (-14 * Math.PI) / 180;
const ORB_TAU = Math.PI * 2;

/** ReplyOrb's LAYOUT, plus the one field it has no use for: which slice of the
    spectrum this grain listens to. Longitude picks it, so a grain carries its
    band around the sphere as it turns — keyed off latitude it would paint a
    bass-pole/treble-pole gradient that never moves. */
const ORB_LAYOUT = Array.from({ length: ORB_MOTES }, (_, i) => {
  const t = (i + 0.5) / ORB_MOTES;
  const y = 1 - 2 * t;
  const phase = (i * ORB_GOLDEN_FRACTION) % 1;
  return {
    y,
    ringRadius: Math.sqrt(Math.max(0, 1 - y * y)),
    phase,
    bright: i % 7 === 3,
    // Crowded towards the low end, where music actually lives.
    binFrac: Math.pow(phase, 1.35),
  };
});

let orbSpin = 0;
let orbHaze = 0;
let orbHazeDir = 1;
let orbEnergy = 0;
let orbBass = 0;
let orbLastFrame = 0;

const orbLerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function drawOrb(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  hue: number = 0
) {
  ctx.clearRect(0, 0, width, height);

  const bins = frequencyData.length;
  const band = (from: number, to: number) => {
    if (!bins) return 0;
    const lo = Math.min(from, bins);
    const hi = Math.min(to, bins);
    if (hi <= lo) return 0;
    let sum = 0;
    for (let i = lo; i < hi; i++) sum += frequencyData[i];
    return sum / (hi - lo) / 255;
  };

  const bass = band(0, 8);
  const level = bass * 0.5 + band(8, 32) * 0.32 + band(32, 72) * 0.18;

  // Fast attack, slow release: the ball snaps onto a hit and settles out of
  // it, which is what reads as reacting rather than wobbling.
  orbEnergy += (level - orbEnergy) * (level > orbEnergy ? 0.45 : 0.12);
  orbBass += (bass - orbBass) * (bass > orbBass ? 0.6 : 0.15);

  // Real elapsed time, so ReplyOrb's durations mean here what they mean there.
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  const dt = orbLastFrame ? Math.min(64, now - orbLastFrame) : 16;
  orbLastFrame = now;

  const spinMs = orbLerp(ORB_DURATION.idle.spin, ORB_DURATION.thinking.spin, orbEnergy);
  const hazeMs = orbLerp(ORB_DURATION.idle.haze, ORB_DURATION.thinking.haze, orbEnergy);
  orbSpin = (orbSpin + dt / spinMs) % 1;
  // The orb's haze keyframe is a ping-pong; here it ping-pongs on a clock that
  // the bass can shove straight to the top.
  orbHaze += (orbHazeDir * dt) / (hazeMs / 2);
  if (orbHaze >= 1) { orbHaze = 1; orbHazeDir = -1; }
  if (orbHaze <= 0) { orbHaze = 0; orbHazeDir = 1; }
  const haze = Math.min(1, orbHaze + orbBass * 0.6);

  const centreX = width / 2;
  const centreY = height / 2;
  const box = Math.min(width, height);
  const R = box * ORB_RATIO.sphere;
  const moteBase = Math.max(1.5, box * ORB_RATIO.mote);

  // Hue 0 is the orb as it ships everywhere else: white dust, nothing hued.
  // Past that the slider tints it, and loudness is what saturates it.
  const mono = hue === 0;
  const h = mono ? 0 : hue;
  const sat = mono ? 0 : Math.round(45 + orbEnergy * 55);
  // Same two scales as `palette`: the number is the monochrome lightness, and
  // colour compresses it down into the band where a hue still reads instead of
  // washing out to white.
  const dust = (lightness: number, alpha: number) =>
    mono
      ? `hsla(0, 0%, ${lightness}%, ${alpha})`
      : `hsla(${h}, ${sat}%, ${COLOUR_L(lightness)}%, ${alpha})`;

  ctx.save();
  ctx.translate(centreX, centreY);
  ctx.rotate(ORB_TILT);

  // Faint core haze — without it the motes read as a ring of dots rather than
  // a body with volume. ReplyOrb's exact gradient, with its 0.18/0.30 idle and
  // thinking alphas becoming a continuous ramp off the music.
  const hazeR = ((box * ORB_RATIO.haze) / 2) * (1 + haze * 0.12 + orbBass * 0.18);
  const hazeAlpha = (0.22 + orbEnergy * 0.5) * (0.5 + haze * 0.5);
  const hazeGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, hazeR);
  // The extra stop over ReplyOrb's two: a tight hot centre that only the bass
  // opens. It is what turns the haze from a grey smudge into something that
  // flares on the beat, without adding an object the orb doesn't have.
  hazeGradient.addColorStop(0, dust(100, Math.min(1, hazeAlpha + orbBass * 0.5)));
  hazeGradient.addColorStop(0.14, dust(96, hazeAlpha));
  hazeGradient.addColorStop(0.7, dust(88, 0));
  hazeGradient.addColorStop(1, dust(88, 0));
  ctx.beginPath();
  ctx.arc(0, 0, hazeR, 0, ORB_TAU);
  ctx.fillStyle = hazeGradient;
  ctx.fill();

  // The grains. Back half first so the haze sits inside the ball.
  const glow = moteBase * (0.35 + orbEnergy * 2.2);
  for (const pass of [false, true]) {
    for (const m of ORB_LAYOUT) {
      const angle = (orbSpin + m.phase) * ORB_TAU;
      // cos gives depth: +1 is the front of the ball, -1 the back.
      const depth = (Math.cos(angle) + 1) / 2;
      if (pass !== depth >= 0.5) continue;

      const f = bins ? frequencyData[Math.min(bins - 1, Math.floor(m.binFrac * bins))] / 255 : 0;
      // Its own band lifts the grain off the sphere, so the ball has a surface
      // that moves with the music instead of a body that scales with it.
      const push = 1 + f * 0.22;
      const x = m.ringRadius * R * Math.sin(angle) * push;
      const y = m.y * R * push;

      const dot = (m.bright ? moteBase * 1.45 : moteBase) * (0.55 + 0.45 * depth) * (1 + f * 0.55);
      const base = m.bright ? 0.95 : orbLerp(0.68, 0.8, orbEnergy);
      const alpha = Math.min(1, (0.2 + 0.8 * depth) * base * (0.75 + f * 0.5));

      ctx.beginPath();
      ctx.arc(x, y, dot / 2, 0, ORB_TAU);
      ctx.fillStyle = dust(orbLerp(92, 100, f), alpha);
      ctx.shadowColor = dust(90, Math.min(1, alpha * (0.6 + f * 0.8)));
      ctx.shadowBlur = glow * (0.5 + depth * 0.5) * (0.6 + f);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  ctx.restore();
}

export function resetOrb() {
  orbSpin = 0;
  orbHaze = 0;
  orbHazeDir = 1;
  orbEnergy = 0;
  orbBass = 0;
  orbLastFrame = 0;
}
