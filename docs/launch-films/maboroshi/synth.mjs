// DeHub Maboroshi launch film — soundtrack. Clean, rolling drum and bass in F minor at 170 BPM: two-step breaks
// with ghost snares, a reese bass over a clean sine sub, chord stabs and a pad. Every cut and swap in the picture has its own
// synthesized sound on the exact frame (event times come from the film page). No samples.
import fs from 'fs';
const ev = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3] || 'music.wav';
const E = ev.ev, TOTAL = ev.film.TOTAL;
const SR = 48000, N = Math.ceil((TOTAL + .05) * SR);
const BPM = 170, B = 60 / BPM, bt = b => b * B, ST = B / 4; // 16th
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
    const y = x * amp * .55;
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

// ------------------------------------------------------------- drum and bass kit
function dkick(t0, amp = 1) { // tight, clean: short pitch drop, no clipping
  KICKS.push(t0);
  const i0 = Math.round(t0 * SR); let ph = 0;
  for (let i = 0; i < .3 * SR; i++) {
    const t = i / SR, f = 52 + 110 * Math.exp(-t * 38);
    ph += 2 * Math.PI * f / SR;
    const env = Math.min(1, t / .002) * Math.exp(-t * 11);
    const x = Math.sin(ph) * env * .85 + noise() * Math.exp(-t * 700) * .25;
    put(DR, i0 + i, x * amp);
  }
}
function snare(t0, amp = 1, rv = .22) { // body + crisp noise, the D&B crack
  const i0 = Math.round(t0 * SR), f = new SVF(), h = new SVF(); let ph = 0;
  for (let i = 0; i < .26 * SR; i++) {
    const t = i / SR; ph += 2 * Math.PI * (185 + 60 * Math.exp(-t * 60)) / SR;
    const body = Math.sin(ph) * Math.exp(-t * 28) * .55;
    const nz = h.run(f.run(noise(), 5200, .25).lp, 900, .1).hp * Math.exp(-t * 22) * .8;
    const x = (body + nz) * Math.min(1, t / .001) * amp * .7;
    put(DR, i0 + i, x * .95, x); put(REV, i0 + i, x * rv);
  }
}
function shaker(t0, amp = .08, p = .3) {
  const i0 = Math.round(t0 * SR), f = new SVF();
  for (let i = 0; i < .05 * SR; i++) { const t = i / SR; const x = f.run(noise(), 9000, .2).hp * Math.min(1, t / .006) * Math.exp(-t * 90) * amp; const [L, R] = pan(x, p); put(DR, i0 + i, L, R); }
}
function ride(t0, amp = .06) {
  const i0 = Math.round(t0 * SR), f = new SVF();
  for (let i = 0; i < .4 * SR; i++) { const t = i / SR; let x = 0; for (const m of [1, 1.47, 2.03, 2.76]) x += Math.sin(2 * Math.PI * 3200 * m * t); x = (x * .2 + f.run(noise(), 8000, .1).hp) * Math.exp(-t * 9) * amp; put(DR, i0 + i, x * .8, x); put(REV, i0 + i, x * .2); }
}
// bass: a clean sine sub under a reese (detuned saws, moving low-pass), both following one note line
const SUB = [], REESE = [];
function bassNote(t0, dur, note, amp = 1) { SUB.push([t0, dur, note, amp]); REESE.push([t0, dur, note, amp]); }
function renderBass() {
  for (const [t0, dur, note, amp] of SUB) {
    const i0 = Math.round(t0 * SR), f = mtof(note); let ph = 0;
    for (let i = 0; i < (dur + .03) * SR; i++) { const t = i / SR; ph += 2 * Math.PI * f / SR; const env = Math.min(1, t / .006) * (t < dur ? 1 : 1 - (t - dur) / .03); put(BS, i0 + i, Math.sin(ph) * env * .55 * amp); }
  }
  const fl = new SVF(), fr = new SVF();
  for (const [t0, dur, note, amp] of REESE) {
    const i0 = Math.round(t0 * SR), f = mtof(note + 12); const ps = [0, .31, .62, .13];
    for (let i = 0; i < (dur + .03) * SR; i++) {
      const t = i / SR, tt = t0 + t;
      let l = 0, r = 0;
      [-1, -.35, .35, 1].forEach((d, k) => { ps[k] += f * (1 + d * .009) / SR; const x = 2 * (ps[k] % 1) - 1; l += x * (k < 2 ? 1 : .6); r += x * (k < 2 ? .6 : 1); });
      const fc = 260 + 520 * (.5 + .5 * Math.sin(tt * 2 * Math.PI / (B * 8)));
      const env = Math.min(1, t / .01) * (t < dur ? 1 : 1 - (t - dur) / .03);
      const g = .09 * amp * env;
      put(BS, i0 + i, fl.run(l, fc, .35).lp * g, fr.run(r, fc, .35).lp * g);
    }
  }
}
function stab(t0, notes, amp = .14, dur = .18) { // short filtered chord
  const i0 = Math.round(t0 * SR), fl = new SVF(); const ph = notes.map(() => rnd());
  for (let i = 0; i < (dur + .25) * SR; i++) {
    const t = i / SR; let x = 0;
    notes.forEach((m, k) => { ph[k] += mtof(m) / SR; x += 2 * (ph[k] % 1) - 1; });
    const env = Math.min(1, t / .003) * Math.exp(-t * (t < dur ? 6 : 18));
    const y = fl.run(x / notes.length, 1400 + 3000 * Math.exp(-t * 14), .3).lp * env * amp;
    put(MU, i0 + i, y * .9, y); put(REV, i0 + i, y * .55);
  }
}
function subDrop(t0, amp = .7) { // clean sine boom
  const i0 = Math.round(t0 * SR); let ph = 0;
  for (let i = 0; i < 1.4 * SR; i++) { const t = i / SR; ph += 2 * Math.PI * (40 + 60 * Math.exp(-t * 5)) / SR; const y = Math.sin(ph) * Math.min(1, t / .003) * Math.exp(-t * 2.6) * .6 * amp; put(FX, i0 + i, y); }
}
// progression per bar: Fm | Db | Bbm | C
const ROOT = [29, 25, 22, 24];
const CHORD = [[65, 68, 72], [65, 68, 73], [65, 70, 73], [64, 67, 72]];
function dnb(b0, b1, o = {}) {
  const { kick: K = true, snr = true, ghosts = true, hats = true, bass = true, rideOn = false, amp = 1, stabs = false } = o;
  for (let bar = Math.floor(b0 / 4); bar * 4 < b1; bar++) {
    const k = ((bar % 4) + 4) % 4, base = bt(bar * 4);
    for (let s = 0; s < 16; s++) {
      const bb = bar * 4 + s / 4; if (bb < b0 - 1e-6 || bb >= b1 - 1e-6) continue;
      const t = base + s * ST;
      if (K && (s === 0 || s === 10 || (k === 3 && s === 11))) dkick(t, amp * (s ? .85 : 1));
      if (snr && (s === 4 || s === 12)) snare(t, amp);
      if (ghosts && [7, 9, 15].includes(s)) snare(t, amp * (s === 15 ? .22 : .16), .05);
      if (hats) shaker(t + (s % 2 ? ST * .08 : 0), (s % 2 ? .05 : .085) * amp, s % 4 === 2 ? -.3 : .3);
      if (rideOn && s % 4 === 2) ride(t, .05 * amp);
      if (stabs && (s === 0 || (s === 6 && k % 2))) stab(t, CHORD[k], .12, s ? .1 : .2);
    }
    if (bass) {
      const r = ROOT[k], bt0 = Math.max(base, bt(b0)), end = Math.min(base + bt(4), bt(b1));
      if (end > bt0) {
        const n1 = Math.min(end, base + bt(2.5));
        if (n1 > bt0) bassNote(bt0, n1 - bt0 - .02, r, 1);
        if (end > n1) bassNote(n1, end - n1 - .02, k === 3 ? r + 5 : r + 7, .9);
      }
    }
  }
}

