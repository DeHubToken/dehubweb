// DeHub Requests ad — soundtrack. Drum and bass at 175 BPM in F minor: two-step breaks, reese bass and sub,
// with the editor launch film's synth kit for the UI sounds. The picture runs on a 140 BPM grid and
// 175 = 140 x 1.25, so each section's bars start exactly on its picture hit.
// distorted sliding 808, half-swung hats, claps on 2 and 4. Every UI action in the picture has its own
// synthesized sound on the exact frame (event times come from the film page). No samples.
import fs from 'fs';
const ev = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3] || 'music.wav';
const E = ev.ev, TOTAL = ev.film.TOTAL;
const SR = 48000, N = Math.ceil((TOTAL + .05) * SR);
const WARP = [[0, 0], [6, 4], [23, 16], [42, 35]]; // [film beat, scene beat], same as film.js
const warp = (x, i, o) => { for (let k = 0; k < WARP.length - 1; k++) { const a = WARP[k], c = WARP[k + 1]; if (x <= c[i] || k === WARP.length - 2) return a[o] + (c[o] - a[o]) * (x - a[i]) / (c[i] - a[i]); } };
const BPM = 140, B = 60 / BPM, bt = b => warp(b, 1, 0) * B, ST = B / 4; // bt: scene beat -> film seconds
const bus = () => [new Float32Array(N), new Float32Array(N)];
const DR = bus(), BS = bus(), MU = bus(), FX = bus(), REV = bus();
const mtof = m => 440 * 2 ** ((m - 69) / 12);
const put = (b, i, l, r = l) => { if (i >= 0 && i < N) { b[0][i] += l; b[1][i] += r; } };
let seed = 7; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rnd() * 2 - 1;
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
class SVF { // Zavalishin TPT state-variable filter
  constructor() { this.a = 0; this.b = 0; this.lp = 0; this.bp = 0; this.hp = 0; }
  run(x, fc, res = .3) {
    const g = Math.tan(Math.PI * clamp(fc, 10, SR * .45) / SR), k = 2 - 2 * res;
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - this.b, v1 = a1 * this.a + a2 * v3, v2 = this.b + a2 * this.a + a3 * v3;
    this.a = 2 * v1 - this.a; this.b = 2 * v2 - this.b;
    this.lp = v2; this.bp = v1; this.hp = x - k * v1 - v2; return this;
  }
}
const pan = (x, p) => [x * Math.min(1, 1 - p), x * Math.min(1, 1 + p)];
const KICKS = [];

