'use strict';
// DeHub Maboroshi launch film. Every pixel is a pure function of time: render(t) sets the whole frame.
// 140 BPM grid; all scene times below are in beats. Same engine and format as the editor launch film.
const Q = new URLSearchParams(location.search);
const W = +(Q.get('w') || 1920), H = +(Q.get('h') || 1080), VERT = H > W;
const BPM = 140, B = 60 / BPM, bt = b => b * B;
const END_B = 68, TOTAL = bt(END_B) + 1.4;
const stage = document.getElementById('stage');
stage.style.width = W + 'px'; stage.style.height = H + 'px';
const ACC = '#d4e0c8', ACC_RGB = '212,224,200';

// ---------------------------------------------------------------- math
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const oc = t => 1 - (1 - t) ** 3, oq = t => 1 - (1 - t) ** 4, ox = t => t >= 1 ? 1 : 1 - 2 ** (-10 * t);
const ic = t => t * t * t, ioc = t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const ob = (t, s = 1.70158) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
const P = (b, a, z) => clamp((b - a) / (z - a));
const rnd = s => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---------------------------------------------------------------- dom
function mk(tag, cls, css, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (css) e.style.cssText = css;
  if (html != null) e.innerHTML = html;
  (parent || stage).appendChild(e);
  return e;
}
const tf = (e, s) => { if (e._tf !== s) { e.style.transform = s; e._tf = s; } };
const op = (e, o) => { o = Math.round(clamp(o) * 1000) / 1000; if (e._op !== o) { e.style.opacity = o; e.style.visibility = o <= 0 ? 'hidden' : 'visible'; e._op = o; } };
const vis = (e, on) => { const d = on ? '' : 'none'; if (e._d !== d) { e.style.display = d; e._d = d; } };
const txt = (e, s) => { if (e._tx !== s) { e.textContent = s; e._tx = s; } };
const CHROME = 'linear-gradient(180deg,#ffffff 0%,#f1f1f1 30%,#9a9a9a 49%,#5e5e5e 51%,#e9e9e9 66%,#bdbdbd 84%,#ffffff 100%)';
const SHINE = 'linear-gradient(100deg, rgba(255,255,255,0) 44%, rgba(255,255,255,.98) 50%, rgba(255,255,255,0) 56%)';
function shineInit(e) { e.style.backgroundImage = SHINE + ',' + CHROME; e.style.backgroundSize = '320% 100%, 100% 100%'; e.style.backgroundRepeat = 'no-repeat'; e.style.backgroundPosition = '130% 0, 0 0'; }
function shine(e, p) { const v = p <= 0 || p >= 1 ? 130 : lerp(115, -15, p); const s = v.toFixed(1) + '% 0, 0 0'; if (e._sh !== s) { e.style.backgroundPosition = s; e._sh = s; } }
const ico = (n, size = 16, sw = 2, style = '') => `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" stroke-width="${sw}" style="${style}">${ICONS[n]}</svg>`;
function cv(w, h, parent, css = '') { const c = mk('canvas', 'ab', `width:${w}px;height:${h}px;${css}`, parent); c.width = w; c.height = h; return c; }
function ocv(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }

const loads = [];
function whenLoaded(i, src) {
  return new Promise(res => {
    let tries = 0;
    const ok = () => (i.complete && i.naturalWidth > 0);
    const go = () => { if (ok()) return res(); i.onload = () => res(); i.onerror = () => { if (++tries < 6) setTimeout(() => { i.src = src + '?r=' + tries; }, 50 * tries); else { console.log('img fail', src); res(); } }; };
    go(); if (!i.src) i.src = src;
  });
}
function img(src) { const i = new Image(); loads.push(whenLoaded(i, src)); i.src = src; return i; }

// ---------------------------------------------------------------- assets
const ALLEY = Array.from({ length: 72 }, (_, i) => img(`a/osaka/${String(i + 1).padStart(3, '0')}.jpg`));
const IW = 1920, IH = 1070;
const alleyAt = sec => ALLEY[Math.floor((((sec * 24) % 72) + 72) % 72)];
const MARK = img('a/mark.png');
const ICON3D = {}; for (const n of ['sparkle', 'star', 'sparkles-duo']) ICON3D[n] = `a/icons/${n}.png`;
// the six featured looks (window.MABOROSHI_FEATURED), with their place in the 180-look catalog
const LOOKS = [
  ['plushie', 'Plushie takeover', 'Social favorites', 73], ['anime', 'Anime hero', 'Social favorites', 76],
  ['chrome', 'Liquid chrome', 'Materials', 163], ['crochet', 'Crochet companion', 'Social favorites', 78],
  ['crystal', 'Crystal guardian', 'Fantasy', 93], ['clay', 'Clay character', 'Social favorites', 75],
].map(([k, name, cat, n]) => ({ k, name, cat, n, cut: img(`a/looks/${k}.png`), tile: `a/looks/${k}_tile.jpg` }));
const LK = Object.fromEntries(LOOKS.map(l => [l.k, l]));
for (const l of LOOKS) loads.push(whenLoaded(new Image(), l.tile));

const EVENTS = { click: [], type: [], pop: [], swap: [], cut: [], slam: [], tick: [], whoosh: [] };
window.EVENTS = EVENTS;

// ---------------------------------------------------------------- characters: graded cutouts, reflections, the "you" silhouette
const G = {}; // k -> { c: graded canvas, r: reflection canvas, ax: foot anchor x (0..1) }
function anchorX(c) { // mean x of the opaque pixels in the bottom quarter = where the feet are
  const x = c.getContext('2d'), d = x.getImageData(0, Math.floor(c.height * .75), c.width, Math.ceil(c.height * .25)).data;
  let s = 0, n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 128) { s += ((i - 3) / 4) % c.width; n++; }
  return n ? s / n / c.width : .5;
}
function grade(im, silhouette) {
  const w = im.naturalWidth, h = im.naturalHeight, c = ocv(w, h), x = c.getContext('2d');
  x.drawImage(im, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  if (silhouette) {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#20232b'); g.addColorStop(1, '#08090b');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  } else {
    // night grade + neon spill: warm tiles on the left, red lanterns on the right, cold sky on top
    x.fillStyle = 'rgba(14,10,30,.18)'; x.fillRect(0, 0, w, h);
    let g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(255,190,80,.16)'); g.addColorStop(.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,40,90,.24)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(90,170,255,.10)'); g.addColorStop(.75, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.38)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }
  x.globalCompositeOperation = 'source-over';
  return c;
}
function outline(src, col, px) { // the subject-mask outline: the alpha shape grown by px, in one colour
  const c = ocv(src.width + px * 2, src.height + px * 2), x = c.getContext('2d');
  for (let a = 0; a < 16; a++) x.drawImage(src, px + Math.cos(a / 16 * Math.PI * 2) * px, px + Math.sin(a / 16 * Math.PI * 2) * px);
  x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
  return c;
}
function reflection(c) {
  const r = ocv(c.width, c.height * .5), x = r.getContext('2d');
  x.filter = 'blur(4px)';
  x.save(); x.translate(0, r.height); x.scale(1, -.5); x.drawImage(c, 0, 0); x.restore();
  x.filter = 'none';
  x.globalCompositeOperation = 'destination-in';
  const g = x.createLinearGradient(0, 0, 0, r.height); g.addColorStop(0, 'rgba(0,0,0,.42)'); g.addColorStop(.6, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, r.width, r.height);
  return r;
}
function buildLooks() {
  for (const l of LOOKS) { const c = grade(l.cut); G[l.k] = { c, r: reflection(c), ax: anchorX(c), raw: l.cut }; }
  // "you": the anime hero's shape as a dark figure with a soft mask rim, before any look is applied
  const s = grade(LK.anime.cut, true);
  G.you = { c: s, r: reflection(s), ax: anchorX(s), rim: outline(s, `rgba(${ACC_RGB},1)`, 7), rimPx: 7 };
  for (const l of LOOKS) { G[l.k].rim = outline(G[l.k].c, `rgba(${ACC_RGB},.9)`, 5); G[l.k].rimPx = 5; }
}