// ------------------------------------------------------------- arrangement
// ---- hook: Jean Phil cuts on half beats, drums already rolling
pad(0, bt(8), [53, 56, 60, 65], .08, 1600);
dnb(0, 4, { bass: false, amp: .8 });
E.cut.filter(t => t < bt(4)).forEach((t, i) => flashHit(t, .18));
E.slam.filter(t => t < bt(4)).forEach(t => { snare(t, .5, .25); stab(t, CHORD[0], .1); });
riser(bt(2.5), bt(4.25), .3); revCym(bt(3), bt(4.25), .28);
// the cat swap
E.swap.filter(t => t < bt(5)).forEach(t => { impact(t, .7); subDrop(t, .7); shimmer(t, bt(1.5), .12); whoosh(t - .08, bt(.8), .45, 300, 9000, -.5, .5); });
dnb(4.25, 6, { amp: .95 });
E.slam.filter(t => t > bt(4.8) && t < bt(5.9)).forEach(t => stab(t, CHORD[1], .12));
// title card
impact(bt(6), .9, .8); dkick(bt(6), 1); subDrop(bt(6), .8); stab(bt(6), [53, 56, 60, 65], .16, .5);
for (let b = 7; b < 8; b += b < 7.5 ? .25 : 1 / 8) snare(bt(b), .2 + .5 * (b - 7), .08);
riser(bt(6.5), bt(8), .4); revCym(bt(7), bt(8), .3);
// ---- original vs Maboroshi pairs
impact(bt(8), .8); subDrop(bt(8), .6);
dnb(8, 19.5, { stabs: true });
E.swap.filter(t => t > bt(8) && t < bt(20)).forEach((t, i) => { whoosh(t - .05, B * .7, .35, 500, 9000, i % 2 ? -.5 : .5, i % 2 ? .5 : -.5); shimmer(t, B * 1.2, .08); flashHit(t, .22); });
riser(bt(17.5), bt(20), .45); revCym(bt(18.5), bt(20), .35);
for (let b = 18.5; b < 19.75; b += b < 19 ? .25 : b < 19.5 ? 1 / 8 : 1 / 16) snare(bt(b), .2 + .5 * (b - 18.5) / 1.25, .06);
// ---- drop
impact(bt(20), .9); subDrop(bt(20), .9);
dnb(20, 27.5, { rideOn: true, stabs: true });
E.swap.filter(t => t >= bt(20) && t < bt(26)).forEach((t, i) => { whoosh(t - .03, B * .4, .3, 600, 10000, i % 2 ? -.5 : .5, i % 2 ? .5 : -.5); flashHit(t, .25); });
E.cut.filter(t => t >= bt(26) && t < bt(27.5)).forEach((t, i) => { snare(t, .35, .1); flashHit(t, .25); });
for (let i = 0; i < 12; i++) pop(bt(27.5 + i * .04), .1, 600 + i * 70);
// tape stop at 27.5 (applied after mixing), then the slams
const TAPE = [bt(27.5), bt(28)];
[[28, 0], [28.5, 0], [30, 1], [30.5, 3]].forEach(([b, k]) => { dkick(bt(b), 1); bassNote(bt(b), bt(b % 1 ? 1.4 : .45), ROOT[k], 1); impact(bt(b), .6, .5); snare(bt(b), .8); stab(bt(b), CHORD[k], .14, .2); });
revCym(bt(29), bt(30), .25);
riser(bt(31), bt(32), .4); whoosh(bt(31.5), bt(.5), .45, 400, 9000, -.6, .6);
// ---- the library: counter, three steps
impact(bt(32), .6);
E.whoosh.filter(t => t < bt(40)).forEach(t => whoosh(t, bt(2), .45, 200, 5000, .4, -.4));
dnb(32, 40, { rideOn: true });
for (let b = 32.5, i = 0; b < 35; b += .25, i++) blip(bt(b), 65 + Math.min(24, i * 2), .06 + .05 * (b - 32.5) / 2.5, i % 2 ? .3 : -.3);
E.pop.forEach(t => { pop(t, .22, 700); bell(t, 1318.5, .14); });
E.tick.filter(t => t < bt(40)).forEach((t, i) => { blip(t, [72, 75, 79][i], .18, 0); stab(t, CHORD[i], .1); });
whoosh(bt(39.4), bt(.8), .5, 300, 9000, .7, -.7);
// ---- Jean Phil templates
impact(bt(40), .7); subDrop(bt(40), .6);
dnb(40, 48, { rideOn: true, stabs: true });
E.slam.filter(t => t >= bt(40) && t < bt(48)).forEach(t => snare(t, .4, .2));
E.cut.filter(t => t > bt(40.5) && t < bt(48)).forEach(t => flashHit(t, .18));
// ---- the promises
E.whoosh.filter(t => t >= bt(47)).forEach(t => whoosh(t - .1, bt(.8), .4, 300, 7000, .4, -.4));
dnb(48, 51.5, { ghosts: false, amp: .9 });
E.tick.filter(t => t > bt(48)).forEach((t, i) => { blip(t, [72, 75, 79][i], .18, 0); pop(t, .12, 900); });
riser(bt(50.5), bt(52), .4); revCym(bt(51), bt(52), .32);
// ---- brand slam
[52, 52.5, 53, 53.5].forEach((b, i) => { dkick(bt(b), 1); bassNote(bt(b), bt(.45), [29, 29, 32, 36][i] - (i > 1 ? 12 : 0), 1); impact(bt(b), .6 + i * .08, .5); snare(bt(b), .8); if (i === 3) subDrop(bt(b), .7); });
pad(bt(54), bt(59.6), [49, 53, 56, 61], .09, 2600);
dnb(54, 59.5, { rideOn: true });
shimmer(bt(54.1), bt(1.6), .11); shimmer(bt(57.6), bt(1.6), .09);
pop(bt(54), .2, 700); pop(bt(54.5), .2, 900);
revCym(bt(58.5), bt(60), .35); whoosh(bt(59.5), bt(.6), .45, 400, 9000, .5, -.5);
// ---- end card
impact(bt(60), .8, .8); dkick(bt(60), 1); subDrop(bt(60), .8); bassNote(bt(60), 2.2, 29, 1);
pad(bt(60), bt(60) + 1.8, [53, 56, 60, 65], .07, 1400, .6);
{ const i0 = Math.round(bt(60) * SR); for (let i = 0; i < 1.8 * SR; i++) { const x = outroSoundSample(i / SR) * 2.4; put(FX, i0 + i, x); put(REV, i0 + i, x * .4); } }
renderBass();