// ------------------------------------------------------------- instruments
function kick(t0, amp = 1) {
  KICKS.push(t0);
  const i0 = Math.round(t0 * SR); let ph = 0;
  for (let i = 0; i < .42 * SR; i++) {
    const t = i / SR, f = 46 + 120 * Math.exp(-t * 30) + 60 * Math.exp(-t * 160);
    ph += 2 * Math.PI * f / SR;
    const env = t < .004 ? t / .004 : Math.exp(-(t - .004) * 8.5);
    const x = Math.sin(ph) * env + noise() * Math.exp(-t * 500) * .35;
    put(DR, i0 + i, Math.tanh(x * 2.4) * .82 * amp);
  }
}
function b808(t0, dur, note, amp = 1, slideTo = null) {
  const i0 = Math.round(t0 * SR); let ph = 0; const f0 = mtof(note), f1 = slideTo == null ? f0 : mtof(slideTo);
  const len = dur + .09;
  for (let i = 0; i < len * SR; i++) {
    const t = i / SR;
    const sp = slideTo == null ? 0 : clamp((t - dur * .55) / (dur * .35));
    const f = (f0 * (1 - sp) + f1 * sp) * (1 + .5 * Math.exp(-t * 45));
    ph += 2 * Math.PI * f / SR;
    const env = Math.min(1, t / .003) * (t < dur ? Math.exp(-t * .9) : Math.exp(-dur * .9) * (1 - (t - dur) / .09));
    const y = Math.tanh(Math.sin(ph) * 3.4) * .5 * env * amp;
    put(BS, i0 + i, y);
  }
}
function clap(t0, amp = 1, rv = .25) {
  const i0 = Math.round(t0 * SR), f = new SVF(), body = new SVF();
  for (let i = 0; i < .3 * SR; i++) {
    const t = i / SR;
    let e = 0; for (const o of [0, .009, .018]) if (t >= o) e = Math.max(e, Math.exp(-(t - o) * 160));
    e = Math.max(e, t > .022 ? Math.exp(-(t - .022) * 16) * .55 : 0);
    const x = f.run(noise(), 1500, .35).bp * e * 1.6 + Math.sin(2 * Math.PI * 195 * t) * Math.exp(-t * 35) * .35;
    const y = Math.tanh(x * 1.6) * .55 * amp;
    put(DR, i0 + i, y * .95, y); put(REV, i0 + i, y * rv);
  }
}
function hat(t0, amp = .25, open = false, p = 0) {
  const i0 = Math.round(t0 * SR), f = new SVF(), f2 = new SVF();
  for (let i = 0; i < (open ? .35 : .07) * SR; i++) {
    const t = i / SR, env = Math.exp(-t * (open ? 14 : 75));
    const x = f2.run(f.run(noise(), 7500, .2).hp, 12000, .1).lp * env * amp;
    const [l, r] = pan(x, p); put(DR, i0 + i, l, r);
  }
}
function cowbell(t0, note, amp = .3, dur = .2, lp = 20000, p = 0, rv = .14) {
  const i0 = Math.round(t0 * SR), bp = new SVF(), l2 = new SVF();
  const f1 = mtof(note), f2 = f1 * 1.4836; let a = 0, b = 0;
  for (let i = 0; i < (dur + .08) * SR; i++) {
    const t = i / SR; a += f1 / SR; b += f2 / SR;
    const sq = (a % 1 < .5 ? 1 : -1) + (b % 1 < .5 ? 1 : -1) * .8;
    const env = Math.min(1, t / .0015) * Math.exp(-t * 11) * (t < dur ? 1 : Math.max(0, 1 - (t - dur) / .08));
    let x = bp.run(sq, f1 * 1.7, .45).bp;
    x = l2.run(Math.tanh(x * 1.8), lp, .1).lp * env * amp;
    const [L, R] = pan(x, p); put(MU, i0 + i, L, R); put(REV, i0 + i, x * rv);
  }
}
function pad(t0, t1, notes, amp = .12, cut = 1800, rv = .45) {
  const i0 = Math.round(t0 * SR), len = t1 - t0 + .6;
  const vs = []; notes.forEach(m => [-1, 0, 1].forEach(k => vs.push({ f: mtof(m) * (1 + k * .007), ph: rnd(), p: k * .6 })));
  const fl = new SVF(), fr = new SVF();
  for (let i = 0; i < len * SR; i++) {
    const t = i / SR; let l = 0, r = 0;
    for (const v of vs) { v.ph += v.f / SR; const x = 2 * (v.ph % 1) - 1; l += x * (1 - v.p * .5); r += x * (1 + v.p * .5); }
    const env = Math.min(1, t / .35) * (t < t1 - t0 ? 1 : Math.max(0, 1 - (t - (t1 - t0)) / .6));
    const c = cut * (1 + .25 * Math.sin(t * 2.1));
    const g = amp * env / vs.length * 2.4;
    const yl = fl.run(l, c, .2).lp * g, yr = fr.run(r, c, .2).lp * g;
    put(MU, i0 + i, yl, yr); put(REV, i0 + i, (yl + yr) * rv);
  }
}
function vox(t0, dur, note, vw = 0, amp = .14, p = 0) {
  const FORM = [[800, 1150, 2900], [450, 800, 2830], [350, 2000, 2800], [600, 1040, 2250]];
  const i0 = Math.round(t0 * SR), fs3 = [new SVF(), new SVF(), new SVF()], g = [1, .5, .22];
  let a = 0, b = 0;
  for (let i = 0; i < (dur + .06) * SR; i++) {
    const t = i / SR, f = mtof(note) * (1 + .007 * Math.sin(t * 34)) * (1 - .04 * Math.exp(-t * 30));
    a += f / SR; b += f * 1.005 / SR;
    const x = (2 * (a % 1) - 1) * .7 + (2 * (b % 1) - 1) * .3;
    let y = 0; FORM[vw].forEach((fc, k) => { y += fs3[k].run(x, fc, .88).bp * g[k]; });
    const env = Math.min(1, t / .01) * (t < dur ? 1 : Math.max(0, 1 - (t - dur) / .06));
    const v = Math.tanh(y * 1.4) * env * amp;
    const [L, R] = pan(v, p); put(MU, i0 + i, L, R); put(REV, i0 + i, v * .35);
  }
}
function riser(t0, t1, amp = .3, f0 = 300, f1 = 9000) {
  const i0 = Math.round(t0 * SR), n = (t1 - t0) * SR, fl = new SVF(); let ph = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n, fc = f0 * (f1 / f0) ** p;
    ph += 2 * Math.PI * (180 * 6 ** p) / SR;
    const x = (fl.run(noise(), fc, .55).bp * 1.2 + Math.sin(ph) * .12) * p * p * amp;
    put(FX, i0 + i, x * (1 + .3 * Math.sin(p * 40)), x * (1 - .3 * Math.sin(p * 40))); put(REV, i0 + i, x * .3);
  }
}
function revCym(t0, t1, amp = .25) {
  const i0 = Math.round(t0 * SR), n = (t1 - t0) * SR, f = new SVF();
  for (let i = 0; i < n; i++) { const p = i / n; const x = f.run(noise(), 5000, .1).hp * p ** 3 * amp; put(FX, i0 + i, x, x * .9); put(REV, i0 + i, x * .4); }
}
function whoosh(t0, dur, amp = .4, f0 = 400, f1 = 6000, p0 = -.6, p1 = .6) {
  const i0 = Math.round(t0 * SR), n = dur * SR, f = new SVF();
  for (let i = 0; i < n; i++) {
    const p = i / n, fc = f0 * (f1 / f0) ** p, env = Math.sin(Math.PI * p) ** 2;
    const x = f.run(noise(), fc, .5).bp * env * amp * 1.6;
    const [L, R] = pan(x, p0 + (p1 - p0) * p); put(FX, i0 + i, L, R); put(REV, i0 + i, x * .25);
  }
}
function impact(t0, amp = .8, rv = .6) {
  const i0 = Math.round(t0 * SR), f = new SVF(); let ph = 0;
  for (let i = 0; i < 1.6 * SR; i++) {
    const t = i / SR; ph += 2 * Math.PI * (28 + 50 * Math.exp(-t * 6)) / SR;
    const x = Math.sin(ph) * Math.exp(-t * 2.6) * .9 + f.run(noise(), 2400, .1).lp * Math.exp(-t * 14) * .7;
    const y = Math.tanh(x * 1.5) * amp * .7;
    put(FX, i0 + i, y); put(REV, i0 + i, y * rv);
  }
}
function boom(t0, amp = .8) { // the meme "boom"
  const i0 = Math.round(t0 * SR); let ph = 0, ph2 = 0;
  for (let i = 0; i < 1.3 * SR; i++) {
    const t = i / SR, f = 52 + 70 * Math.exp(-t * 9);
    ph += 2 * Math.PI * f / SR; ph2 += 2 * Math.PI * f * 2.01 / SR;
    const env = Math.min(1, t / .002) * Math.exp(-t * 2.4);
    const y = Math.tanh((Math.sin(ph) + .35 * Math.sin(ph2)) * 5) * env * .5 * amp;
    put(FX, i0 + i, y); put(REV, i0 + i, y * .5);
  }
}
function uiClick(t0, amp = .35) {
  const i0 = Math.round(t0 * SR), f = new SVF(); let ph = 0;
  for (let i = 0; i < .05 * SR; i++) {
    const t = i / SR; ph += 2 * Math.PI * (2600 - 1400 * Math.min(1, t / .012)) / SR;
    const x = (Math.sin(ph) * Math.exp(-t * 140) * .6 + f.run(noise(), 4000, .3).bp * Math.exp(-t * 300)) * amp;
    put(FX, i0 + i, x); put(REV, i0 + i, x * .15);
  }
}
function typeClick(t0, amp = .26) {
  const i0 = Math.round(t0 * SR), f = new SVF(), fc = 2200 + rnd() * 1800, p = (rnd() - .5) * .5, lo = 150 + rnd() * 60;
  for (let i = 0; i < .06 * SR; i++) {
    const t = i / SR;
    const x = (f.run(noise(), fc, .45).bp * Math.exp(-t * 110) * 1.2 + Math.sin(2 * Math.PI * lo * t) * Math.exp(-t * 55) * .4) * amp;
    const [L, R] = pan(x, p); put(FX, i0 + i, L, R);
  }
}
function pop(t0, amp = .3, f0 = 500) {
  const i0 = Math.round(t0 * SR); let ph = 0;
  for (let i = 0; i < .08 * SR; i++) { const t = i / SR; ph += 2 * Math.PI * f0 * (1 + 1.4 * Math.min(1, t / .04)) / SR; const x = Math.sin(ph) * Math.exp(-t * 45) * Math.min(1, t / .002) * amp; put(FX, i0 + i, x); put(REV, i0 + i, x * .2); }
}
function chop(t0, amp = .45) {
  const i0 = Math.round(t0 * SR), f = new SVF(); let ph = 0, ph2 = 0;
  for (let i = 0; i < .12 * SR; i++) {
    const t = i / SR; ph += 2 * Math.PI * (300 + 1500 * Math.exp(-t * 45)) / SR; ph2 += 2 * Math.PI * 70 / SR;
    const x = (f.run(noise(), 2500, .2).hp * Math.exp(-t * 80) * .8 + Math.sin(ph) * Math.exp(-t * 35) * .5 + Math.sin(ph2) * Math.exp(-t * 30) * .5) * amp;
    put(FX, i0 + i, Math.tanh(x * 1.5)); put(REV, i0 + i, x * .12);
  }
}
function bell(t0, f0 = 1318.5, amp = .22, rv = .5) {
  const i0 = Math.round(t0 * SR), P = [[1, 5, 1], [2.0, 7, .5], [3.01, 9, .3], [4.2, 13, .2]];
  for (let i = 0; i < 1.4 * SR; i++) {
    const t = i / SR; let x = 0; for (const [m, d, a] of P) x += Math.sin(2 * Math.PI * f0 * m * t) * Math.exp(-t * d) * a;
    x *= Math.min(1, t / .002) * amp; put(FX, i0 + i, x); put(REV, i0 + i, x * rv);
  }
}
function blip(t0, note, amp = .2, p = 0) {
  const i0 = Math.round(t0 * SR), f = new SVF(); let a = 0;
  for (let i = 0; i < .14 * SR; i++) {
    const t = i / SR; a += mtof(note) / SR;
    const x = f.run((a % 1 < .5 ? 1 : -1), 5000, .2).lp * Math.exp(-t * 30) * Math.min(1, t / .002) * amp;
    const [L, R] = pan(x, p); put(FX, i0 + i, L, R); put(REV, i0 + i, x * .2);
  }
}
function pluck(t0, note, amp = .12) {
  const i0 = Math.round(t0 * SR), f = mtof(note);
  for (let i = 0; i < .5 * SR; i++) { const t = i / SR; const x = (Math.sin(2 * Math.PI * f * t) + .3 * Math.sin(2 * Math.PI * f * 3 * t) * Math.exp(-t * 20)) * Math.exp(-t * 9) * Math.min(1, t / .002) * amp; const [L, R] = pan(x, (rnd() - .5) * .6); put(MU, i0 + i, L, R); put(REV, i0 + i, x * .4); }
}
function shimmer(t0, dur, amp = .1) {
  const i0 = Math.round(t0 * SR), n = dur * SR, f = new SVF();
  for (let i = 0; i < n; i++) {
    const p = i / n, t = i / SR, env = Math.sin(Math.PI * p) ** 2;
    let x = 0; for (const m of [88, 92, 95, 100]) x += Math.sin(2 * Math.PI * mtof(m) * t * (1 + .02 * p));
    x = x * .25 * env * amp + f.run(noise(), 3000 + 9000 * p, .4).bp * env * amp * .8;
    const [L, R] = pan(x, -.7 + 1.4 * p); put(FX, i0 + i, L, R); put(REV, i0 + i, x * .5);
  }
}
function progressTone(t0, t1, amp = .07) {
  const i0 = Math.round(t0 * SR), n = (t1 - t0) * SR; let ph = 0;
  for (let i = 0; i < n; i++) { const p = i / n; ph += 2 * Math.PI * (520 * 3 ** p) / SR; const x = Math.sin(ph) * (.5 + .5 * Math.sin(i / SR * 2 * Math.PI * 14)) * amp * Math.min(1, p * 8) * Math.min(1, (1 - p) * 20); put(FX, i0 + i, x); put(REV, i0 + i, x * .3); }
}
function flashHit(t0, amp = .3) { // camera-flash snap
  const i0 = Math.round(t0 * SR), f = new SVF();
  for (let i = 0; i < .09 * SR; i++) { const t = i / SR; const x = f.run(noise(), 6000, .2).hp * Math.exp(-t * 70) * amp; const [L, R] = pan(x, (rnd() - .5) * .6); put(FX, i0 + i, L, R); put(REV, i0 + i, x * .25); }
}
function thump(t0, amp = .5) {
  const i0 = Math.round(t0 * SR); let ph = 0;
  for (let i = 0; i < .16 * SR; i++) { const t = i / SR; ph += 2 * Math.PI * (70 + 160 * Math.exp(-t * 50)) / SR; const x = Math.tanh(Math.sin(ph) * 2) * Math.exp(-t * 22) * amp; put(FX, i0 + i, x); }
}
function vwoop(t0, dur, amp = .22) { // tape slow-down
  const i0 = Math.round(t0 * SR); let ph = 0;
  for (let i = 0; i < dur * SR; i++) { const p = i / (dur * SR); ph += 2 * Math.PI * (520 * (1 - .8 * p)) / SR; const x = Math.tanh(Math.sin(ph) * 2.5) * Math.sin(Math.PI * p) * amp; put(FX, i0 + i, x); put(REV, i0 + i, x * .3); }
}
function scratch(t0, amp = .45) { // record scratch: back-and-forth filtered noise with a pitch zigzag
  const i0 = Math.round(t0 * SR), f = new SVF(); let ph = 0;
  for (let i = 0; i < .32 * SR; i++) {
    const t = i / SR, wob = Math.sin(2 * Math.PI * 11 * t), fc = 900 + 2600 * (.5 + .5 * wob);
    ph += 2 * Math.PI * (180 + 260 * (.5 + .5 * wob)) / SR;
    const x = (f.run(noise(), fc, .75).bp * 1.4 + Math.sin(ph) * .35) * Math.exp(-t * 6) * Math.min(1, t / .004) * amp;
    put(FX, i0 + i, x * .9, x); put(REV, i0 + i, x * .2);
  }
}
// the editor's own download ending sound, verbatim (sweep + resolving chime)
function outroSoundSample(time) {
  if (!Number.isFinite(time) || time <= .12 || time >= 1.75) return 0;
  let sample = 0; const sweep = time - .12;
  if (sweep < .7) {
    const index = Math.floor(sweep * 48000);
    const hash = n => ((Math.imul(n + 42, 1664525) ^ Math.imul(n + 137, 1013904223)) >>> 0) / 2147483648 - 1;
    const nz = (hash(index - 1) + 2 * hash(index) + hash(index + 1)) / 4;
    sample += nz * .035 * Math.pow(Math.sin(Math.PI * sweep / .7), 2);
    sample += .045 * Math.sin(2 * Math.PI * (110 * sweep - 30 * sweep * sweep)) * Math.pow(Math.sin(Math.PI * sweep / .7), 2);
  }
  for (let i = 0; i < 2; i++) {
    const start = i === 0 ? .96 : 1.07, length = i === 0 ? .6 : .58, t = time - start;
    if (t <= 0 || t >= length) continue;
    const frequency = i === 0 ? 659.255 : 987.767;
    const envelope = (1 - Math.exp(-t * 160)) * Math.exp(-t * 12) * Math.min(1, (length - t) / .03);
    sample += (i === 0 ? .11 : .075) * envelope * (Math.sin(2 * Math.PI * frequency * t) + .1 * Math.sin(2 * Math.PI * frequency * 2 * t));
  }
  return sample;
}