// ---------------------------------------------------------------- the alley + whoever stands in it
// cam: { z: zoom, fx, fy: view centre in footage (0..1) }. The character stands at (U,V) in footage space.
let NOW = 0;
const U = .5, V = VERT ? .95 : .96, CH_H = VERT ? .52 : .58;
function view(w, h, cam) {
  const s = Math.max(w / IW, h / IH) * (cam.z || 1);
  let ox = w / 2 - cam.fx * IW * s, oy = h / 2 - cam.fy * IH * s;
  ox = clamp(ox, w - IW * s, 0); oy = clamp(oy, h - IH * s, 0);
  return { s, ox, oy };
}
function drawAlley(x, w, h, t, cam, dim = 0) {
  const v = view(w, h, cam);
  x.drawImage(alleyAt(t), v.ox, v.oy, IW * v.s, IH * v.s);
  if (dim > 0) { x.fillStyle = `rgba(0,0,0,${dim})`; x.fillRect(0, 0, w, h); }
  return v;
}
// draws look k standing in the alley; clip = [y0, y1] canvas rows to keep (for the sweep)
function drawChar(x, v, k, o = {}) {
  const g = G[k]; if (!g) return null;
  const hh = CH_H * IH * v.s * (o.scale || 1), ww = hh * g.c.width / g.c.height;
  const fx = v.ox + (U + (o.du || 0)) * IW * v.s, fy = v.oy + V * IH * v.s;
  const left = fx - g.ax * ww, top = fy - hh;
  x.save();
  if (o.clip) { x.beginPath(); x.rect(-1e4, o.clip[0], 3e4, o.clip[1] - o.clip[0]); x.clip(); }
  x.globalAlpha = o.alpha ?? 1;
  // contact shadow, wet-ground reflection, then the figure
  const sg = x.createRadialGradient(fx, fy, 0, fx, fy, ww * .55);
  sg.addColorStop(0, 'rgba(0,0,0,.55)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  x.save(); x.translate(fx, fy); x.scale(1, .16); x.translate(-fx, -fy); x.fillStyle = sg; x.fillRect(fx - ww, fy - ww, ww * 2, ww * 2); x.restore();
  x.drawImage(g.r, left, fy, ww, hh * .5);
  if (o.rim) { const p = g.rimPx * hh / g.c.height; x.globalAlpha = (o.alpha ?? 1) * o.rim; x.drawImage(g.rim, left - p, top - p, ww + 2 * p, hh + 2 * p); x.globalAlpha = o.alpha ?? 1; }
  // a little life: breathing and a slow sway around the feet
  const sway = Math.sin(NOW * 1.7 + (o.du || 0) * 9) * .008, breathe = 1 + .007 * Math.sin(NOW * 2.4);
  x.translate(fx, fy); x.rotate(sway); x.scale(1 / Math.sqrt(breathe), breathe); x.translate(-fx, -fy);
  x.drawImage(g.c, left, top, ww, hh);
  x.restore();
  return { left, top, ww, hh, fx, fy };
}
// sweep from look a to look b: p = 0..1, the new look rises from the feet up through a bright scan line
function drawSwap(x, v, a, b, p, seed, o = {}) {
  if (p <= 0) return drawChar(x, v, a, o);
  if (p >= 1) return drawChar(x, v, b, o);
  const g = G[b], hh = CH_H * IH * v.s, fy = v.oy + V * IH * v.s;
  const ly = fy - oq(p) * hh * 1.06;
  drawChar(x, v, a, { ...o, clip: [-1e4, ly] });
  const r = drawChar(x, v, b, { ...o, clip: [ly, 1e4] });
  const cx = r.fx, half = r.ww * .75;
  x.save(); x.globalCompositeOperation = 'lighter';
  const env = Math.sin(Math.PI * p);
  let gr = x.createLinearGradient(0, ly - 60, 0, ly + 60);
  gr.addColorStop(0, `rgba(${ACC_RGB},0)`); gr.addColorStop(.5, `rgba(${ACC_RGB},${.55 * env})`); gr.addColorStop(1, `rgba(${ACC_RGB},0)`);
  const hg = x.createLinearGradient(cx - half, 0, cx + half, 0);
  x.fillStyle = gr; x.fillRect(cx - half, ly - 60, half * 2, 120);
  hg.addColorStop(0, 'rgba(255,255,255,0)'); hg.addColorStop(.5, `rgba(255,255,255,${.95 * env})`); hg.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = hg; x.fillRect(cx - half, ly - 2, half * 2, 4);
  for (let i = 0; i < 26; i++) { // sparks thrown off the line
    const u = rnd(seed + i * 3.1) * 2 - 1, life = (p * 2.2 + rnd(seed + i)) % 1, sz = 2 + 5 * rnd(seed + i * 7);
    x.fillStyle = `rgba(255,255,255,${(1 - life) * env})`;
    x.fillRect(cx + u * half * .8, ly - life * hh * .12 * (1 + rnd(i)), sz, sz);
  }
  x.restore();
  return r;
}

// ---------------------------------------------------------------- layers
const world = mk('div', 'fill', 'transform-origin:50% 50%');
const bgL = mk('div', 'fill', 'overflow:hidden', world);
const BG = {};
for (const k of ['12', '13', '20', '30', '40']) {
  const big = Math.max(W, H * 16 / 9) * 1.25;
  const i = mk('img', 'ac', `width:${big}px;height:${big * 9 / 16}px;left:${(W - big) / 2}px;top:${(H - big * 9 / 16) / 2}px;opacity:0;visibility:hidden`, bgL);
  loads.push(whenLoaded(i, `a/bg/bg-${k}.jpg`)); i.src = `a/bg/bg-${k}.jpg`;
  BG[k] = i;
}
const bgDim = mk('div', 'fill', 'background:radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 30%, rgba(0,0,0,.75) 100%)', bgL);
function bgSet(map) {
  for (const k in BG) {
    const v = map[k];
    if (!v) { op(BG[k], 0); continue; }
    const [o, s = 1.1, r = 0] = v;
    op(BG[k], o); tf(BG[k], `rotate(${r}deg) scale(${s})`);
  }
}
// one full-frame canvas for every shot set in the alley (S1, S3)
const sceneL = mk('div', 'fill', '', world);
const cvS = cv(W, H, sceneL), xS = cvS.getContext('2d');
const sceneVig = mk('div', 'fill', 'background:radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,.55) 100%)', sceneL);

// ======================================================================= S1: hook (0-8)
const s1 = mk('div', 'fill', 'perspective:1400px', world);
const FS1 = VERT ? 104 : 116;
const L1top = VERT ? H * .1 : H * .09;
function wordRow(words, top, fs, parent) {
  const row = mk('div', 'ab nowrap', `width:${W}px;text-align:center;top:${top}px;font-size:${fs}px;font-weight:700;line-height:1;letter-spacing:-.02em`, parent);
  return words.map(([b0, w]) => { const s = mk('span', 'chrome', 'display:inline-block;margin:0 .13em;transform-origin:50% 60%;filter:drop-shadow(0 8px 30px rgba(0,0,0,.6))', row, w); shineInit(s); EVENTS.slam.push(bt(b0)); return { b0, s, row }; });
}
const W1a = VERT
  ? [...wordRow([[1, 'KEEP'], [1.5, 'THE']], L1top, FS1, s1), ...wordRow([[2, 'SCENE.']], L1top + FS1 * 1.05, FS1, s1)]
  : wordRow([[1, 'KEEP'], [1.5, 'THE'], [2, 'SCENE.']], L1top, FS1, s1);
const W1b = VERT
  ? [...wordRow([[4.5, 'CHANGE']], L1top, FS1, s1), ...wordRow([[5, 'WHO IS'], [5.5, 'IN IT.']], L1top + FS1 * 1.05, FS1, s1)]
  : wordRow([[4.5, 'CHANGE'], [5, 'WHO IS'], [5.5, 'IN IT.']], L1top, FS1, s1);
// tracking box on the subject
const trk = mk('div', 'ab', `border:2px solid rgba(${ACC_RGB},.85);border-radius:6px`, s1);
const trkTag = mk('div', 'ab mono nowrap', `font-size:${VERT ? 22 : 18}px;color:#10160e;background:${ACC};padding:6px 10px;border-radius:4px;font-weight:700`, s1, 'SUBJECT · PERSON');
const lookTag = mk('div', 'ab nowrap', `font-size:${VERT ? 30 : 26}px;font-weight:700;color:#fff;display:flex;align-items:center;gap:12px;padding:10px 18px;border-radius:999px;background:rgba(8,9,11,.66);border:1px solid rgba(255,255,255,.2)`, s1);
// title card (6-8)
const t1 = mk('div', 'fill', '', s1);
const FSK = VERT ? 520 : 470;
const kanji = mk('div', 'ab kanji nowrap', `width:${W}px;text-align:center;top:${H / 2 - FSK * .62}px;font-size:${FSK}px;line-height:1;color:${ACC};text-shadow:0 0 60px rgba(${ACC_RGB},.45)`, t1, '幻');
const kName = mk('div', 'ab nowrap', `width:${W}px;text-align:center;top:${H / 2 + FSK * .44}px;font-size:${VERT ? 76 : 80}px;font-weight:700;letter-spacing:.32em;padding-left:.32em`, t1, 'MABOROSHI');
const kEb = mk('div', 'ab mono nowrap', `width:${W}px;text-align:center;top:${H / 2 - FSK * .62 - 70}px;font-size:${VERT ? 26 : 24}px;color:rgba(255,255,255,.7)`, t1, 'DEHUB CREATOR  ·  NEW');
EVENTS.slam.push(bt(6)); EVENTS.swap.push(bt(4));
function s1Update(b, t) {
  const on = b < 8.02;
  vis(s1, on); if (!on) return;
  const scene = b < 6;
  if (!scene) { op(trk, 0); op(trkTag, 0); op(lookTag, 0); }
  if (scene) {
    // slow push, the alley wakes from near-black
    const cam = { z: 1.06 + .05 * b / 6 + (b >= 4 ? .05 * Math.exp(-(b - 4) * 4) : 0), fx: .5, fy: .56 };
    const v = drawAlley(xS, W, H, t, cam, .55 * (1 - oc(P(b, 0, 1.2))) + .1);
    const rim = b < 4 ? .55 + .35 * Math.sin(b * Math.PI * 2) : 0;
    const r = drawSwap(xS, v, 'you', 'chrome', P(b, 4, 4.45), 4, { rim: b < 4 ? rim : 0 });
    // tracking box hugs the subject until the swap
    const bp = oc(P(b, .3, .9)) * (1 - P(b, 3.7, 4));
    trk.style.left = (r.left - 18) + 'px'; trk.style.top = (r.top - 18) + 'px';
    trk.style.width = (r.ww + 36) + 'px'; trk.style.height = (r.hh + 36) + 'px';
    op(trk, bp); tf(trk, `scale(${1 + .04 * (1 - bp)})`); trk.style.transformOrigin = '50% 50%';
    trkTag.style.left = (r.left - 18) + 'px'; trkTag.style.top = (r.top - 18 - (VERT ? 44 : 38)) + 'px'; op(trkTag, bp);
    const lp = ob(P(b, 4.4, 4.7), 2);
    lookTag.innerHTML = `<span style="width:12px;height:12px;border-radius:50%;background:${ACC};box-shadow:0 0 12px ${ACC}"></span>Liquid chrome`;
    lookTag.style.left = (r.fx - lookTag.offsetWidth / 2) + 'px'; lookTag.style.top = (r.fy + (VERT ? 40 : 20)) + 'px';
    op(lookTag, P(b, 4.4, 4.5) * (1 - P(b, 5.8, 6))); tf(lookTag, `scale(${.7 + .3 * lp})`); lookTag.style.transformOrigin = '50% 50%';
  }
  const slam = ({ b0, s }, out) => {
    const p = P(b, b0, b0 + .32);
    op(s, P(b, b0 - .02, b0 + .04) * (1 - out));
    tf(s, `translateY(${(1 - ox(p)) * -30}px) scale(${lerp(2.1, 1, ox(p))}) rotateX(${(1 - ox(p)) * 30}deg)`);
  };
  const outA = P(b, 3.8, 4.0);
  W1a.forEach(w => { slam(w, outA); shine(w.s, P(b, 2.6, 3.4)); });
  W1b.forEach(w => { slam(w, P(b, 5.85, 6)); shine(w.s, P(b, 5.3, 5.9)); });
  vis(t1, b >= 5.95);
  if (b >= 5.95) {
    xS.fillStyle = '#000';
    const kp = P(b, 6, 6.45);
    op(kanji, P(b, 5.98, 6.04));
    tf(kanji, `scale(${lerp(1.9, 1, ox(kp)) * (1 + .5 * ic(P(b, 7.6, 8)))})`); kanji.style.transformOrigin = '50% 55%';
    const np = P(b, 6.5, 6.9);
    kName.style.clipPath = `inset(0 ${100 - 100 * oq(np)}% 0 0)`; op(kName, np > 0 ? 1 - P(b, 7.6, 7.9) : 0);
    op(kEb, P(b, 6.8, 7.1) * (1 - P(b, 7.6, 7.9)));
    op(t1, 1 - P(b, 7.85, 8.02));
  }
}

// ======================================================================= S2: the studio (8-20)
// A replica of services/maboroshi/static (index.html + style.css), laid out at a fixed size.
const SW = VERT ? 1000 : 1560, SH = VERT ? 1790 : 920;
const LY = VERT
  ? { left: [44, 214, 912, 770], right: [44, 1006, 912, 750], vid: [28, 124, 856, 482], tiles: [3, 272, 220, 19] }
  : { left: [44, 214, 724, 662], right: [792, 214, 724, 662], vid: [28, 124, 668, 376], tiles: [3, 210, 170, 19] };
const s2 = mk('div', 'fill', 'perspective:2200px', world);
const st = mk('div', 'st', `width:${SW}px;height:${SH}px`, s2);
// header
mk('div', 'ab kanji', `left:44px;top:34px;font-size:58px;line-height:1;color:${ACC}`, st, '幻');
mk('div', 'ab eb', 'left:124px;top:42px', st, 'DEHUB CREATOR');
mk('div', 'ab', 'left:124px;top:60px;font-size:38px;font-weight:800;letter-spacing:-.05em', st, 'Maboroshi');
if (!VERT) mk('div', 'ab hint', `left:${SW - 344}px;top:46px;width:300px;text-align:right`, st, 'Keep the scene.<br>Change who is in it.');
// steps
const STEPS = ['Clip &amp; character', 'Prepare &amp; review', 'Preview &amp; export'].map((s, i) => {
  const cw = (SW - 88 - 24) / 3, el = mk('div', 'ab', `left:${44 + i * (cw + 12)}px;top:144px;width:${cw}px;height:48px;display:flex;align-items:flex-start;gap:10px;font-size:15px;color:#aeb4bf;border-bottom:2px solid transparent`, st);
  const n = mk('span', '', 'display:grid;place-items:center;width:28px;height:28px;border-radius:50%;border:1px solid #343942;font-size:13px;flex-shrink:0;margin-top:-5px', el, String(i + 1));
  mk('span', '', '', el, s);
  return { el, n };
});
mk('div', 'ab', `left:44px;top:193px;width:${SW - 88}px;height:1px;background:#343942`, st);
// left panel: the scene
const [lx, ly, lw, lh] = LY.left, [rx, ry, rw, rh] = LY.right, [vx, vy, vw, vh] = LY.vid;
const pL = mk('div', 'panel', `left:${lx}px;top:${ly}px;width:${lw}px;height:${lh}px`, st);
mk('div', 'ab eb', 'left:28px;top:28px', pL, 'THE SCENE');
mk('div', 'ab h2', 'left:28px;top:50px', pL, 'Start with your video');
mk('div', 'ab hint', 'left:28px;top:86px;white-space:nowrap', pL, 'Your motion, camera and soundtrack carry into the result.');
const vbox = mk('div', 'ab', `left:${vx}px;top:${vy}px;width:${vw}px;height:${vh}px;border-radius:12px;overflow:hidden;background:#0d0f12;border:1px dashed #515967`, pL);
const upl = mk('div', 'fill', 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#aeb4bf;font-size:16px', vbox, `${ico('Upload', 40, 1.6)}<div style="font-weight:700;color:#f2f3f5">Choose a video</div><div style="font-size:13px">2–30 seconds · up to 100 MB · include audio</div>`);
const cvV = cv(vw, vh, vbox), xV = cvV.getContext('2d');
const vChips = mk('div', 'ab', 'left:14px;top:14px;display:flex;gap:8px', vbox);
const chipCss = 'display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:7px;background:rgba(9,10,11,.72);border:1px solid rgba(255,255,255,.14);font-size:13px;font-weight:700;white-space:nowrap';
const chipMode = mk('div', '', chipCss, vChips, `${ico('Layers', 14, 2)}Depth + subject mask`);
const chipLook = mk('div', '', chipCss + `;color:${ACC}`, vChips, `${ico('Sparkles', 14, 2)}Plushie takeover`);
const vBar = mk('div', 'ab', `left:0;bottom:0;height:5px;width:0;background:${ACC};box-shadow:0 0 14px ${ACC}`, vbox);
const vPct = mk('div', 'ab mono', `right:14px;top:14px;left:auto;font-size:14px;padding:6px 10px;border-radius:7px;background:rgba(9,10,11,.72);color:${ACC}`, vbox, '0%');
const fileRow = mk('div', 'ab', `left:28px;top:${vy + vh + 16}px;display:flex;align-items:center;gap:10px;font-size:14px;color:#aeb4bf;white-space:nowrap`, pL, `${ico('Film', 16, 2)}<span style="color:#f2f3f5;font-weight:700">alley-walk.mov</span> · 6.0 s · 1080p · ${ico('Volume2', 16, 2)} audio`);
const subjY = vy + vh + 50;
mk('div', 'ab', `left:28px;top:${subjY}px;font-size:14px;font-weight:700`, pL, 'Who or what are you replacing?');
mk('div', 'inp', `left:28px;top:${subjY + 26}px;width:${VERT ? 420 : 300}px;height:48px`, pL, 'person');
const actW = VERT ? 380 : 340;
const act = mk('div', 'btn', `left:${lw - 28 - actW}px;top:${subjY + 26}px;width:${actW}px;height:48px`, pL);
const actTxt = mk('span', '', '', act, 'Save project');
const chk = mk('div', 'ab', `left:28px;top:${subjY + 92}px;display:flex;align-items:center;gap:10px;font-size:14px;white-space:nowrap`, pL);
const chkBox = mk('span', '', `width:20px;height:20px;border-radius:4px;border:1.5px solid #8b93a0;display:grid;place-items:center;color:#10160e`, chk);
mk('span', '', '', chk, 'I reviewed the whole prepared clip and its alignment is correct.');
// right panel: the character
const pR = mk('div', 'panel', `left:${rx}px;top:${ry}px;width:${rw}px;height:${rh}px`, st);
mk('div', 'ab eb', 'left:28px;top:28px', pR, 'THE CHARACTER');
mk('div', 'ab h2', 'left:28px;top:50px', pR, 'Choose the new look');
mk('div', 'ab hint', 'left:28px;top:86px;white-space:nowrap', pR, 'Use your own character image or video as the reference.');
mk('div', 'ab', 'left:28px;top:124px;font-size:16px;font-weight:700;display:flex;align-items:center;gap:8px', pR, `${ico('ChevronDown', 18, 2.4)}Choose a preset <span style="color:#aeb4bf;font-weight:400">180</span>`);
const srch = mk('div', 'inp', `left:28px;top:160px;width:${rw - 56}px;height:50px`, pR, ico('Search', 18, 2));
const srchTxt = mk('span', '', 'color:rgba(242,243,245,.45)', srch, 'Search plushie, anime, chrome…');
const srchCaret = mk('span', '', 'display:inline-block;width:2px;height:20px;background:#f2f3f5;margin-left:-8px', srch);
const pCount = mk('div', 'ab hint', `left:${rw - 28 - 200}px;top:124px;width:200px;text-align:right`, pR, '180 of 180 presets');
const [cols, tw, th, tg] = LY.tiles;
const TILES = LOOKS.map((l, i) => {
  const c = i % cols, r = Math.floor(i / cols);
  const e = mk('div', 'tile', `left:${28 + c * (tw + tg)}px;top:${228 + r * (th + tg + 14)}px;width:${tw}px;height:${th + 14}px`, pR);
  const im = mk('div', 'im', `height:${th - 30}px;background-image:url(${l.tile});border:2px solid transparent`, e);
  mk('div', 'nm', '', e, l.name);
  return { e, im };
});
const tilesEnd = 228 + 2 * (th + tg + 14);
const useRow = mk('div', 'ab', `left:28px;top:${tilesEnd + 4}px;display:flex;align-items:center;gap:14px`, pR);
const useBtn = mk('div', 'btn', 'position:relative;width:190px;height:44px', useRow, 'Use this preset');
const refChip = mk('div', '', 'display:flex;align-items:center;gap:10px;font-size:14px;color:#aeb4bf;white-space:nowrap', useRow);
const refThumb = mk('div', '', `width:44px;height:44px;border-radius:8px;background:url(${LK.plushie.tile}) 50% 25%/cover;border:1px solid #515967`, refChip);
mk('div', '', '', refChip, `<span style="color:#f2f3f5;font-weight:700">plushie-ref.png</span><br>Character reference`);
// cursor
const cursorSvg = sz => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24"><path d="M4.5 2.8 L19.6 13.1 L12.4 13.9 L16.4 21.2 L13.5 22.6 L9.6 15.3 L4.5 20.2 Z" fill="#fff" stroke="#000" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
const cur = mk('div', 'ab', 'transform-origin:4px 3px;filter:drop-shadow(0 6px 10px rgba(0,0,0,.5))', st, cursorSvg(VERT ? 54 : 44));
const clickRing = mk('div', 'ab', `width:60px;height:60px;margin:-30px 0 0 -30px;border-radius:50%;border:3px solid ${ACC};transform-origin:50% 50%`, st);
// timeline of the flow, in beats
const TYPE0 = 10.8, QUERY = 'plushie';
[...QUERY].forEach((_, i) => EVENTS.type.push(bt(TYPE0 + i * .14)));
const CLK = { search: 10.5, tile: 12.25, use: 12.9, prep: 13.95, tick: 15.35, approve: 15.75, gen: 16.6 };
Object.values(CLK).forEach(b => EVENTS.click.push(bt(b)));
EVENTS.pop.push(bt(9.45), bt(13.3));
// cursor targets in studio space
const abs = (panel, x, y) => [(panel === 'L' ? lx : rx) + x, (panel === 'L' ? ly : ry) + y];
const CUR = [
  [8.6, abs('L', vx + vw * .6, vy + vh * .85)], [9.6, abs('L', vx + vw * .62, vy + vh * .7)],
  [10.45, abs('R', 120, 185)], [11.9, abs('R', 140, 190)], [12.2, abs('R', 28 + tw * .5, 228 + th * .45)],
  [12.85, abs('R', 28 + 95, tilesEnd + 26)], [13.85, abs('L', lw - 28 - actW / 2, subjY + 50)], [15.3, abs('L', 38, subjY + 102)],
  [15.7, abs('L', lw - 28 - actW / 2, subjY + 50)], [16.55, abs('L', lw - 28 - actW / 2 + 10, subjY + 52)], [19.4, abs('L', lw - 28 - actW / 2 + 60, subjY + 90)],
];
function curAt(b) {
  if (b <= CUR[0][0]) return CUR[0][1];
  for (let i = 0; i < CUR.length - 1; i++) {
    const [b0, p0] = CUR[i], [b1, p1] = CUR[i + 1];
    if (b < b1) { const lead = Math.min(.45, b1 - b0), p = ioc(P(b, b1 - lead, b1)); return [lerp(p0[0], p1[0], p), lerp(p0[1], p1[1], p)]; }
  }
  return CUR[CUR.length - 1][1];
}
// camera over the studio: [beat, scale, focusX, focusY, rotX, rotY, dropY]
const FIT = Math.min(W / SW, H / SH) * (VERT ? .96 : .94);
const vidC = [lx + vx + vw / 2, ly + vy + vh / 2 + (VERT ? 40 : 30)];
const VZ = Math.min(W * .92 / vw, H * .7 / vh);
const CAM = [
  [8, FIT * .7, SW / 2, SH / 2, 38, -18, H * .6], [9.2, FIT, SW / 2, SH / 2, 0, 0, 0],
  [10.2, FIT, SW / 2, SH / 2, 0, 0, 0], [10.7, FIT * (VERT ? 1.25 : 1.12), rx + rw / 2, ry + rh / 2, 0, -3, 0], [13.2, FIT * (VERT ? 1.28 : 1.16), rx + rw / 2, ry + rh / 2 + 10, 0, -2, 0],
  [13.75, VZ, vidC[0], vidC[1], 0, 3, 0], [16.2, VZ * 1.04, vidC[0], vidC[1], 0, 1, 0], [19.3, VZ * 1.1, vidC[0], vidC[1] - 20, 0, 0, 0], [20, VZ * 3.2, lx + vx + vw / 2, ly + vy + vh / 2, 0, 0, 0],
];
function camAt(b) {
  if (b <= CAM[0][0]) return CAM[0];
  for (let i = 0; i < CAM.length - 1; i++) {
    const a = CAM[i], z = CAM[i + 1];
    if (b < z[0]) { const raw = (b - a[0]) / (z[0] - a[0]), p = i === 0 ? oq(raw) : i === CAM.length - 2 ? ic(raw) : ioc(raw); return a.map((v, j) => j ? lerp(v, z[j], p) : b); }
  }
  return CAM[CAM.length - 1];
}
// depth view of the alley for the "prepare" step (near = bright)
let DEPTH = null;
function buildDepth() {
  const w = 480, h = Math.round(480 * IH / IW), c = ocv(w, h), x = c.getContext('2d');
  x.filter = 'blur(3px)'; x.drawImage(ALLEY[0], 0, 0, w, h); x.filter = 'none';
  const d = x.getImageData(0, 0, w, h), px = d.data;
  const stops = [[0, [8, 4, 30]], [.3, [72, 12, 104]], [.55, [186, 54, 85]], [.78, [249, 142, 9]], [1, [252, 255, 164]]];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (j * w + i) * 4, lum = (px[k] * .3 + px[k + 1] * .59 + px[k + 2] * .11) / 255;
    const dx = (i / w - .52) * 1.3, dy = (j / h - .4);
    let z = clamp(Math.sqrt(dx * dx + dy * dy) * 1.5 + .08 * lum - .05);
    z = clamp(z * .6 + (j / h) * .2 + lum * .35);
    let s = 0; while (s < stops.length - 2 && z > stops[s + 1][0]) s++;
    const [z0, c0] = stops[s], [z1, c1] = stops[s + 1], f = clamp((z - z0) / (z1 - z0));
    px[k] = lerp(c0[0], c1[0], f); px[k + 1] = lerp(c0[1], c1[1], f); px[k + 2] = lerp(c0[2], c1[2], f);
  }
  x.putImageData(d, 0, 0);
  DEPTH = c;
}
function drawStudioVideo(b, t) {
  const has = b >= 9.4;
  op(upl, has ? 0 : 1); op(cvV, has ? oc(P(b, 9.4, 9.7)) : 0);
  vbox.style.borderStyle = has ? 'solid' : 'dashed';
  if (!has) return;
  const cam = { z: 1.08 + .02 * Math.sin(b * .4), fx: .5, fy: .55 };
  const v = drawAlley(xV, vw, vh, t, cam);
  // depth scan (prepare) sweeps top to bottom, then the subject mask fills in
  const scan = P(b, 14.05, 15.0), showDepth = b >= 14.05 && b < 16.55;
  if (showDepth && DEPTH) {
    const sy = vh * oq(scan);
    xV.save(); xV.beginPath(); xV.rect(0, 0, vw, sy); xV.clip(); xV.globalAlpha = .92;
    xV.drawImage(DEPTH, v.ox, v.oy, IW * v.s, IH * v.s); xV.restore();
    xV.fillStyle = '#fff'; xV.globalAlpha = scan > 0 && scan < 1 ? 1 : 0; xV.fillRect(0, sy - 1, vw, 3); xV.globalAlpha = 1;
  }
  const mask = P(b, 14.7, 15.1) * (b < 16.55 ? 1 : 0);
  const r = drawChar(xV, v, 'you', { rim: mask > 0 ? .9 * mask : .35 + .2 * Math.sin(b * Math.PI * 2) });
  if (mask > 0) {
    const g = G.you; xV.save(); xV.globalAlpha = .55 * mask; xV.globalCompositeOperation = 'source-over';
    const m = ocv(g.c.width, g.c.height), mx = m.getContext('2d'); mx.drawImage(g.c, 0, 0); mx.globalCompositeOperation = 'source-in'; mx.fillStyle = ACC; mx.fillRect(0, 0, m.width, m.height);
    xV.drawImage(m, r.left, r.top, r.ww, r.hh); xV.restore();
  }
  // generating: a shimmer of the plushie bleeds through the figure
  const gen = P(b, 16.7, 19.5);
  if (gen > 0) {
    const flick = .25 + .3 * gen * (.5 + .5 * Math.sin(b * Math.PI * 8));
    drawChar(xV, v, 'plushie', { alpha: flick * (b < 19.6 ? 1 : 0) });
    xV.save(); xV.globalCompositeOperation = 'lighter'; xV.globalAlpha = .18;
    for (let i = 0; i < 40; i++) { const yy = rnd(Math.floor(b * 16) + i) * vh; xV.fillStyle = `rgba(${ACC_RGB},${rnd(i + b)})`; xV.fillRect(r.left - 20, yy, r.ww + 40, 2); }
    xV.restore();
  }
}
function s2Update(b, t) {
  const on = b >= 7.9 && b < 20.05;
  vis(s2, on); if (!on) return;
  const [, s, fx, fy, rxx, ryy, dy] = camAt(b);
  tf(st, `translate(${W / 2}px,${H / 2 + dy}px) rotateX(${rxx}deg) rotateY(${ryy}deg) scale(${s}) translate(${-fx}px,${-fy}px)`);
  op(st, P(b, 7.9, 8.2));
  // steps
  const stepAt = b < 13.95 ? 0 : b < 16.6 ? 1 : 2;
  STEPS.forEach((x, i) => {
    const cur = i === stepAt, done = i < stepAt;
    x.el.style.color = cur ? ACC : done ? '#f2f3f5' : '#aeb4bf';
    x.el.style.borderBottomColor = cur ? ACC : 'transparent';
    x.n.style.borderColor = cur || done ? ACC : '#343942';
    x.n.style.background = done ? ACC : 'transparent'; x.n.style.color = done ? '#10160e' : '';
    x.n.innerHTML = done ? ico('Check', 15, 3) : String(i + 1);
  });
  drawStudioVideo(b, t);
  op(fileRow, P(b, 9.5, 9.8));
  op(vChips, b >= 14.0 ? 1 : 0);
  vis(chipMode, b >= 14.0 && b < 16.55); vis(chipLook, b >= 16.55);
  const gen = P(b, 16.7, 19.5);
  vBar.style.width = (100 * gen) + '%'; op(vBar, b >= 16.7 ? 1 : 0);
  op(vPct, b >= 16.7 ? 1 : 0); txt(vPct, Math.round(100 * oc(gen) * .99 + (gen >= 1 ? 1 : 0)) + '%');
  // search typing + filtering
  const n = [...QUERY].filter((_, i) => b >= TYPE0 + i * .14).length;
  const q = QUERY.slice(0, n);
  txt(srchTxt, q || 'Search plushie, anime, chrome…'); srchTxt.style.color = q ? '#f2f3f5' : 'rgba(242,243,245,.45)';
  op(srchCaret, b >= CLK.search && b < 12.2 && (n < QUERY.length || Math.floor(b * 2) % 2 === 0) ? 1 : 0);
  srch.style.borderColor = b >= CLK.search && b < 12.2 ? ACC : '#515967';
  const COUNT = [180, 152, 24, 2, 2, 2, 1, 1];
  txt(pCount, `${COUNT[n]} of 180 presets`);
  const filt = n >= 6;
  TILES.forEach((tl, i) => {
    const keep = i === 0, fp = oc(P(b, TYPE0 + .8, TYPE0 + 1.1));
    op(tl.e, filt && !keep ? 1 - .82 * fp : 1);
    const sel = keep && b >= CLK.tile;
    tl.im.style.borderColor = sel ? ACC : 'transparent';
    const pr = P(b, CLK.tile - .04, CLK.tile + .05) - P(b, CLK.tile + .1, CLK.tile + .3);
    tf(tl.e, `scale(${keep ? 1 - .05 * pr + .03 * oc(P(b, TYPE0 + .8, TYPE0 + 1.1)) * (1 - P(b, 12.4, 12.8)) : 1})`);
  });
  op(useRow, P(b, CLK.tile + .05, CLK.tile + .2));
  const up = P(b, CLK.use - .04, CLK.use + .05) - P(b, CLK.use + .1, CLK.use + .3);
  tf(useBtn, `scale(${1 - .08 * up})`);
  op(refChip, P(b, 13.3, 13.45)); tf(refChip, `translateX(${(1 - oc(P(b, 13.3, 13.6))) * 30}px)`);
  // primary action
  let label = 'Save project', live = b >= 9.6;
  if (b >= 13.5) label = 'Prepare clip';
  if (b >= 15.5) label = 'Approve clip';
  if (b >= 16.1) label = 'Generate preview';
  if (b >= 16.65) label = 'Generating preview…';
  txt(actTxt, label);
  act.style.background = live ? ACC : '#3a4049'; act.style.color = live ? '#10160e' : '#8b93a0';
  const pressAt = [CLK.prep, CLK.approve, CLK.gen].find(c => b >= c - .05 && b < c + .35);
  const pp = pressAt ? P(b, pressAt - .04, pressAt + .05) - P(b, pressAt + .1, pressAt + .3) : 0;
  tf(act, `scale(${1 - .08 * pp})`);
  op(chk, P(b, 15.0, 15.2) * (1 - P(b, 16.5, 16.7)));
  chkBox.innerHTML = b >= CLK.tick ? ico('Check', 15, 3.2) : '';
  chkBox.style.background = b >= CLK.tick ? ACC : 'transparent'; chkBox.style.borderColor = b >= CLK.tick ? ACC : '#8b93a0';
  // cursor + click ring
  const [cx, cy] = curAt(b);
  cur.style.left = cx + 'px'; cur.style.top = cy + 'px';
  const lastClick = Object.values(CLK).filter(c => c <= b).pop();
  const press = lastClick != null ? P(b, lastClick - .04, lastClick + .02) - P(b, lastClick + .06, lastClick + .25) : 0;
  tf(cur, `scale(${(1 - .16 * press) / Math.max(.9, s / FIT) * (VERT ? 1 : 1)})`);
  op(cur, P(b, 8.6, 8.9) * (1 - P(b, 19.4, 19.7)));
  if (lastClick != null) {
    const rp = P(b, lastClick, lastClick + .45);
    clickRing.style.left = cx + 'px'; clickRing.style.top = cy + 'px';
    tf(clickRing, `scale(${.3 + 1.2 * oc(rp)})`); op(clickRing, (1 - rp) * (rp > 0 ? .9 : 0));
  } else op(clickRing, 0);
}

// ======================================================================= S3: the swap montage (20-28)
// one look per beat (each rising through the scan line), then hard cuts, then all six at once
const SEQ = [[20, 'you', 'plushie'], [21, 'plushie', 'anime'], [22, 'anime', 'chrome'], [23, 'chrome', 'crochet'], [24, 'crochet', 'crystal'], [25, 'crystal', 'clay']];
const CUTS = [[26, 'plushie'], [26.5, 'chrome'], [27, 'crystal'], [27.25, 'anime']];
const GRID_B = 27.5;
SEQ.forEach(([b0]) => EVENTS.swap.push(bt(b0)));
CUTS.forEach(([b0]) => EVENTS.cut.push(bt(b0)));
const s3 = mk('div', 'fill', '', world);
const LBLX = VERT ? 64 : 96, LBLY = VERT ? H - 470 : H - 250;
const s3grad = mk('div', 'fill', 'background:linear-gradient(0deg, rgba(0,0,0,.78) 0%, rgba(0,0,0,0) 42%)', s3);
const lblNum = mk('div', 'ab mono nowrap', `left:${LBLX}px;top:${LBLY}px;font-size:${VERT ? 26 : 22}px;color:${ACC}`, s3);
const lblName = mk('div', 'ab nowrap chrome', `left:${LBLX - 4}px;top:${LBLY + (VERT ? 40 : 34)}px;font-size:${VERT ? 104 : 112}px;font-weight:700;line-height:1;letter-spacing:-.02em`, s3);
shineInit(lblName);
const lblSub = mk('div', 'ab mono nowrap', `left:${LBLX}px;top:${LBLY + (VERT ? 166 : 162)}px;font-size:${VERT ? 22 : 20}px;color:rgba(255,255,255,.62)`, s3, 'same scene · same moves · same soundtrack');
function s3Update(b, t) {
  const on = b >= 20 && b < 28.05;
  vis(s3, on); if (!on) return;
  const k = Math.floor((b - 20) / 6 * 4);
  let curLook = null;
  if (b < GRID_B) {
    const drift = b - 20;
    const punch = .05 * Math.exp(-((b - Math.floor(b)) * 6)) * (b < 26 ? 1 : 0);
    const cam = { z: 1.1 + .015 * drift + punch, fx: .5 + .015 * Math.sin(drift * .6), fy: .56 };
    const v = drawAlley(xS, W, H, t, cam);
    if (b < 26) {
      const i = Math.min(SEQ.length - 1, Math.floor(b - 20));
      const [b0, a, z] = SEQ[i];
      drawSwap(xS, v, a, z, P(b, b0, b0 + .42), i * 13);
      curLook = z;
    } else {
      let j = 0; for (let i = 0; i < CUTS.length; i++) if (b >= CUTS[i][0]) j = i;
      const [b0, lk] = CUTS[j];
      const cz = { z: [1.5, 1.25, 1.65, 1.35][j], fx: .5 + [-.04, .03, .02, -.02][j], fy: [.62, .55, .5, .6][j] };
      const v2 = drawAlley(xS, W, H, t, cz);
      drawChar(xS, v2, lk);
      curLook = lk;
    }
  } else {
    // all six, staggered on 16ths
    xS.fillStyle = '#000'; xS.fillRect(0, 0, W, H);
    const gc = VERT ? 2 : 3, gr = VERT ? 3 : 2, cw = W / gc, chh = H / gr;
    LOOKS.forEach((l, i) => {
      const c = i % gc, r = Math.floor(i / gc), b0 = GRID_B + i * .0625;
      if (b < b0) return;
      const p = oc(P(b, b0, b0 + .2));
      xS.save(); xS.beginPath(); xS.rect(c * cw + 3, r * chh + 3, cw - 6, chh - 6); xS.clip();
      xS.translate(c * cw, r * chh);
      const z = 1 + .2 * (1 - p);
      xS.translate(cw / 2, chh / 2); xS.scale(z, z); xS.translate(-cw / 2, -chh / 2);
      const v = drawAlley(xS, cw, chh, t + i * .3, { z: 1.0, fx: .5, fy: .6 });
      drawChar(xS, v, l.k, { scale: VERT ? 1.25 : 1.0 });
      xS.restore();
    });
  }
  // label
  const L = curLook && LK[curLook];
  const showL = L && b < GRID_B;
  op(s3grad, showL ? 1 : 0);
  if (showL) {
    txt(lblNum, `LOOK ${String(L.n).padStart(3, '0')} / 180  ·  ${L.cat.toUpperCase()}`);
    txt(lblName, L.name.toUpperCase());
    const b0 = b < 26 ? Math.floor(b) : CUTS.filter(c => b >= c[0]).pop()[0];
    const p = P(b, b0 + (b < 26 ? .2 : 0), b0 + (b < 26 ? .45 : .2));
    lblName.style.clipPath = `inset(0 ${100 - 100 * oq(p)}% 0 0)`;
    op(lblName, 1); op(lblNum, P(b, b0, b0 + .1)); op(lblSub, b < 26 ? 1 : 0);
    shine(lblName, P(b, b0 + .45, b0 + .95));
  } else { op(lblName, 0); op(lblNum, 0); op(lblSub, 0); }
  }

// ======================================================================= S4: kinetic type + look barrage (28-40)
const s4 = mk('div', 'fill', 'perspective:1600px', world);
const s4a = mk('div', 'fill', '', s4);
const FS4 = VERT ? 150 : 250;
const L4 = [mk('div', 'ab nowrap', `width:${W}px;text-align:center;font-size:${FS4}px;font-weight:700;line-height:1;letter-spacing:-.025em;top:${H / 2 - FS4 * .98}px`, s4a), mk('div', 'ab nowrap', `width:${W}px;text-align:center;font-size:${FS4}px;font-weight:700;line-height:1;letter-spacing:-.025em;top:${H / 2 + FS4 * .02}px`, s4a)];
const WORDS4 = [[28, 'SAME', 0], [28.5, 'MOVES.', 0], [30, 'NEW', 1], [30.5, 'YOU.', 1]].map(([b0, w, li]) => {
  const s = mk('span', 'chrome', 'display:inline-block;margin:0 .14em;transform-origin:50% 60%', L4[li], w);
  EVENTS.slam.push(bt(b0)); shineInit(s);
  return { b0, s };
});
const s4b = mk('div', 'fill', '', s4);
// sixteen real presets from services/maboroshi/static/presets.js, one per half beat
const FEAT = [
  ['Phoenix knight', 'Mythic', 10], ['Vinyl DJ', 'Street culture', 23], ['Corduroy bear', 'Soft toys', 28], ['Pearl exosuit', 'Future fashion', 41],
  ['Moss character', 'Nature', 46], ['Stained-glass figure', 'Graphic worlds', 58], ['Neon parade', 'Celebration', 71], ['Tiny robot', 'Social favorites', 81],
  ['Gothic velvet', 'Fashion', 87], ['Moon wizard', 'Fantasy', 94], ['Cyberpunk courier', 'Science fiction', 101], ['Capybara friend', 'Animals & mascots', 117],
  ['Origami figure', 'Handmade', 121], ['Ink manga', 'Illustration', 129], ['Disco star', 'Retro', 136], ['Faceted gemstone', 'Materials', 170],
];
const FS4B = VERT ? 132 : 190;
const featIdx = mk('div', 'ab nowrap', `width:${W}px;text-align:center;top:${H / 2 - (VERT ? 330 : 360)}px;font-size:${VERT ? 500 : 600}px;font-weight:700;line-height:1;color:transparent;-webkit-text-stroke:2px rgba(255,255,255,.09)`, s4b, '001');
const FEL = FEAT.map(([w, d], i) => {
  const box = mk('div', 'ab', `width:${W}px;top:${H / 2 - FS4B * .62}px;text-align:center;transform-origin:50% 50%`, s4b);
  const word = mk('div', 'nowrap', `display:inline-block;font-size:${FS4B}px;font-weight:700;line-height:1;letter-spacing:-.02em;color:#fff`, box, w.toUpperCase());
  const desc = mk('div', 'mono', `font-size:26px;margin-top:${VERT ? 26 : 30}px;color:rgba(${ACC_RGB},.85)`, box, d);
  return { box, word, desc, b0: 32 + .5 * i, fit: 1 };
});
const featTop = mk('div', 'ab mono nowrap', `top:${VERT ? 300 : 120}px;width:${W}px;text-align:center;font-size:${VERT ? 26 : 22}px;color:rgba(255,255,255,.7)`, s4b, '180 looks · 20 categories');
const segs = mk('div', 'ab', `top:${H - (VERT ? 330 : 140)}px;left:${(W - (VERT ? 760 : 900)) / 2}px;width:${VERT ? 760 : 900}px;height:6px;display:flex;gap:6px`, s4b);
const SEG = FEAT.map(() => mk('div', '', 'flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,.14)', segs));
const segNum = mk('div', 'ab mono', `top:${H - (VERT ? 300 : 112)}px;width:${W}px;text-align:center;font-size:20px;color:rgba(255,255,255,.55)`, s4b, '');
FEL.forEach(f => EVENTS.tick.push(bt(f.b0)));
function s4Update(b) {
  const on = b >= 28.0 && b < 40.35;
  vis(s4, on); if (!on) return;
  vis(s4a, b < 32.2);
  WORDS4.forEach(({ b0, s }) => {
    const p = P(b, b0, b0 + .32);
    op(s, P(b, b0 - .02, b0 + .04));
    tf(s, `translateY(${(1 - ox(p)) * -30}px) scale(${lerp(2.1, 1, ox(p))}) rotateX(${(1 - ox(p)) * 30}deg)`);
  });
  const sp = ic(P(b, 31.55, 32.05));
  tf(L4[0], `translateX(${-sp * W * 1.3}px) skewX(${sp * 20}deg)`);
  tf(L4[1], `translateX(${sp * W * 1.3}px) skewX(${-sp * 20}deg)`);
  WORDS4.forEach(({ s }, i) => shine(s, P(b, 30.75 + i * .12, 31.35 + i * .12)));
  vis(s4b, b >= 31.8);
  if (b < 31.8) return;
  let cur = -1;
  FEL.forEach((f, i) => {
    const pin = P(b, f.b0, f.b0 + .22), pout = P(b, f.b0 + .5, f.b0 + .72);
    const live = b >= f.b0 - .02 && pout < 1;
    vis(f.box, live);
    if (!live) return;
    if (b >= f.b0) cur = i;
    const s = lerp(.5, 1, ox(pin)) * lerp(1, 2.6, ic(pout)) * f.fit;
    tf(f.box, `scale(${s}) translateY(${(1 - ox(pin)) * 40}px)`);
    op(f.box, Math.min(P(b, f.b0 - .02, f.b0 + .05), 1 - pout));
    op(f.desc, P(b, f.b0 + .06, f.b0 + .16) * (1 - P(b, f.b0 + .45, f.b0 + .55)));
  });
  if (b >= 39.9) cur = 15;
  cur = Math.max(0, cur);
  // the counter races through the catalog: lands on each preset's own number
  const n0 = cur ? FEAT[cur - 1][2] : 1, n1 = FEAT[cur][2], cp = oc(P(b, 32 + .5 * cur, 32 + .5 * cur + .3));
  const num = b >= 39.75 ? Math.round(lerp(FEAT[15][2], 180, oc(P(b, 39.75, 40.2)))) : Math.round(lerp(n0, n1, cp));
  txt(featIdx, String(num).padStart(3, '0'));
  tf(featIdx, `scale(${lerp(1.12, 1, cp)})`);
  op(featIdx, P(b, 32, 32.2));
  SEG.forEach((s, i) => { s.style.background = i <= cur && b >= 32 ? ACC : 'rgba(255,255,255,.14)'; });
  txt(segNum, `${String(num).padStart(3, '0')} / 180`);
  op(featTop, P(b, 32, 32.3)); op(segs, P(b, 32, 32.2)); op(segNum, P(b, 32, 32.2));
  const wp = ic(P(b, 39.75, 40.3));
  tf(s4b, `translateX(${-wp * W}px)`);
}

// ======================================================================= S5: the promises (40-52)
const s5 = mk('div', 'fill', '', world);
const FS5 = VERT ? 96 : 104;
const s5x = VERT ? 64 : 110, s5y = VERT ? 250 : 210;
function headline(lines, sub, parent) {
  const els = lines.map((l, i) => { const e = mk('div', 'ab nowrap chrome', `left:${s5x}px;top:${s5y + i * FS5 * 1.04}px;font-size:${FS5}px;font-weight:700;line-height:1;letter-spacing:-.02em`, parent, l); shineInit(e); return e; });
  const m = mk('div', 'ab mono nowrap', `left:${s5x + 4}px;top:${s5y + lines.length * FS5 * 1.04 + 26}px;font-size:${VERT ? 23 : 22}px;color:rgba(255,255,255,.7)`, parent, sub);
  return { els, m };
}
function hlUpdate(h, b, b0, b1) {
  h.els.forEach((e, i) => {
    const p = P(b, b0 + i * .25, b0 + i * .25 + .35);
    e.style.clipPath = `inset(0 ${100 - 100 * oq(p)}% 0 0)`; op(e, p > 0 ? 1 - P(b, b1 - .2, b1) : 0);
    shine(e, P(b, b0 + 1 + i * .15, b0 + 1.7 + i * .15));
  });
  op(h.m, P(b, b0 + .6, b0 + .9) * (1 - P(b, b1 - .2, b1)));
}
// 5a: soundtrack
const s5a = mk('div', 'fill', '', s5);
const H5a = headline(['YOUR SOUNDTRACK', 'STAYS YOURS.'], 'complete original audio · restored after rendering', s5a);
[40, 40.25].forEach(b => EVENTS.slam.push(bt(b)));
const WV = VERT ? { x: 64, y: 900, w: W - 128, h: 520 } : { x: 110, y: 640, w: W - 220, h: 280 };
const cvW = cv(WV.w, WV.h, s5a, `left:${WV.x}px;top:${WV.y}px`), xW = cvW.getContext('2d');
const wvLbl = mk('div', 'ab mono nowrap', `left:${WV.x}px;top:${WV.y - 46}px;font-size:20px;color:rgba(255,255,255,.55);display:flex;gap:12px;align-items:center`, s5a, `${ico('Volume2', 20, 2)} alley-walk.mov · original audio`);
// 5b: review before paying
const s5b = mk('div', 'fill', '', s5);
const H5b = headline(['REVIEW IT', 'BEFORE YOU PAY.'], 'every paid step asks first · saving is free', s5b);
[44, 44.25].forEach(b => EVENTS.slam.push(bt(b)));
const CHIPS5 = [['Prepare', 'Wand2'], ['Review', 'ScanFace'], ['Preview', 'Play'], ['1080p', 'Download']];
const chipRow = mk('div', 'ab', VERT ? `left:64px;top:860px;width:${W - 128}px;display:grid;grid-template-columns:1fr 1fr;gap:22px` : `left:110px;top:680px;display:flex;gap:26px`, s5b);
const CH5 = CHIPS5.map(([l, ic_], i) => {
  const e = mk('div', '', `display:flex;align-items:center;gap:16px;padding:${VERT ? '30px 28px' : '24px 30px'};border-radius:20px;background:rgba(18,20,25,.86);border:1.5px solid #343942;font-size:${VERT ? 40 : 38}px;font-weight:700;white-space:nowrap;transform-origin:50% 50%`, chipRow);
  const n = mk('span', '', `display:grid;place-items:center;width:${VERT ? 58 : 52}px;height:${VERT ? 58 : 52}px;border-radius:50%;border:1.5px solid #515967;color:#aeb4bf`, e, ico(ic_, VERT ? 28 : 24, 2));
  mk('span', '', '', e, l);
  EVENTS.tick.push(bt(45 + i * .5));
  return { e, n, b0: 45 + i * .5, ic_ };
});
// 5c: web + app
const s5c = mk('div', 'fill', '', s5);
const H5c = headline(['WEB. APP.', 'SAME PROJECT.'], 'saved to your DeHub account · continue anywhere', s5c);
[48, 48.25].forEach(b => EVENTS.slam.push(bt(b)));
EVENTS.whoosh.push(bt(48.6));
const PHN = VERT ? { w: 560, h: 1120, x: W / 2 - 280, y: 690 } : { w: 430, h: 860, x: W - 110 - 430 - 40, y: (H - 860) / 2 };
const phone = mk('div', 'ab', `left:${PHN.x}px;top:${PHN.y}px;width:${PHN.w}px;height:${PHN.h}px;border-radius:${PHN.w * .14}px;background:#000;border:2px solid rgba(255,255,255,.28);box-shadow:0 40px 100px rgba(0,0,0,.7), inset 0 0 0 8px #0b0c0e;overflow:hidden;transform-origin:50% 50%`, s5c);
const cvP = cv(PHN.w - 16, PHN.h - 16, phone, 'left:8px;top:8px;border-radius:' + (PHN.w * .12) + 'px'), xP = cvP.getContext('2d');
mk('div', 'ab', `left:${PHN.w / 2 - 50}px;top:22px;width:100px;height:28px;border-radius:14px;background:#000`, phone);
const phCap = mk('div', 'ab', `left:28px;bottom:${PHN.h * .08}px;top:auto;width:${PHN.w - 56}px;font-size:${PHN.w * .05}px;line-height:1.35;text-shadow:0 2px 8px rgba(0,0,0,.8)`, phone, `<b>Liquid chrome</b> · Maboroshi<div style="display:flex;gap:18px;margin-top:12px;opacity:.9">${ico('Heart', 26, 2)}${ico('MessageCircle', 26, 2)}${ico('Share2', 26, 2)}</div>`);
const laptopTag = mk('div', 'ab mono nowrap', `left:${s5x + 4}px;top:${s5y + 2 * FS5 * 1.04 + 90}px;font-size:${VERT ? 22 : 20}px;color:${ACC};display:flex;gap:14px;align-items:center`, s5c, `${ico('Monitor', 24, 2)} dehub.io/creator/maboroshi  ${ico('Smartphone', 24, 2)} DeHub app`);
function s5Update(b, t) {
  const on = b >= 40.3 && b < 52.05;
  vis(s5, on); if (!on) return;
  tf(s5, `translateX(${(1 - oc(P(b, 40.3, 40.6))) * W * .3}px)`);
  // a
  vis(s5a, b < 44.05);
  if (b < 44.05) {
    hlUpdate(H5a, b, 40, 44.05);
    op(wvLbl, P(b, 40.6, 40.9) * (1 - P(b, 43.85, 44.05)));
    xW.clearRect(0, 0, WV.w, WV.h);
    const N = VERT ? 70 : 120, bw = WV.w / N, head = P(b, 40.8, 43.8);
    for (let i = 0; i < N; i++) {
      const env = .25 + .75 * Math.abs(Math.sin(i * .37) * Math.cos(i * .11 + 1)) * (.6 + .4 * rnd(i));
      const grow = oc(P(b, 40.5 + i / N * .8, 40.8 + i / N * .8)) * (1 - P(b, 43.85, 44.05));
      const hh = env * WV.h * .9 * grow, played = i / N < head;
      xW.fillStyle = played ? ACC : 'rgba(255,255,255,.28)';
      const r = Math.min(bw * .3, 4);
      xW.beginPath(); xW.roundRect(i * bw + bw * .2, (WV.h - hh) / 2, bw * .6, hh, r); xW.fill();
    }
    xW.fillStyle = '#fff'; xW.fillRect(head * WV.w - 1, 0, 3, WV.h * (b > 40.8 && b < 43.85 ? 1 : 0));
  }
  // b
  vis(s5b, b >= 43.95 && b < 48.05);
  if (b >= 43.95 && b < 48.05) {
    hlUpdate(H5b, b, 44, 48.05);
    CH5.forEach(({ e, n, b0 }, i) => {
      const pin = ob(P(b, 44.4 + i * .12, 44.75 + i * .12), 1.8), lit = b >= b0;
      op(e, P(b, 44.4 + i * .12, 44.5 + i * .12) * (1 - P(b, 47.85, 48.05)));
      tf(e, `translateY(${(1 - pin) * 40}px) scale(${lit ? 1 + .06 * (1 - P(b, b0, b0 + .3)) : 1})`);
      e.style.borderColor = lit ? ACC : '#343942';
      n.style.background = lit ? ACC : 'transparent'; n.style.color = lit ? '#10160e' : '#aeb4bf'; n.style.borderColor = lit ? ACC : '#515967';
      if (lit && !e._lit) { n.innerHTML = ico('Check', VERT ? 30 : 26, 3); e._lit = true; }
      if (!lit && e._lit) { n.innerHTML = ico(CHIPS5[i][1], VERT ? 28 : 24, 2); e._lit = false; }
    });
  }
  // c
  vis(s5c, b >= 47.95);
  if (b >= 47.95) {
    hlUpdate(H5c, b, 48, 52.1);
    op(laptopTag, P(b, 48.9, 49.2));
    const pp = oc(P(b, 48.5, 49.1));
    tf(phone, `translateY(${(1 - pp) * H * .5}px) rotate(${(1 - pp) * 8 + Math.sin(t * .9) * .8}deg)`);
    const pw = PHN.w - 16, ph = PHN.h - 16;
    const v = drawAlley(xP, pw, ph, t, { z: 1, fx: .5, fy: .6 });
    const lk = ['chrome', 'plushie', 'crystal'][Math.min(2, Math.floor(P(b, 49.5, 52) * 3))];
    const swp = [49.5, 50.5, 51.25].map(x => P(b, x, x + .35));
    if (b < 50.5) drawSwap(xP, v, 'you', 'chrome', swp[0], 2);
    else if (b < 51.25) drawSwap(xP, v, 'chrome', 'plushie', swp[1], 3);
    else drawSwap(xP, v, 'plushie', 'crystal', swp[2], 5);
    phCap.querySelector('b').textContent = b < 50.5 ? 'Liquid chrome' : b < 51.25 ? 'Plushie takeover' : 'Crystal guardian';
    void lk;
  }
}
[49.5, 50.5, 51.25].forEach(b => EVENTS.swap.push(bt(b)));

// ======================================================================= S6: brand slam (52-60)
const s6 = mk('div', 'fill', 'perspective:1400px', world);
const FS6 = VERT ? 420 : 400;
const k6 = mk('div', 'ab kanji nowrap', `width:${W}px;text-align:center;top:${H / 2 - FS6 * (VERT ? .95 : .82)}px;font-size:${FS6}px;line-height:1;color:${ACC};text-shadow:0 0 70px rgba(${ACC_RGB},.5);transform-origin:50% 60%`, s6, '幻');
const n6 = mk('div', 'ab nowrap chrome', `width:${W}px;text-align:center;top:${H / 2 + FS6 * (VERT ? .1 : .22)}px;font-size:${VERT ? 128 : 150}px;font-weight:700;line-height:1;letter-spacing:.06em;padding-left:.06em`, s6, 'MABOROSHI');
shineInit(n6);
const tag6 = mk('div', 'ab nowrap', `width:${W}px;text-align:center;top:${H / 2 + FS6 * (VERT ? .1 : .22) + (VERT ? 170 : 190)}px;font-size:${VERT ? 44 : 52}px;font-weight:700;letter-spacing:-.01em`, s6, 'Your scene. A different you.');
const badge6 = mk('div', 'ab nowrap mono', `top:${H / 2 + FS6 * (VERT ? .1 : .22) + (VERT ? 270 : 290)}px;display:flex;align-items:center;gap:14px;padding:14px 26px;border-radius:999px;border:1.5px solid rgba(255,255,255,.35);background:rgba(0,0,0,.4);font-size:24px;color:rgba(255,255,255,.9)`, s6);
const b6dot = mk('span', '', `display:inline-block;width:12px;height:12px;border-radius:50%;background:${ACC};box-shadow:0 0 14px ${ACC}`, badge6);
mk('span', '', '', badge6, 'in DeHub Creator · web + app');
[52, 52.5, 53, 53.5].forEach(b => EVENTS.slam.push(bt(b)));
// two looks flank the title
const FL = (VERT ? [['plushie', .17, .99, 400], ['chrome', .83, .99, 440]] : [['plushie', .1, .95, 560], ['chrome', .9, .95, 600]]).map(([k, x, y, h], i) => {
  const e = mk('img', 'ab', `height:${h}px;transform-origin:50% 100%;filter:drop-shadow(0 30px 40px rgba(0,0,0,.7))`, s6);
  loads.push(whenLoaded(e, `a/looks/${k}.png`)); e.src = `a/looks/${k}.png`;
  return { e, x, y, h, i, k };
});
const SPARK = [['sparkle', -.3, -.34, 120], ['star', .32, -.32, 100], ['sparkles-duo', .3, .32, 120]].map(([n, x, y, s], i) => {
  const e = mk('img', 'ab', `width:${s}px;transform-origin:50% 50%;filter:drop-shadow(0 20px 30px rgba(0,0,0,.6))`, s6);
  loads.push(whenLoaded(e, ICON3D[n])); e.src = ICON3D[n];
  return { e, x, y, s, i };
});
function s6Update(b) {
  const on = b >= 51.95 && b < 60.15;
  vis(s6, on); if (!on) return;
  const t = bt(b), push = 1 + .05 * ioc(P(b, 54, 60));
  const kp = P(b, 52, 52.35);
  op(k6, P(b, 51.98, 52.04)); tf(k6, `scale(${lerp(2.2, 1, ox(kp)) * push}) rotateX(${(1 - ox(kp)) * -40}deg)`);
  const np = P(b, 52.5, 52.85);
  n6.style.clipPath = `inset(0 ${50 - 50 * oq(np)}% 0 ${50 - 50 * oq(np)}%)`; op(n6, np > 0 ? 1 : 0); tf(n6, `scale(${push})`); n6.style.transformOrigin = '50% 50%';
  shine(n6, P(b, 54.2, 55.2) || P(b, 57.6, 58.6));
  const tp = P(b, 53, 53.3);
  tag6.style.clipPath = `inset(0 ${100 - 100 * oq(tp)}% 0 0)`; op(tag6, tp > 0 ? 1 : 0); tf(tag6, `scale(${push})`); tag6.style.transformOrigin = '50% 50%';
  const bp = ob(P(b, 53.5, 53.8), 2);
  badge6.style.left = (W / 2 - badge6.offsetWidth / 2) + 'px';
  tf(badge6, `scale(${.6 + .4 * bp})`); op(badge6, P(b, 53.5, 53.6)); badge6.style.transformOrigin = '50% 50%';
  op(b6dot, .35 + .65 * (.5 + .5 * Math.cos(b * Math.PI)));
  FL.forEach(({ e, x, y, h, i }) => {
    const p = ob(P(b, 54 + i * .5, 54.45 + i * .5), 1.6);
    const ww = e.naturalWidth * h / e.naturalHeight;
    e.style.left = (W * x - ww / 2) + 'px'; e.style.top = (H * y - h) + 'px';
    tf(e, `translateY(${(1 - p) * 200}px) scale(${.6 + .4 * p}) rotate(${Math.sin(t * 1.4 + i * 2) * 2}deg)`);
    op(e, P(b, 54 + i * .5, 54.1 + i * .5));
  });
  SPARK.forEach(({ e, x, y, s, i }) => {
    const p = ob(P(b, 54.25 + i * .25, 54.65 + i * .25), 2);
    e.style.left = (W / 2 + x * (VERT ? W * 1.5 : W) - s / 2) + 'px';
    e.style.top = (H / 2 + y * (VERT ? H * .6 : H) - s / 2 + Math.sin(t * 1.6 + i) * 14) + 'px';
    tf(e, `rotate(${Math.sin(t * .8 + i * 2) * 18 + (1 - p) * 90}deg) scale(${p})`);
    op(e, P(b, 54.25 + i * .25, 54.35 + i * .25));
  });
  tf(s6, `scale(${1 + .4 * ic(P(b, 59.7, 60.15))})`);
}

// ======================================================================= S7: end card (same ending as editor downloads)
const s7 = mk('div', 'fill', 'background:#000', world);
const cvEnd = cv(W, H, s7);
const endLine = mk('div', 'ab mono nowrap', `width:${W}px;text-align:center;font-size:${VERT ? 24 : 22}px;color:rgba(255,255,255,.55)`, s7, 'Maboroshi · in DeHub Creator');
function drawOutro(ctx, width, height, time, label) {
  const t = Math.max(0, Math.min(2.2, time));
  const phase = (start, length) => 1 - Math.pow(1 - Math.max(0, Math.min(1, (t - start) / length)), 3);
  const unit = Math.min(width, height);
  const icon = MARK;
  const logoWidth = unit * .155, logoHeight = logoWidth * 1184 / 908, gap = unit * .042;
  const progress = Math.max(0, Math.min(1, (t - .08) / .98));
  const spin = (1 - Math.cos(progress * Math.PI)) / 2, angle = (1 - spin) * Math.PI * 2, wave = Math.sin(progress * Math.PI);
  const textEase = phase(1.08, .32);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
  let size = Math.max(11, unit * .046);
  ctx.font = '500 ' + size + 'px Exo';
  while (ctx.measureText(label).width > unit * .86) { size *= .95; ctx.font = '500 ' + size + 'px Exo'; }
  const logoY = height / 2 - (gap + size) / 2 - unit * .03, textY = height / 2 + (logoHeight + gap) / 2 - unit * .03;
  ctx.save(); ctx.translate(width / 2, logoY); ctx.globalAlpha = phase(.04, .16);
  const scale = .86 + progress * .14 + wave * .045; ctx.scale(scale, scale);
  if (progress >= 1) ctx.drawImage(icon, -logoWidth / 2, -logoHeight / 2, logoWidth, logoHeight);
  else {
    ctx.rotate(Math.sin(angle) * wave * .13);
    const sw = icon.naturalWidth, sh = icon.naturalHeight, strips = 48;
    for (let i = 0; i < strips; i++) {
      const v = (i + .5) / strips - .5, proj = Math.cos(angle + v * wave * 1.15);
      const stw = logoWidth * Math.max(.055, Math.abs(proj)), sth = logoHeight / strips * (1 - wave * .07);
      const x = Math.sin(angle + v * 2) * logoWidth * wave * .12;
      ctx.save(); ctx.translate(x, v * logoHeight * (1 - wave * .07)); ctx.scale(proj < 0 ? -1 : 1, 1);
      ctx.drawImage(icon, 0, i * sh / strips, sw, sh / strips, -stw / 2, -sth / 2, stw, sth + unit * .0015);
      ctx.restore();
    }
  }
  ctx.restore();
  ctx.globalAlpha = textEase; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.beginPath(); ctx.rect((width - unit * .95) / 2, textY - size * .8, unit * .95, size * 1.6); ctx.clip();
  ctx.fillText(label, width / 2, textY + (1 - textEase) * size * .9);
  ctx.restore();
  return textY + size;
}
function s7Update(b) {
  const on = b >= 60;
  vis(s7, on); if (!on) return;
  const ty = drawOutro(cvEnd.getContext('2d'), W, H, bt(b) - bt(60), 'dehub.io/creator/maboroshi');
  endLine.style.top = (ty + Math.min(W, H) * .03) + 'px';
  const p = P(b, 63.2, 64);
  op(endLine, oc(p) * .9);
  tf(endLine, `translateY(${(1 - oc(p)) * 12}px)`);
}

// ======================================================================= global fx
// [beat, rgbPx, tear(0..1), flash(0..1), shake(px), decayBeats]
const FXE = [
  [1, 6, 0, 0, 8, .3], [1.5, 6, 0, 0, 8, .3], [2, 10, .2, 0, 12, .4],
  [4, 20, .6, .6, 14, .5], [4.5, 6, 0, 0, 8, .3], [5, 6, 0, 0, 8, .3], [5.5, 10, .2, 0, 12, .4],
  [6, 22, .7, .5, 18, .55], [8, 22, .9, .7, 16, .55], [9.45, 0, 0, 0, 4, .3], [13.75, 8, .2, 0, 6, .4],
  [20, 26, 1, .8, 18, .6], [21, 14, .3, .35, 10, .45], [22, 14, .3, .35, 10, .45], [23, 14, .3, .35, 10, .45], [24, 14, .3, .35, 10, .45], [25, 14, .3, .35, 10, .45],
  [26, 18, .5, .5, 14, .4], [26.5, 18, .5, .4, 14, .4], [27, 18, .5, .5, 14, .35], [27.25, 18, .5, .3, 14, .25], [27.5, 22, .6, .4, 12, .45],
  [28, 26, 1, .45, 18, .6], [28.5, 8, 0, 0, 10, .35], [30, 8, 0, 0, 12, .35], [30.5, 10, .2, 0, 14, .4], [32, 14, .6, 0, 8, .4],
  [40, 18, .7, .2, 10, .5], [44, 12, .3, .1, 8, .4], [48, 12, .3, .1, 8, .4], [49.5, 10, .2, .15, 6, .4], [50.5, 10, .2, .15, 6, .4], [51.25, 10, .2, .15, 6, .4],
  [52, 16, .3, .15, 22, .5], [52.5, 10, 0, 0, 14, .4], [53, 10, 0, 0, 14, .4], [53.5, 12, .2, 0, 16, .45],
  [60, 28, 1, .5, 14, .6],
];
for (let i = 0; i < 16; i++) FXE.push([32 + .5 * i, 5, 0, 0, 3, .25]);
for (let i = 0; i < 4; i++) FXE.push([45 + .5 * i, 4, 0, 0, 4, .25]);
// motion-blur windows [b0, b1, subframes, shutter(frames)]
const MB = [[7.8, 9.4, 6, 1], [10.2, 10.9, 5, 1], [13.2, 14.0, 5, 1], [19.2, 20.3, 6, 1], [27.6, 28.8, 5, 1], [29.9, 30.8, 5, 1], [31.4, 32.4, 6, 1],
  [32.4, 39.7, 4, .8], [39.6, 40.7, 6, 1.2], [48.4, 49.2, 5, 1], [51.6, 54.1, 5, 1], [59.6, 60.3, 6, 1]];
function fxAt(t) {
  const b = t / B;
  let rgb = 0, tear = 0, flash = 0, shake = 0, tearSeed = 0;
  for (const [eb, r, te, fl, sh, d] of FXE) {
    if (b < eb || b > eb + d) continue;
    const k = (1 - (b - eb) / d) ** 2;
    rgb = Math.max(rgb, r * k); shake = Math.max(shake, sh * k); flash = Math.max(flash, fl * k ** 1.5);
    if (te * k > tear) { tear = te * k; tearSeed = Math.round(eb * 100) + Math.floor((b - eb) / d * 6); }
  }
  let mb = 1, sh = 0;
  for (const [a, z, n, s] of MB) if (b >= a && b < z) { mb = n; sh = s; }
  return { rgb, tear, tearSeed, flash, shake, mb, sh };
}
window.fxAt = fxAt;
const flashL = mk('div', 'fill', 'background:#fff;opacity:0;pointer-events:none');

// ======================================================================= render
function render(t) {
  const b = t / B;
  NOW = t;
  const fx = fxAt(t);
  const f = Math.floor(t * 60);
  const sx = fx.shake * (rnd(f * 1.37) - .5) * 2, sy = fx.shake * (rnd(f * 2.71 + 9) - .5) * 2;
  tf(world, `translate(${sx.toFixed(2)}px,${sy.toFixed(2)}px)`);
  op(flashL, fx.flash);
  if (b >= 5.95 && b < 8) bgSet({ '13': [.35 * P(b, 6, 6.6), 1.2, -(b - 6) * .4] });
  else if (b >= 8 && b < 20) bgSet({ '12': [.5 * P(b, 8, 8.6), 1.15 + .004 * (b - 8), (b - 8) * .25] });
  else if (b >= 28 && b < 32) bgSet({});
  else if (b >= 32 && b < 40) bgSet({ '30': [.28 * P(b, 32, 32.5), 1.25, (b - 32) * .6] });
  else if (b >= 40 && b < 52) bgSet({ '20': [.42, 1.15, (b - 40) * .3] });
  else if (b >= 52 && b < 60) bgSet({ '40': [.55 * P(b, 52, 52.6), 1.18 + .01 * (b - 52), (b - 52) * .5] });
  else bgSet({});
  op(bgDim, 1);
  vis(sceneL, b < 6 || (b >= 20 && b < 28.05));
  s1Update(b, t);
  s2Update(b, t);
  s3Update(b, t);
  s4Update(b);
  s5Update(b, t);
  s6Update(b);
  s7Update(b);
}
window.render = render;
window.FILM = { W, H, TOTAL, BPM, fps: 60 };
window.ready = (async () => {
  await document.fonts.load('500 40px Exo'); await document.fonts.load('700 40px Exo'); await document.fonts.load('20px DMono'); await document.fonts.load('900 40px Kanji', '幻');
  await Promise.all(loads);
  await document.fonts.ready;
  buildLooks(); buildDepth();
  FEL.forEach(f => { vis(s4, true); vis(f.box, true); const w = f.word.offsetWidth; f.fit = Math.min(1, (W * (VERT ? .88 : .8)) / w); vis(f.box, false); });
  render(0);
  return true;
})();