// ------------------------------------------------------------- mix
const tOf = i => i / SR;
// sidechain: kick ducks bass + music
KICKS.sort((a, b) => a - b);
const duck = new Float32Array(N).fill(1);
for (const tk of KICKS) { const i0 = Math.round(tk * SR); for (let i = 0; i < .28 * SR && i0 + i < N; i++) duck[i0 + i] = Math.min(duck[i0 + i], 1 - .6 * Math.exp(-i / SR * 14)); }
// music bus automation: intro low-pass handled per note; gate during the cuts; low-pass during the post flow
const mf = [new SVF(), new SVF()], bf = [new SVF(), new SVF()], df = [new SVF(), new SVF()];
for (let i = 0; i < N; i++) {
  const t = tOf(i), b = t / B;
  let g = 1;
  let fc = 20000;
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
    const v = (DR[c][i] * 1.0 + BS[c][i] * .9 + MU[c][i] * .8 + FX[c][i] * .8 + RV[c][i] * .45) * .4;
    (c ? Rr : L)[i] = v;
  }
}
// master: end fade, then a look-ahead peak limiter
const fadeA = Math.round((TOTAL - .35) * SR);
for (let i = 0; i < N; i++) { const f = i > fadeA ? Math.max(0, 1 - (i - fadeA) / (.35 * SR)) : 1; L[i] *= f; Rr[i] *= f; }
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