// ------------------------------------------------------------- arrangement
const DB = 60 / 175, D16 = DB / 4; // drum and bass grid
function snare(t0, amp = 1, rv = .22) {
  const i0 = Math.round(t0 * SR), f = new SVF(), hp = new SVF(); let ph = 0;
  for (let i = 0; i < .26 * SR; i++) {
    const t = i / SR; ph += 2 * Math.PI * (185 + 60 * Math.exp(-t * 60)) / SR;
    const body = Math.sin(ph) * Math.exp(-t * 28) * .7;
    const nz = hp.run(f.run(noise(), 7000, .1).lp, 900, .2).hp * Math.exp(-t * 17) * 1.1;
    const y = Math.tanh((body + nz) * 1.8) * .55 * amp;
    put(DR, i0 + i, y, y * .97); put(REV, i0 + i, y * rv);
  }
}
function dkick(t0, amp = 1) {
  KICKS.push(t0);
  const i0 = Math.round(t0 * SR); let ph = 0;
  for (let i = 0; i < .26 * SR; i++) {
    const t = i / SR, fq = 52 + 170 * Math.exp(-t * 42);
    ph += 2 * Math.PI * fq / SR;
    const env = t < .002 ? t / .002 : Math.exp(-t * 13);
    put(DR, i0 + i, Math.tanh((Math.sin(ph) * env + noise() * Math.exp(-t * 700) * .4) * 2.2) * .8 * amp);
  }
}
function reese(t0, dur, note, amp = .5) { // two detuned saws, distorted, low-passed with a wobble; plus a clean sub
  const i0 = Math.round(t0 * SR), f0 = mtof(note), fl = new SVF(), fr = new SVF();
  let a = 0, b = 0, c = 0, sub = 0;
  for (let i = 0; i < (dur + .05) * SR; i++) {
    const t = i / SR;
    a += f0 * 1.009 / SR; b += f0 * .991 / SR; c += f0 * 2.003 / SR; sub += 2 * Math.PI * f0 / 2 / SR;
    const saw = (2 * (a % 1) - 1) + (2 * (b % 1) - 1) + .35 * (2 * (c % 1) - 1);
    const wob = .5 + .5 * Math.sin(2 * Math.PI * t / (DB * 2) - Math.PI / 2);
    const fc = 180 + 1700 * wob ** 1.5;
    const env = Math.min(1, t / .01) * (t < dur ? 1 : Math.max(0, 1 - (t - dur) / .05));
    const yl = Math.tanh(fl.run(saw, fc * 1.02, .35).lp * 1.6) * .32 * env * amp;
    const yr = Math.tanh(fr.run(saw, fc * .98, .35).lp * 1.6) * .32 * env * amp;
    const sb = Math.sin(sub) * .55 * env * amp;
    put(BS, i0 + i, yl + sb, yr + sb);
  }
}
const ROOT = [41, 37, 34, 36]; // F, Db, Bb, C (reese an octave above the sub)
// Two-step break: kick 1 and the "and" of 3, snares on 2 and 4, ghosts and shuffled hats. Bars start at t0 (seconds).
function dnb(t0, t1, o = {}) {
  const { bass = true, ghosts = true, ride = true, roll = true, first = 0 } = o;
  for (let bar = 0; t0 + bar * DB * 4 < t1 - 1e-4; bar++) {
    const base = t0 + bar * DB * 4, k = (first + bar) % 4;
    if (bass) reese(base, Math.min(DB * 4, t1 - base) - .02, ROOT[k], .9);
    for (let s = 0; s < 16; s++) {
      const t = base + s * D16 + (s % 2 ? D16 * .1 : 0);
      if (t >= t1 - 1e-4) break;
      if (s === 0 || s === 10 || (bar % 2 === 1 && s === 7)) dkick(t, s ? .9 : 1);
      if (s === 4 || s === 12) snare(t, 1);
      if (ghosts && (s === 7 || s === 9 || s === 15)) snare(t, .22, .05);
      if (s % 2 === 0) hat(t, s % 4 ? .16 : .1, false, .25);
      else hat(t, .07, false, -.2);
      if (ride && s % 4 === 2) hat(t, .09, true, -.3);
      if (roll && bar % 2 === 1 && s >= 14) { snare(t + D16 / 2, .3, .05); }
    }
  }
}
const bd = b => b * B; // a length in beats -> seconds
const slam = (t, n, a = 1) => { dkick(t, 1); reese(t, bd(.45), n, .9 * a); impact(t, .7 * a, .5); snare(t, .8); };
// ---- intro: pad and atmosphere, typing on top, a snare roll into the drop
pad(0, bt(3.7), [53, 56, 60, 65], .1, 1200);
for (let s = 0; bt(.5) + s * D16 < bt(4); s += 2) hat(bt(.5) + s * D16, .04 + .06 * s / 24, false, .2);
{ const r0 = bt(4) - DB * 2; for (let s = 0; s < 8; s++) snare(r0 + s * D16, .12 + .5 * s / 8, .08); for (let s = 0; s < 8; s++) snare(r0 + DB * 2 * .5 + s * D16 / 2, .3 + .4 * s / 8, .06); }
riser(bt(2), bt(4), .4);
revCym(bt(3), bt(4), .3);
E.type.forEach(t => typeClick(t));
E.click.filter(t => t < bt(4)).forEach(t => uiClick(t, .5));
// ---- drop: the page
impact(bt(4), 1); boom(bt(4), .5); whoosh(bt(3.85), .5, .5, 300, 7000, .6, -.6);
dnb(bt(4), bt(15.6), { first: 0, ghosts: false, roll: false }); // lighter under the prompt flow
pop(bt(4.4), .28, 520);
E.float.forEach((t, i) => pop(t, .09, 800 + (i % 5) * 140));
const SCALE = [72, 75, 77, 80];
E.status.forEach((t, i) => { chop(t, .4); blip(t, SCALE[i], .17, i % 2 ? .3 : -.3); });
E.tab.forEach(t => whoosh(t - .02, .22, .4, 900, 6000, -.6, .6));
bell(bt(12.4), 1318.5, .22); shimmer(bt(12.4), bd(1.2), .1); impact(bt(12.4), .5, .5);
pop(bt(13.2), .25, 700); bell(bt(13.3), 1760, .14);
E.pop.forEach(t => pop(t, .22, 600));
E.click.filter(t => t > bt(4)).forEach(t => uiClick(t, .55));
riser(bt(14), bt(16), .42); revCym(bt(15), bt(16), .35);
// ---- YOU PROMPT IT. WE SHIP IT.
impact(bt(16), 1); boom(bt(16), .6);
const S3 = E.slam.filter(t => t < bt(19.9));
[[41, 1], [41, 1], [37, .9], [36, 1]].forEach(([n, a], i) => { if (S3[i] != null) slam(S3[i], n, a); });
for (let s = 0; s < 8; s++) snare(bt(19) + s * D16, .15 + .5 * s / 8, .06);
riser(bt(19), bt(20), .4); whoosh(bt(19.5), bd(.5), .5, 400, 9000, -.6, .6);
// ---- PROMPT / VOTE / BUILD / SHIP
dnb(bt(20), bt(23.5), { first: 2 });
E.tick.forEach((t, i) => { blip(t, SCALE[i] + 5, .18, i % 2 ? .35 : -.35); impact(t, .35, .3); });
const TAPE = [bt(23.5), bt(24)];
// ---- the question
const S4 = E.slam.filter(t => t >= bt(23.9) && t < E.qmark - .01);
S4.forEach((t, i) => slam(t, [41, 44, 46, 48, 49][i % 5], .9 + i * .03));
pad(bt(24), bt(29.6), [49, 53, 56, 61], .09, 2400);
boom(E.qmark, .85); impact(E.qmark, 1, .7); dkick(E.qmark, 1); scratch(E.qmark - .02, .35);
dnb(E.qmark + DB, bt(29.6), { first: 0, roll: false });
shimmer(bt(27.4), bd(1.2), .11); shimmer(bt(28.4), bd(1), .09);
revCym(bt(28.5), bt(30), .4); whoosh(bt(29.5), bd(.6), .5, 400, 9000, .5, -.5);
// ---- end card
impact(bt(30), 1, .8); dkick(bt(30), 1); reese(bt(30), 1.6, 41, .9);
pad(bt(30), bt(30) + 1.8, [53, 56, 60, 65], .07, 1400, .6);
{ const i0 = Math.round(bt(30) * SR); for (let i = 0; i < 1.8 * SR; i++) { const x = outroSoundSample(i / SR) * 2.4; put(FX, i0 + i, x); put(REV, i0 + i, x * .4); } }

// ------------------------------------------------------------- mix
const tOf = i => i / SR;
// sidechain: kick ducks bass + music
KICKS.sort((a, b) => a - b);
const duck = new Float32Array(N).fill(1);
for (const tk of KICKS) { const i0 = Math.round(tk * SR); for (let i = 0; i < .28 * SR && i0 + i < N; i++) duck[i0 + i] = Math.min(duck[i0 + i], 1 - .6 * Math.exp(-i / SR * 14)); }
// music bus automation: intro low-pass handled per note; gate during the cuts; low-pass during the post flow
const mf = [new SVF(), new SVF()], bf = [new SVF(), new SVF()], df = [new SVF(), new SVF()];
for (let i = 0; i < N; i++) {
  const t = tOf(i), b = warp(t / B, 0, 1);
  const g = 1;
  let fc = 20000;
  if (b >= 13.1 && b < 15.6) fc = b < 13.4 ? 20000 * (3000 / 20000) ** ((b - 13.1) / .3) : b > 15 ? 3000 * (20000 / 3000) ** ((b - 15) / .6) : 3000;
  for (let c = 0; c < 2; c++) {
    let m = MU[c][i] * g, bs = BS[c][i], d = DR[c][i];
    if (fc < 19999) { m = mf[c].run(m, fc, .15).lp; bs = bf[c].run(bs, Math.max(fc, 400), .1).lp; d = df[c].run(d, fc * 1.6, .1).lp; }
    MU[c][i] = m * duck[i]; BS[c][i] = bs * (.45 + .55 * duck[i]); DR[c][i] = d;
  }
}
// tape stop on drums/bass/music
for (const bz of [DR, BS, MU]) for (let c = 0; c < 2; c++) {
  const a = Math.round(TAPE[0] * SR), z = Math.round(TAPE[1] * SR), src = bz[c].slice(a, z);
  let pos = 0;
  for (let i = a; i < z; i++) {
    const p = (i - a) / (z - a), sp = Math.max(0, 1 - p) ** 1.6;
    const j = Math.floor(pos), fr = pos - j;
    bz[c][i] = ((src[j] || 0) * (1 - fr) + (src[j + 1] || 0) * fr) * (1 - p * .3);
    pos += sp;
  }
}
// reverb (Freeverb-ish)
function reverb(inp) {
  const out = [new Float32Array(N), new Float32Array(N)];
  const CD = [1557, 1617, 1491, 1422, 1277, 1356], AD = [556, 441, 341];
  for (let c = 0; c < 2; c++) {
    const sp = c ? 23 : 0;
    const combs = CD.map(d => ({ b: new Float32Array(Math.round((d + sp) * SR / 44100)), i: 0, f: 0 }));
    const alls = AD.map(d => ({ b: new Float32Array(Math.round((d + sp) * SR / 44100)), i: 0 }));
    for (let i = 0; i < N; i++) {
      const x = inp[c][i] * .3; let y = 0;
      for (const cb of combs) { const o = cb.b[cb.i]; cb.f = o * .72 + cb.f * .28; cb.b[cb.i] = x + cb.f * .84; cb.i = (cb.i + 1) % cb.b.length; y += o; }
      for (const ap of alls) { const o = ap.b[ap.i]; const v = -y + o; ap.b[ap.i] = y + o * .5; y = v; ap.i = (ap.i + 1) % ap.b.length; }
      out[c][i] = y;
    }
  }
  return out;
}
const RV = reverb(REV);
const L = new Float32Array(N), Rr = new Float32Array(N);
for (let i = 0; i < N; i++) {
  for (let c = 0; c < 2; c++) {
    const v = DR[c][i] * .95 + BS[c][i] * .95 + MU[c][i] * .85 + FX[c][i] * .9 + RV[c][i] * .55;
    (c ? Rr : L)[i] = v;
  }
}
// master: gentle glue saturation, end fade, then a look-ahead peak limiter
const fadeA = Math.round((TOTAL - .3) * SR);
for (let i = 0; i < N; i++) { const f = i > fadeA ? Math.max(0, 1 - (i - fadeA) / (.3 * SR)) : 1; L[i] = Math.tanh(L[i] * 1.1) / 1.1 * f; Rr[i] = Math.tanh(Rr[i] * 1.1) / 1.1 * f; }
function limit(ch, ceil = .89) {
  const la = Math.round(.004 * SR); let g = 1; const out = new Float32Array(N);
  const pk = new Float32Array(N); for (let i = 0; i < N; i++) pk[i] = Math.max(Math.abs(ch[0][i]), Math.abs(ch[1][i]));
  for (let i = 0; i < N; i++) {
    let m = 0; for (let j = i; j < Math.min(N, i + la); j += 4) m = Math.max(m, pk[j]);
    const tg = m > ceil ? ceil / m : 1;
    g = tg < g ? tg : g + (tg - g) * .0006;
    ch[0][i] *= g; ch[1][i] *= g;
  }
}
limit([L, Rr]);
// write 24-bit-ish float WAV (32-bit float)
const buf = Buffer.alloc(44 + N * 8);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 8, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 8, 28); buf.writeUInt16LE(8, 32); buf.writeUInt16LE(32, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 8, 40);
for (let i = 0; i < N; i++) { buf.writeFloatLE(L[i], 44 + i * 8); buf.writeFloatLE(Rr[i], 48 + i * 8); }
fs.writeFileSync(OUT, buf);
console.log('wrote', OUT, (N / SR).toFixed(2) + 's', 'kicks', KICKS.length);
