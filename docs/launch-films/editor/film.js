'use strict';
// DeHub Editor launch film. Every pixel is a pure function of time: render(t) sets the whole frame.
// 140 BPM grid; all scene times below are in beats.
const Q = new URLSearchParams(location.search);
const W = +(Q.get('w') || 1920), H = +(Q.get('h') || 1080), VERT = H > W;
const BPM = 140, B = 60 / BPM, bt = b => b * B;
const END_B = 68, TOTAL = bt(END_B) + 1.4;
const stage = document.getElementById('stage');
stage.style.width = W + 'px'; stage.style.height = H + 'px';

// ---------------------------------------------------------------- math
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const oc = t => 1 - (1 - t) ** 3, oq = t => 1 - (1 - t) ** 4, ox = t => t >= 1 ? 1 : 1 - 2 ** (-10 * t);
const ic = t => t * t * t, iq = t => t * t * t * t, ioc = t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const iox = t => t <= 0 ? 0 : t >= 1 ? 1 : t < .5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2;
const ob = (t, s = 1.70158) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
const oel = t => t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI / 3)) + 1;
const P = (b, a, z) => clamp((b - a) / (z - a));
const rnd = s => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const fmtK = v => v < 1000 ? String(Math.round(v)) : (v / 1000).toFixed(1) + 'K';

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
// The clip the AI cuts up. a/foot/manifest.js can set window.FOOT_CLIPS = [{ dir, n, fps }]; otherwise the Osaka loop.
const CLIPS = (window.FOOT_CLIPS || [{ dir: 'a/osaka_hd', n: 72, fps: 24, start: 1 }]).map(c => ({ fps: c.fps, frames: Array.from({ length: c.n }, (_, i) => img(`${c.dir}/${String(i + (c.start ?? 1)).padStart(3, '0')}.jpg`)) }));
const SRC_DUR = CLIPS.reduce((a, c) => a + c.frames.length / c.fps, 0);
const SRC_NAME = window.FOOT_NAME || 'rave-night.mp4';
function srcFrame(sec) {
  let s = ((sec % SRC_DUR) + SRC_DUR) % SRC_DUR;
  for (const c of CLIPS) { const d = c.frames.length / c.fps; if (s < d) return c.frames[Math.min(c.frames.length - 1, Math.floor(s * c.fps))]; s -= d; }
  return CLIPS[0].frames[0];
}
function cover(ctx, im, w, h, zoom = 1, fx = .5, fy = .5) { // draw centred, covering w x h, panned to the focus point
  const sc = Math.max(w / im.naturalWidth, h / im.naturalHeight) * zoom, dw = im.naturalWidth * sc, dh = im.naturalHeight * sc;
  ctx.drawImage(im, -dw * fx, -dh * fy, dw, dh);
}
const EMO_META = { skull: [101, 4240], cry: [60, 1800], fire: [33, 990], hundred: [45, 2040], joy: [59, 1770], flushed: [60, 1800], blown: [83, 2610], heart: [56, 1800] };
const EMO = {};
for (const [n, [c]] of Object.entries(EMO_META)) EMO[n] = Array.from({ length: c }, (_, i) => img(`a/emoji/${n}_${String(i).padStart(3, '0')}.png`));
const emoFrame = (n, sec) => { const [c, ms] = EMO_META[n]; const f = Math.floor(((Math.max(0, sec) * 1000) % ms) / ms * c); return EMO[n][clamp(f, 0, c - 1)]; };
const MARK = img('a/mark.png');
const ICON3D = {}; for (const n of ['sparkle', 'star', 'sparkles-duo']) ICON3D[n] = `a/icons/${n}.png`;

const EVENTS = { type: [], type2: [], click: [], cut: [], drop: [], pop: [], slam: [], whoosh: [], tick: [] };
window.EVENTS = EVENTS;

// ---------------------------------------------------------------- layers
const world = mk('div', 'fill', 'transform-origin:50% 50%');
const bgL = mk('div', 'fill', 'overflow:hidden', world);
const BG = {};
for (const k of ['12', '01', '13', '20', '25', '30', '40']) {
  const big = Math.max(W, H * 16 / 9) * 1.25;
  const i = mk('img', 'ac', `width:${big}px;height:${big * 9 / 16}px;left:${(W - big) / 2}px;top:${(H - big * 9 / 16) / 2}px;opacity:0;visibility:hidden`, bgL);
  loads.push(whenLoaded(i, `a/bg/bg-${k}.jpg`)); i.src = `a/bg/bg-${k}.jpg`;
  BG[k] = i;
}
const spot = mk('div', 'fill', `background:radial-gradient(ellipse ${VERT ? '90% 45%' : '60% 60%'} at 50% 40%, rgba(255,255,255,.13), rgba(255,255,255,0) 70%)`, bgL);
const bgDim = mk('div', 'fill', 'background:radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 30%, rgba(0,0,0,.75) 100%)', bgL);
function bgSet(b, map) {
  for (const k in BG) {
    const v = map[k];
    if (!v) { op(BG[k], 0); continue; }
    const [o, s = 1.1, r = 0, x = 0, y = 0] = v;
    op(BG[k], o);
    tf(BG[k], `translate(${x}px,${y}px) rotate(${r}deg) scale(${s})`);
  }
}

// ======================================================================= S1: the ask
const s1 = mk('div', 'fill', '', world);
const s1cam = mk('div', 'fill', 'transform-origin:50% 50%', s1);
const LINES = VERT ? ['cut this video up into', '1 second chunks and', 'add brainrot'] : ['cut this video up into 1 second chunks', 'and add brainrot'];
const FS1 = VERT ? 58 : 64, LH1 = Math.round(FS1 * 1.34);
const BOXW = VERT ? W - 90 : 1600, PADY = VERT ? 40 : 40, SEND = VERT ? 100 : 104;
const box = mk('div', 'ab', `width:${BOXW}px;border-radius:${VERT ? 36 : 32}px;border:1.5px solid rgba(255,255,255,.2);background:linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.03));box-shadow:0 30px 80px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.12);overflow:hidden`, s1cam);
const boxIcon = mk('div', 'ab', `left:${VERT ? 30 : 34}px;top:${PADY + (LH1 - (VERT ? 46 : 52)) / 2}px;color:#fff;opacity:.9`, box, ico('Sparkles', VERT ? 46 : 52, 1.7));
const TXL = VERT ? 96 : 112;
const boxText = mk('div', 'ab', `left:${TXL}px;top:${PADY}px;width:${BOXW - TXL - SEND - 50}px;font-size:${FS1}px;line-height:${LH1}px;font-weight:500;letter-spacing:-.01em`, box);
const placeholder = mk('div', 'ab', `left:0;top:0;color:rgba(255,255,255,.35);white-space:nowrap`, boxText, 'Describe what you want…');
const CH = []; // {span, t, emph}
const FULL = LINES.join(' ');
const EMPH = [[FULL.indexOf('1 second chunks'), 15], [FULL.indexOf('brainrot'), 8]];
{
  let gi = 0;
  const N = FULL.length;
  LINES.forEach((ln, li) => {
    const row = mk('div', 'nowrap', `position:relative;height:${LH1}px`, boxText);
    [...ln].forEach(c => {
      const s = mk('span', '', 'display:inline-block;white-space:pre;opacity:0', row, c === ' ' ? ' ' : c);
      const tb = 0.55 + 5.45 * gi / (N - 1) + (rnd(gi * 1.7) - .5) * .07;
      const g = EMPH.findIndex(([a, l]) => gi >= a && gi < a + l);
      CH.push({ s, b: tb, emph: g >= 0, g, li });
      if (c !== ' ') EVENTS.type.push(bt(tb));
      gi++;
    });
    if (li < LINES.length - 1) gi++; // the space that became a line break
  });
}
const caret = mk('div', 'ab', `width:4px;height:${Math.round(FS1 * 1.05)}px;background:#fff;border-radius:2px;box-shadow:0 0 18px rgba(255,255,255,.7)`, boxText);
const underl = [mk('div', 'ab', 'height:3px;background:#fff;border-radius:2px;box-shadow:0 0 14px rgba(255,255,255,.8)', boxText), mk('div', 'ab', 'height:3px;background:#fff;border-radius:2px;box-shadow:0 0 14px rgba(255,255,255,.8)', boxText)];
const sendBtn = mk('div', 'ab', `width:${SEND}px;height:${SEND}px;border-radius:${SEND * .24}px;background:#fff;color:#000;display:flex;align-items:center;justify-content:center;transform-origin:50% 50%`, box, ico('ArrowUp', SEND * .46, 2.4));
const ripple = mk('div', 'ab', `width:${SEND}px;height:${SEND}px;border-radius:${SEND * .3}px;border:3px solid #fff;transform-origin:50% 50%;opacity:0`, s1cam);
const eyebrow = mk('div', 'ab mono', `font-size:${VERT ? 24 : 22}px;color:rgba(255,255,255,.75);white-space:nowrap;display:flex;align-items:center;gap:14px`, s1cam);
const ebDot = mk('span', '', 'display:inline-block;width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 0 12px #fff', eyebrow);
const ebTxt = mk('span', '', '', eyebrow);
const EB = 'DEHUB EDITOR  ·  NEW';
const hint = mk('div', 'ab', `font-size:${VERT ? 22 : 20}px;color:rgba(255,255,255,.38);white-space:nowrap`, s1cam, 'Enter to send · Ctrl+K to jump here');
const cursorSvg = (sz) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24"><path d="M4.5 2.8 L19.6 13.1 L12.4 13.9 L16.4 21.2 L13.5 22.6 L9.6 15.3 L4.5 20.2 Z" fill="#fff" stroke="#000" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
const cur1 = mk('div', 'ab', 'transform-origin:4px 3px;filter:drop-shadow(0 6px 10px rgba(0,0,0,.5))', s1cam, cursorSvg(VERT ? 64 : 58));
let BOX = { x: 0, y: 0, h: 0 };
EVENTS.click.push(bt(7.5));

function s1Update(b) {
  vis(s1, b < 8.02);
  if (b >= 8.02) return;
  const nlines = LINES.length;
  // box grows with each new line as it is typed
  let lines = 1;
  CH.forEach(c => { if (b >= c.b) lines = Math.max(lines, c.li + 1); });
  let hl = 1;
  for (let li = 1; li < nlines; li++) {
    const first = CH.find(c => c.li === li);
    hl += oc(P(b, first.b - .05, first.b + .25));
  }
  const bh = PADY * 2 + hl * LH1 + (VERT ? SEND * .0 : 0);
  const minH = Math.max(bh, SEND + 40);
  const bx = (W - BOXW) / 2, by = H / 2 - minH / 2 + (VERT ? -40 : 10);
  BOX = { x: bx, y: by, h: minH };
  box.style.left = bx + 'px'; box.style.top = by + 'px'; box.style.height = minH + 'px';
  const pin = oc(P(b, 0, .6));
  tf(box, `translateY(${(1 - pin) * 30}px) scale(${.94 + .06 * pin})`);
  box.style.transformOrigin = '50% 50%';
  op(box, P(b, 0, .35));
  // chars
  let last = null;
  const emphP = oc(P(b, 6.25, 6.75));
  for (const c of CH) {
    const p = P(b, c.b, c.b + .14);
    if (b >= c.b) last = c;
    const o = p > 0 ? 1 : 0;
    const dim = c.emph ? 1 : 1 - .5 * emphP;
    op(c.s, o * dim);
    tf(c.s, `translateY(${(1 - oc(p)) * 14}px) scale(${.7 + .3 * ob(p, 2.2)})`);
  }
  op(placeholder, b < CH[0].b ? .9 : 0);
  // caret
  let cx = 0, cy = 0;
  if (last) { cx = last.s.offsetLeft + last.s.offsetWidth + 3; cy = last.s.parentNode.offsetTop; }
  caret.style.left = cx + 'px'; caret.style.top = (cy + (LH1 - FS1 * 1.05) / 2) + 'px';
  const typing = b > CH[0].b - .2 && b < CH[CH.length - 1].b + .3;
  op(caret, (typing || Math.floor(b * 2) % 2 === 0) ? (b < 7.4 ? 1 : 0) : 0);
  // emphasis underlines
  EMPH.forEach(([a, l], k) => {
    const grp = CH.filter(c => c.g === k);
    if (!grp.length) return;
    const f = grp[0].s, z = grp[grp.length - 1].s;
    const x0 = f.offsetLeft, x1 = z.offsetLeft + z.offsetWidth, y = f.parentNode.offsetTop + LH1 * .9;
    const p = ioc(P(b, 6.3 + k * .25, 6.8 + k * .25));
    const u = underl[k];
    u.style.left = x0 + 'px'; u.style.top = y + 'px'; u.style.width = Math.max(0, (x1 - x0) * p) + 'px';
    op(u, p > 0 ? 1 : 0);
  });
  // send button
  const sx = BOXW - SEND - (VERT ? 22 : 24), sy = minH - SEND - (VERT ? 22 : 24);
  sendBtn.style.left = sx + 'px'; sendBtn.style.top = sy + 'px';
  const press = P(b, 7.42, 7.5) - P(b, 7.55, 7.75);
  op(sendBtn, b < CH[0].b ? .28 : 1);
  tf(sendBtn, `scale(${1 - .12 * press})`);
  // ripple
  const rp = P(b, 7.5, 8.0);
  ripple.style.left = (bx + sx) + 'px'; ripple.style.top = (by + sy) + 'px';
  tf(ripple, `scale(${1 + 1.4 * oc(rp)})`);
  op(ripple, rp > 0 ? (1 - rp) * .9 : 0);
  // eyebrow scramble
  const GL = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#+*/';
  let s = '';
  for (let i = 0; i < EB.length; i++) {
    const settle = .15 + i * .045;
    if (b < settle - .5) s += ' ';
    else if (b < settle) s += EB[i] === ' ' ? ' ' : GL[Math.floor(rnd(i * 7.3 + Math.floor(b * 24)) * GL.length)];
    else s += EB[i];
  }
  txt(ebTxt, s);
  eyebrow.style.left = (W / 2 - eyebrow.offsetWidth / 2) + 'px';
  eyebrow.style.top = (by - (VERT ? 78 : 74)) + 'px';
  op(eyebrow, P(b, 0, .2));
  op(ebDot, .45 + .55 * (0.5 + 0.5 * Math.cos(b * Math.PI)));
  hint.style.left = (W / 2 - hint.offsetWidth / 2) + 'px';
  hint.style.top = (by + minH + (VERT ? 34 : 30)) + 'px';
  op(hint, P(b, .3, .8) * (1 - P(b, 6.8, 7.2)));
  // cursor flies to send
  const cp = ioc(P(b, 6.15, 7.3));
  const tx = bx + sx + SEND * .55, ty = by + sy + SEND * .55;
  const fx0 = W * (VERT ? .86 : .82), fy0 = H * 1.04;
  const arc = Math.sin(cp * Math.PI) * -60;
  cur1.style.left = lerp(fx0, tx, cp) + 'px'; cur1.style.top = (lerp(fy0, ty, cp) + arc) + 'px';
  tf(cur1, `scale(${1 - .14 * press})`);
  op(cur1, P(b, 6.15, 6.3));
  // camera: slow push, then a pull-in on the click
  const cam = 1 + .04 * ioc(P(b, 0, 7.4)) + .08 * ic(P(b, 7.45, 8));
  const cxo = W / 2 + (tx - W / 2) * .35 * ic(P(b, 7.45, 8)), cyo = H / 2 + (ty - H / 2) * .35 * ic(P(b, 7.45, 8));
  s1cam.style.transformOrigin = `${cxo}px ${cyo}px`;
  tf(s1cam, `scale(${cam})`);
}

// ======================================================================= the editor replica (S2 + S5)
const s2 = mk('div', 'fill', `perspective:${VERT ? 2600 : 2400}px;perspective-origin:50% 50%`, world);
const rig = mk('div', 'ab', 'width:1920px;height:1080px;transform-style:preserve-3d', s2);
const edShadow = mk('div', 'ab', 'width:1920px;height:1080px;border-radius:14px;box-shadow:0 0 0 1px rgba(255,255,255,.16), 0 50px 140px rgba(0,0,0,.85)', rig);
const ed = mk('div', 'ed', 'border-radius:14px', rig);
const R = {};
{
  // top bar
  mk('div', 'ab', 'width:1920px;height:56px;border-bottom:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.6)', ed);
  mk('div', 'ghost', 'left:28px;top:17px', ed, 'Projects');
  mk('div', 'ab', 'left:104px;top:20px;width:1px;height:16px;background:rgba(255,255,255,.1)', ed);
  [['Undo2', 124, .8], ['Redo2', 164, .4], ['Info', 204, .6]].forEach(([n, x, o]) => mk('div', 'ab', `left:${x}px;top:12px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;opacity:${o}`, ed, ico(n, 16)));
  mk('div', 'ab', 'left:656px;top:17px;width:400px;text-align:center;font-size:15px;color:rgba(255,255,255,.9)', ed, 'rave night edit');
  const tb = [['Save', 'Save', 1485, 90], ['Sparkles', 'Creator', 1585, 102], ['Download', 'Export', 1697, 98], ['Share2', 'Post', 1805, 98]];
  tb.forEach(([i, l, x, w]) => { R['btn' + l] = mk('div', 'btn', `left:${x}px;top:11px;width:${w}px;transform-origin:50% 50%`, ed, ico(i, 16) + l); });
  // rail
  mk('div', 'ab', 'left:0;top:56px;width:72px;height:1024px;border-right:1px solid rgba(255,255,255,.1)', ed);
  [['Bot', 'AI'], ['LayoutTemplate', 'Design'], ['Shapes', 'Elements'], ['LibraryBig', 'Assets'], ['ImagePlus', 'Media'], ['Type', 'Text'], ['Layers', 'Layers'], ['Sparkles', 'Generate'], ['Wand2', 'Generations']].forEach(([i, l], k) => {
    mk('div', 'rail', `top:${63 + k * 55.6}px;${k === 0 ? 'background:rgba(255,255,255,.1);color:#fff' : ''}`, ed, ico(i, 18, 1.8) + `<span>${l}</span>`);
  });
  // AI panel
  mk('div', 'ab', 'left:72px;top:56px;width:320px;height:1024px;border-right:1px solid rgba(255,255,255,.1)', ed);
  mk('div', 'ab', 'left:84px;top:66px;font-size:13px;font-weight:700', ed, 'AI');
  mk('div', 'ab', 'left:358px;top:68px;opacity:.5', ed, ico('ChevronLeft', 16));
  mk('div', 'ab', 'left:72px;top:96px;width:320px;height:1px;background:rgba(255,255,255,.1)', ed);
  R.ubub = mk('div', 'bub', 'right:1540px;top:110px;background:#fff;color:#000;transform-origin:100% 0', ed, 'cut this video up into 1 second chunks and add brainrot');
  R.work = mk('div', 'ab', 'left:86px;top:178px;display:flex;align-items:center;gap:8px;font-size:11.5px;color:rgba(255,255,255,.55)', ed);
  R.spin = mk('div', '', 'width:14px;height:14px', R.work, ico('Loader2', 14));
  mk('span', '', '', R.work, 'Working on it…');
  R.rbub = mk('div', 'bub', 'left:80px;top:174px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:rgba(255,255,255,.88);transform-origin:0 0', ed,
    'Done. Cut it into 12 one-second clips, then added flashes, zoom punches, freeze frames, captions and sound effects in 9:16.' +
    `<div style="margin-top:7px;display:flex;align-items:center;gap:7px"><span style="font-size:10.5px;color:rgba(255,255,255,.45)">Edits made: 31</span><span style="display:flex;align-items:center;gap:4px;border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:1px 6px;font-size:10.5px;color:rgba(255,255,255,.75)">${ico('RotateCcw', 11)}Undo</span></div>`);
  mk('div', 'ab', 'left:80px;top:995px;width:302px;height:57px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.04)', ed);
  mk('div', 'ab', 'left:93px;top:1007px;font-size:12px;color:rgba(255,255,255,.35)', ed, 'Describe what you want…');
  mk('div', 'ab', 'left:344px;top:1014px;width:32px;height:32px;border-radius:8px;background:#fff;color:#000;opacity:.3;display:flex;align-items:center;justify-content:center', ed, ico('ArrowUp', 16));
  mk('div', 'ab', 'left:84px;top:1058px;font-size:10px;color:rgba(255,255,255,.35)', ed, 'Enter to send · Ctrl+K to jump here');
  // preview
  R.pv = mk('div', 'ab', 'overflow:hidden;background:#000;outline:1px solid rgba(255,255,255,.12)', ed);
  R.cvSrc = mk('canvas', '', 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover', R.pv); R.cvSrc.width = 1816; R.cvSrc.height = 1022;
  R.cvBR = mk('canvas', '', 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0', R.pv); R.cvBR.width = 1080; R.cvBR.height = 1920;
  // pages strip
  mk('div', 'btn', 'left:404px;top:624px;width:56px;height:27px;font-size:12px;gap:4px;border-radius:6px', ed, ico('Plus', 12) + 'Add');
  mk('div', 'btn', 'left:469px;top:624px;width:82px;height:27px;font-size:12px;gap:4px;border-radius:6px', ed, ico('Copy', 12) + 'Duplicate');
  // transport
  mk('div', 'ab', 'left:392px;top:660px;width:1528px;height:1px;background:rgba(255,255,255,.08)', ed);
  [['Play', 416], ['RotateCcw', 459], ['Repeat', 503]].forEach(([n, x]) => mk('div', 'ab', `left:${x}px;top:678px;opacity:.85`, ed, ico(n, 16)));
  R.time = mk('div', 'ab', 'left:540px;top:677px;font-size:13px;color:rgba(255,255,255,.85);font-variant-numeric:tabular-nums', ed, '0:00.00 / 0:12.00');
  mk('div', 'ab', 'left:687px;top:686px;width:1171px;height:3px;border-radius:2px;background:rgba(255,255,255,.14)', ed);
  R.scrubFill = mk('div', 'ab', 'left:687px;top:686px;height:3px;border-radius:2px;background:#fff', ed);
  R.scrubDot = mk('div', 'ab', 'left:681px;top:681px;width:12px;height:12px;border-radius:50%;background:#fff', ed);
  mk('div', 'ab', 'left:1880px;top:679px;opacity:.7', ed, ico('Maximize', 15));
  // timeline toolbar
  mk('div', 'ab', 'left:392px;top:713px;width:1528px;height:1px;background:rgba(255,255,255,.1)', ed);
  R.split = mk('div', 'ghost', 'left:408px;top:724px;font-size:15px;transform-origin:50% 50%', ed, ico('Scissors', 16) + 'Split');
  mk('div', 'ghost', 'left:485px;top:724px;font-size:15px;opacity:.4', ed, ico('Trash2', 16) + 'Delete');
  mk('div', 'ab', 'left:575px;top:726px;width:1px;height:16px;background:rgba(255,255,255,.12)', ed);
  mk('div', 'ghost', 'left:597px;top:724px;font-size:15px', ed, ico('Plus', 16) + 'Add');
  mk('div', 'ab', 'left:1806px;top:727px;opacity:.7', ed, ico('Minus', 14));
  mk('div', 'ab', 'left:1834px;top:726px;font-size:11px;color:rgba(255,255,255,.5)', ed, '80px/s');
  mk('div', 'ab', 'left:1890px;top:727px;opacity:.7', ed, ico('Plus', 14));
  // ruler + grid
  mk('div', 'ab', 'left:392px;top:756px;width:1528px;height:1px;background:rgba(255,255,255,.08)', ed);
  for (let k = 0; k < 18; k++) {
    mk('div', 'ab', `left:${512 + 80 * k}px;top:760px;width:1px;height:${k % 1 === 0 ? 8 : 4}px;background:rgba(255,255,255,.3)`, ed);
    mk('div', 'ab', `left:${515 + 80 * k}px;top:764px;font-size:10px;color:rgba(255,255,255,.42)`, ed, `0:${String(k).padStart(2, '0')}`);
    mk('div', 'ab', `left:${512 + 80 * k}px;top:785px;width:1px;height:295px;background:rgba(255,255,255,.045)`, ed);
  }
  // tracks
  R.rows = {};
  const rowDef = [['v2', 'V', 'FX', 'Eye'], ['v', 'V', 'V', 'Eye'], ['a', 'A', 'A', 'Volume2'], ['a2', 'A', 'A2', 'Volume2'], ['t', 'T', 'T', 'Eye']];
  rowDef.forEach(([id, badge, name, ic2]) => {
    const row = mk('div', 'trow', 'overflow:hidden', ed);
    mk('div', 'ab', 'left:0;top:55px;width:1528px;height:1px;background:rgba(255,255,255,.06)', row);
    mk('div', 'ab', 'left:9px;top:20px;opacity:.3', row, ico('GripVertical', 14));
    mk('div', 'ab', 'left:32px;top:18px;width:19px;height:19px;border-radius:4px;background:rgba(255,255,255,.1);font-size:10px;display:flex;align-items:center;justify-content:center;font-weight:700', row, badge);
    mk('div', 'ab', 'left:59px;top:19px;font-size:12px;color:rgba(255,255,255,.75)', row, name);
    mk('div', 'ab', `left:${name.length > 1 ? 82 : 74}px;top:20px;opacity:.5`, row, ico(ic2, 14));
    mk('div', 'ab', 'left:99px;top:21px;opacity:.4', row, ico('X', 12));
    const lane = mk('div', 'ab', 'left:120px;top:0;width:1400px;height:56px', row);
    R.rows[id] = { row, lane };
  });
  // video chunks with filmstrip thumbs
  R.chunks = [];
  for (let k = 0; k < 12; k++) {
    const c = mk('div', 'clip vclip', '', R.rows.v.lane);
    const cv = mk('canvas', '', 'position:absolute;left:0;top:0;width:80px;height:44px;opacity:.55', c); cv.width = 160; cv.height = 88;
    const lb = mk('div', 'lbl', 'font-family:DMono,monospace;font-size:10px;letter-spacing:.06em;opacity:0', c, '1.0s');
    R.chunks.push({ c, cv, lb });
  }
  R.vLabel = mk('div', 'ab', 'left:10px;top:6px;height:44px;display:flex;align-items:center;font-size:11px;font-weight:500;text-shadow:0 1px 2px rgba(0,0,0,.7)', R.rows.v.lane, SRC_NAME);
  R.cutFx = [];
  for (let k = 1; k < 12; k++) R.cutFx.push(mk('div', 'ab', `left:${80 * k - 2}px;top:-6px;width:4px;height:68px;background:#fff;border-radius:2px;box-shadow:0 0 16px 4px rgba(255,255,255,.85), 0 0 40px 10px rgba(125,211,252,.5);opacity:0`, R.rows.v.lane));
  // music clip
  R.music = mk('div', 'clip aclip', 'left:0;width:960px', R.rows.a.lane);
  R.cvWave = mk('canvas', '', 'position:absolute;left:0;top:0;width:960px;height:44px;opacity:.7', R.music); R.cvWave.width = 1920; R.cvWave.height = 88;
  mk('div', 'lbl', '', R.music, 'night-drive.mp3');
  // effects track (V2): flashes, zooms, whips, freeze frames
  R.fx = ['flash', 'zoom in', 'flash', 'whip', 'zoom out', 'freeze', 'flash', 'zoom in', 'whip', 'freeze', 'flash', 'zoom out'].map((n, k) => {
    const c = mk('div', 'clip vclip', `left:${80 * k + 4}px;width:64px;background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.35)`, R.rows.v2.lane);
    mk('div', 'lbl', 'left:6px;font-size:10px', c, n);
    return c;
  });
  // sfx clips (A2)
  R.sfx = [[0, 'boom'], [1.5, 'whoosh'], [3, 'riser'], [4.5, 'bruh'], [6, 'boom'], [7.5, 'pop'], [9, 'vine'], [10.5, 'boom']].map(([s, n]) => {
    const c = mk('div', 'clip aclip', `left:${80 * s}px;width:56px`, R.rows.a2.lane);
    mk('div', 'lbl', 'left:6px;font-size:10px', c, n);
    return c;
  });
  // captions (T)
  R.caps = ['BRO', 'REALLY', 'SAID', 'CUT IT', 'INTO', '1 SECOND', 'CHUNKS', '💀', 'THE AI', 'DID IT', 'NO WAY', '🔥'].map((w, k) => {
    const c = mk('div', 'clip tclip', `left:${80 * k + 1}px;width:78px`, R.rows.t.lane);
    mk('div', 'lbl', 'left:6px;font-size:10px;font-weight:700', c, w);
    return c;
  });
  // beat markers on the music clip
  // playhead
  R.ph = mk('div', 'ab', 'left:0;top:757px;width:2px;height:323px;background:#ef4444', ed);
  mk('div', 'ab', 'left:-5px;top:0;width:12px;height:20px;border-radius:4px;background:#ef4444', R.ph);
  // 3D callout above the timeline
  R.callout = mk('div', 'ab', 'left:0;top:0;width:900px;text-align:center;transform-style:preserve-3d', rig);
  R.coBig = mk('div', 'chrome', 'font-size:120px;font-weight:700;letter-spacing:-.02em;line-height:1;filter:drop-shadow(0 12px 30px rgba(0,0,0,.9))', R.callout, '12 CLIPS');
  R.coSmall = mk('div', 'mono', 'font-size:24px;margin-top:10px;color:rgba(255,255,255,.85);text-shadow:0 4px 18px rgba(0,0,0,.9)', R.callout, '1.00s each · one prompt');
  // S5 bits: render dialog + composer, live in the editor so they ride the camera
  R.overlay = mk('div', 'ab', 'width:1920px;height:1080px;background:rgba(0,0,0,.72);opacity:0', ed);
  R.dlg = mk('div', 'ab', 'left:704px;top:430px;width:512px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:#0b0b0b;padding:24px;transform-origin:50% 50%;opacity:0', ed,
    `<div style="font-size:18px;font-weight:700">Rendering your video…</div><div style="font-size:13px;color:rgba(255,255,255,.6);margin-top:6px;line-height:1.5">Once it's ready, the post composer will open with the video attached.</div>`);
  const pb = mk('div', '', 'margin-top:20px;height:8px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden', R.dlg);
  R.pbFill = mk('div', '', 'height:8px;width:0;background:#fff;border-radius:999px', pb);
  const prow = mk('div', '', 'margin-top:10px;display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,.6)', R.dlg);
  mk('span', '', '', prow, '1080×1920 · MP4');
  R.pct = mk('span', '', 'font-variant-numeric:tabular-nums', prow, '0%');
  mk('div', '', 'margin-top:18px;display:flex;justify-content:flex-end', R.dlg, `<span style="border:1px solid rgba(255,255,255,.16);border-radius:8px;padding:7px 14px;font-size:13px">Cancel</span>`);
  R.comp = mk('div', 'ab', 'left:640px;top:250px;width:640px;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:#0a0a0a;padding:20px 22px;transform-origin:50% 50%;opacity:0;box-shadow:0 30px 80px rgba(0,0,0,.7)', ed);
  mk('div', '', 'display:flex;justify-content:space-between;align-items:center', R.comp, `<span style="font-size:17px;font-weight:700">New post</span><span style="opacity:.5">${ico('X', 18)}</span>`);
  const crow = mk('div', '', 'display:flex;gap:14px;margin-top:18px', R.comp);
  mk('div', '', 'width:44px;height:44px;border-radius:50%;background:#1d1d1d;border:1px solid rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;flex:none', crow, `<img src="a/mark.png" style="width:18px">`);
  const ccol = mk('div', '', 'flex:1', crow);
  mk('div', '', 'font-size:14px;font-weight:700', ccol, '@you <span style="font-weight:500;color:rgba(255,255,255,.45)">· Public</span>');
  R.cText = mk('div', '', 'font-size:18px;margin-top:8px;min-height:28px;white-space:nowrap', ccol, '');
  R.cCaret = mk('span', '', 'display:inline-block;width:2px;height:22px;background:#fff;vertical-align:-4px;margin-left:1px', null);
  const att = mk('div', '', 'margin-top:14px;width:210px;height:373px;border-radius:14px;overflow:hidden;position:relative;border:1px solid rgba(255,255,255,.12)', ccol);
  R.cvThumb = mk('canvas', '', 'width:210px;height:373px;display:block', att); R.cvThumb.width = 420; R.cvThumb.height = 746;
  mk('div', '', 'position:absolute;left:10px;bottom:10px;font-size:12px;background:rgba(0,0,0,.65);border-radius:6px;padding:2px 7px', att, '0:12');
  mk('div', '', 'position:absolute;right:10px;top:10px;font-size:11px;background:rgba(0,0,0,.65);border-radius:6px;padding:2px 7px', att, '9:16');
  const cbar = mk('div', '', 'margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;align-items:center', R.comp);
  mk('div', '', 'display:flex;gap:18px;opacity:.6', cbar, ico('Image', 20) + ico('Smile', 20) + ico('Globe', 20));
  R.cPost = mk('div', '', 'background:#fff;color:#000;font-weight:700;font-size:16px;border-radius:999px;padding:9px 26px;transform-origin:50% 50%', cbar, 'Post');
  R.cur = mk('div', 'ab', 'transform-origin:4px 3px;filter:drop-shadow(0 4px 6px rgba(0,0,0,.5));opacity:0', ed, cursorSvg(30));
}
const CAPTION2 = 'cut it into 1 second chunks 💀';
const CAP2 = [...CAPTION2];
CAP2.forEach((c, i) => { if (c !== ' ') EVENTS.type2.push(bt(44.3 + 1.0 * i / (CAP2.length - 1))); });
[42.05, 45.65].forEach(b => EVENTS.click.push(bt(b)));

// static thumbnails
function initEditorCanvases() {
  R.chunks.forEach(({ cv }, k) => {
    const g = cv.getContext('2d');
    g.save(); g.translate(80, 44); cover(g, srcFrame(k + .5), 160, 88); g.restore();
  });
  const g = R.cvWave.getContext('2d');
  g.fillStyle = 'rgba(167,243,208,.9)';
  for (let x = 0; x < 1920; x += 6) {
    const beat = (x / 160) / B; const kick = Math.exp(-((beat % 1)) * 7);
    const a = (.18 + .55 * kick + .25 * rnd(x * .37)) * 36;
    g.fillRect(x, 44 - a, 3, a * 2);
  }
}

// ---------------------------------------------------------------- brainrot renderer (shared by preview, S3, composer, feed)
const CAPS = [[16.75, 'WAIT'], [17.25, 'WHAT'], [17.75, 'HOLD UP'], [18.5, 'BRO'], [19, 'WHAT IS'], [19.5, 'THIS'],
  [20, 'BRO'], [20.5, 'REALLY'], [21, 'SAID'], [21.5, 'CUT IT'], [22, 'INTO'], [22.5, '1 SECOND'], [23, 'CHUNKS'], [23.5, ''],
  [24, 'AND'], [24.5, 'THE AI'], [25, 'JUST'], [25.5, 'DID IT'], [26, ''], [26.5, 'NO'], [27, 'WAY'], [27.5, '']];
const EMO_POPS = [[19, 'flushed', .76, .3], [23.5, 'skull', .3, .3], [26, 'cry', .72, .3], [27.5, 'fire', .5, .5]];
// Edit grammar: a hard cut every half beat, each with its own move; flashes on the cuts; deep-fried freeze frames on the emoji hits.
const BR0 = 16.5;
const CUT_STYLE = ['punch', 'crash', 'punch', 'pull', 'whip', 'mirror', 'crash', 'slow', 'punch', 'whip', 'pull', 'crash', 'punch', 'mirror', 'whip', 'slow'];
const FREEZE = EMO_POPS.map(([eb, n, ex, ey]) => [eb, ex, ey]);
const INVERT = [21.75, 24.75, 26.75];
const GRADE = ['none', 'hueM', 'pop', 'hueC', 'warm', 'hueA', 'pop', 'hueM', 'cool', 'hueG', 'none', 'hueC'];
const HUES = { hueM: '#ff1fd2', hueC: '#00e5ff', hueA: '#9dff00', hueG: '#ffb300' };
function grade(ctx, gr, w, h, redraw) {
  if (gr === 'pop' || gr === 'fried') { ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = gr === 'fried' ? .9 : .5; redraw(); if (gr === 'fried') redraw(); }
  if (gr === 'warm' || gr === 'fried') { ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(255,110,30,.6)'; ctx.fillRect(-w, -h, w * 2, h * 2); }
  if (gr === 'cool') { ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(40,140,255,.6)'; ctx.fillRect(-w, -h, w * 2, h * 2); }
  if (HUES[gr]) { ctx.globalCompositeOperation = 'hue'; ctx.globalAlpha = .8; ctx.fillStyle = HUES[gr]; ctx.fillRect(-w, -h, w * 2, h * 2); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = .45; redraw(); }
  if (gr === 'mag') { ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(255,40,200,.55)'; ctx.fillRect(-w, -h, w * 2, h * 2); }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}
function brCutAt(b) { const k = Math.max(0, Math.floor((b - BR0) * 2)); return { k, b0: BR0 + k * .5, style: CUT_STYLE[k % CUT_STYLE.length] }; }
function drawBR(ctx, w, h, b, key, opt = {}) {
  const u = w / 1080;
  const { k, b0, style } = brCutAt(b);
  const d = Math.max(0, bt(b - b0)), p = clamp(d / bt(.5));
  const r1 = rnd(k * 3.1 + 1), r2 = rnd(k * 5.7 + 2), r3 = rnd(k * 9.3 + 3);
  const fz = FREEZE.find(([fb]) => b >= fb && b < fb + .5);
  let srcT = r2 * SRC_DUR + d * (style === 'slow' ? .3 : 1), zoom = 1.08, ox = 0, rot = (r1 - .5) * .05, fx = .3 + r3 * .4, fy = .35 + r1 * .3;
  if (style === 'punch') zoom = 1.08 + .45 * Math.exp(-d * 15);
  if (style === 'crash') zoom = 1.05 + .7 * ic(p);
  if (style === 'pull') zoom = 1.65 - .55 * oq(p);
  if (style === 'whip') { ox = (1 - oq(clamp(d / .14))) * w * (k % 2 ? 1 : -1); zoom = 1.12; }
  if (style === 'slow') zoom = 1.3 - .18 * p;
  if (style === 'mirror') zoom = 1.25 + .2 * Math.exp(-d * 12);
  let gr = GRADE[k % GRADE.length], shake = 0;
  if (fz) {
    const fd = bt(b - fz[0]);
    srcT = rnd(fz[0] * 7) * SRC_DUR; zoom = 1.05 + 1.0 * oq(clamp(fd / bt(.35))); fx = fz[1]; fy = fz[2]; rot = 0; ox = 0; gr = 'fried'; shake = 18 * u;
  }
  const im = srcFrame(srcT);
  const sx = shake * (rnd(Math.floor(bt(b) * 60) * 1.7) - .5) * 2, sy = shake * (rnd(Math.floor(bt(b) * 60) * 2.3) - .5) * 2;
  ctx.save();
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2 + ox + sx, h / 2 + sy);
  ctx.rotate(rot);
  if (k % 3 === 1 && !fz) ctx.scale(-1, 1);
  const draw = () => cover(ctx, im, w, h, zoom, fx, fy);
  if (style === 'whip' && Math.abs(ox) > 2) { // smear the whip
    for (let j = 3; j >= 1; j--) { ctx.globalAlpha = .22; ctx.save(); ctx.translate(-ox * .18 * j, 0); draw(); ctx.restore(); }
    ctx.globalAlpha = 1;
  }
  if (style === 'mirror' && !fz) { // two-way mirror cut
    ctx.save(); ctx.beginPath(); ctx.rect(-w / 2, -h, w / 2, h * 2); ctx.clip(); draw(); ctx.restore();
    ctx.save(); ctx.scale(-1, 1); ctx.beginPath(); ctx.rect(-w / 2, -h, w / 2, h * 2); ctx.clip(); draw(); ctx.restore();
  } else draw();
  if (style === 'slow' && !fz) { // echo trails
    ctx.globalCompositeOperation = 'screen';
    for (const [lag, a] of [[.12, .35], [.24, .2]]) { ctx.globalAlpha = a; cover(ctx, srcFrame(srcT - lag), w, h, zoom * (1 + lag * .3), fx, fy); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  const zv = style === 'crash' ? 2.1 * p * p : style === 'pull' ? 1.1 * (1 - oq(p)) : style === 'punch' ? 6 * Math.exp(-d * 15) * .1 : fz ? 1.4 * (1 - oq(clamp(bt(b - fz[0]) / bt(.35)))) : 0;
  if (zv > .04) { // radial zoom blur
    for (let j = 1; j <= 4; j++) { ctx.globalAlpha = .2 * (1 - j / 5); cover(ctx, im, w, h, zoom * (1 + .035 * j * zv), fx, fy); }
    ctx.globalAlpha = 1;
  }
  grade(ctx, gr, w, h, draw);
  ctx.restore();
  // fried vignette on freeze frames
  if (fz) {
    const vg = ctx.createRadialGradient(w / 2, h / 2, h * .2, w / 2, h / 2, h * .75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(60,0,0,.75)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  }
  // flashes on the cuts: white on the beat, neon on the off-beat
  if (!fz) {
    if (k % 2 === 0) { ctx.globalAlpha = .9 * Math.exp(-d * 26); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    else { ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .7 * Math.exp(-d * 22); ctx.fillStyle = k % 4 === 1 ? '#ff2bd6' : '#22e5ff'; ctx.fillRect(0, 0, w, h); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  } else if (b - fz[0] < .06) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
  if (INVERT.some(ib => b >= ib && b < ib + .125)) { ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'source-over'; }
  // caption, one word at a time
  let cap = null;
  for (const c of CAPS) if (b >= c[0]) cap = c;
  if (cap && cap[1]) {
    const ci = CAPS.indexOf(cap), dtc = bt(b - cap[0]);
    const s = 1 + .42 * Math.exp(-dtc * 20);
    ctx.save();
    ctx.translate(w / 2, h * .69);
    ctx.rotate((rnd(ci * 4.4) - .5) * .12);
    ctx.scale(s, s);
    ctx.font = `700 ${150 * u}px Exo`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 26 * u; ctx.strokeStyle = '#000';
    ctx.strokeText(cap[1], 0, 0);
    ctx.fillStyle = ci % 2 ? '#FFE14A' : '#ffffff';
    ctx.fillText(cap[1], 0, 0);
    ctx.restore();
  }
  if (opt.emoji) {
    for (const [eb, n, ex, ey] of EMO_POPS) {
      const d = b - eb; if (d < 0 || d > 1.6) continue;
      const p = ob(P(d, 0, .3), 2.6), out = P(d, 1.2, 1.6);
      const sz = 420 * u * p * (1 - .3 * out);
      ctx.globalAlpha = 1 - out;
      ctx.drawImage(emoFrame(n, bt(d)), ex * w - sz / 2, ey * h - sz / 2, sz, sz);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- editor state + cameras
const FIT = Math.min(W / 1920, H / 1080);
function camApply(f) {
  const [fx, fy, z, rx, ry, rz] = f;
  tf(rig, `translate(${W / 2}px,${H / 2}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${FIT * z}) translate(${-fx}px,${-fy}px)`);
}
function camAt(b, keys) {
  if (b <= keys[0][0]) return keys[0].slice(1, 7);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], c = keys[i + 1];
    if (b <= c[0]) {
      const e = (c[7] || ioc)(P(b, a[0], c[0]));
      return [1, 2, 3, 4, 5, 6].map(j => j === 3 ? Math.exp(lerp(Math.log(a[j]), Math.log(c[j]), e)) : lerp(a[j], c[j], e));
    }
  }
  return keys[keys.length - 1].slice(1, 7);
}
const PV16 = [702, 80, 908, 511], PV916 = [1156 - 144, 80, 288, 511];
// S3 frame geometry (screen space)
const FR = VERT ? { w: W, h: H } : { w: 562, h: 1000 };
const ZTHRU = FR.h / (511 * FIT);
const zw = (a, v) => VERT ? v : a; // per-orientation values
const CAM2 = [
  [8.0, 236, 150, zw(3.0, 2.4), 0, 0, 0],
  [9.7, 1000, 560, zw(.84, 2.0), 12, -16, 1.5, ox],
  [11.3, 1020, 560, zw(.88, 2.1), 11, -13, 1.1, (t) => t],
  [12.05, 990, 870, zw(1.75, 2.7), 24, -4, 0, iox],
  [15.0, 1010, 860, zw(1.9, 2.9), 22, -2, 0, (t) => t],
  [16.0, 1050, 850, zw(1.6, 2.5), 20, -6, 0, ioc],
  [17.4, 1060, 780, zw(1.3, 2.3), 15, -9, 0, ioc],
  [18.4, 900, 560, zw(1.0, 2.0), 12, -12, 0, ioc],
  [19.1, 1156, 335.5, zw(1.5, 3.0), 5, -4, 0, ioc],
  [20.0, 1156, 335.5, ZTHRU, 0, 0, 0, iox],
];
const CAM5 = [
  [39.8, 1560, 420, zw(1.05, 2.0), 8, 26, -1],
  [41.0, 1640, 300, zw(1.2, 2.3), 8, 16, 0, ox],
  [41.95, 1800, 120, zw(2.0, 3.2), 5, 9, 0, ioc],
  [42.7, zw(870, 960), zw(600, 600), zw(1.9, 3.0), 7, zw(-7, -3), 0, ioc],
  [43.9, zw(880, 960), zw(590, 590), zw(2.05, 3.2), 6, zw(-5, -2), 0, (t) => t],
  [44.45, zw(930, 960), 560, zw(1.5, 2.4), 5, -5, 0, ioc],
  [45.7, zw(1020, 990), 680, zw(1.7, 2.6), 4, -3, 0, ioc],
  [46.4, 1110, 840, zw(2.6, 3.2), 0, 0, 0, iox],
];
function editorUpdate(b) {
  const inS2 = b >= 8 && b < 20.35, inS5 = b >= 39.6 && b < 46.9;
  vis(s2, inS2 || inS5);
  if (!(inS2 || inS5)) return;
  const t = bt(b);
  let cam = inS2 ? camAt(b, CAM2) : camAt(b, CAM5);
  if (inS5) { const wp = 1 - oc(P(b, 39.6, 40.3)); cam = cam.slice(); cam[0] -= wp * 1500; cam[4] += wp * 30; }
  camApply(cam);
  op(s2, inS2 ? 1 - P(b, 20.0, 20.3) : 1);
  op(edShadow, inS2 ? 1 - P(b, 19.2, 19.8) : 1);
  // agent chat
  const up = ob(P(b, 8.0, 8.3), 2);
  tf(R.ubub, `scale(${.8 + .2 * up})`); op(R.ubub, P(b, 8, 8.12));
  op(R.work, b > 8.35 && b < 17.6 ? 1 : 0);
  tf(R.spin, `rotate(${t * 540}deg)`);
  const rp = ob(P(b, 17.6, 17.95), 1.8);
  tf(R.rbub, `scale(${.85 + .15 * rp})`); op(R.rbub, P(b, 17.6, 17.75));
  // preview
  const m = ioc(P(b, 16.6, 17.25));
  const pv = PV16.map((v, i) => lerp(v, PV916[i], m));
  Object.assign(R.pv.style, { left: pv[0] + 'px', top: pv[1] + 'px', width: pv[2] + 'px', height: pv[3] + 'px' });
  // playhead
  let sec;
  if (b < 12) sec = 0;
  else if (b < 15) sec = 12 * (b - 12) / 3;
  else if (b < 16.6) sec = 12 * (1 - ioc(P(b, 15.4, 16.2)));
  else if (b < 20.4) sec = t - bt(16.6);
  else sec = ((t - bt(40)) % 12 + 12) % 12 * .999 + 2;
  R.ph.style.left = (512 + 80 * sec - 1) + 'px';
  const tm = s => `0:${String(Math.floor(s)).padStart(2, '0')}.${String(Math.floor((s % 1) * 100)).padStart(2, '0')}`;
  txt(R.time, `${tm(sec)} / 0:12.00`);
  R.scrubFill.style.width = (1171 * sec / 12) + 'px';
  R.scrubDot.style.left = (681 + 1171 * sec / 12) + 'px';
  if (m < 1) {
    op(R.cvSrc, 1);
    const g = R.cvSrc.getContext('2d');
    const fi = b >= 12 && b < 15.4 ? Math.floor(sec * 24) : Math.floor(t * 24);
    g.save(); g.translate(908, 511); cover(g, srcFrame(fi / 24), 1816, 1022); g.restore();
  } else op(R.cvSrc, 0);
  op(R.cvBR, P(b, 16.6, 16.85));
  if (b >= 16.6) {
    const bb = inS5 ? 20 + ((b - 40) % 8 + 8) % 8 : b;
    drawBR(R.cvBR.getContext('2d'), 1080, 1920, bb, 'pv', { emoji: true });
  }
  // cuts
  const cutP = k => (k <= 0 || k >= 12) ? 1 : oel(P(b, 12 + .25 * k, 12 + .25 * k + .5));
  const cutOn = k => b >= 12 + .25 * k;
  R.chunks.forEach(({ c, lb }, k) => {
    const gl = (k > 0 && cutOn(k)) ? 6 * cutP(k) : 0;
    const gr = (k < 11 && cutOn(k + 1)) ? 6 * cutP(k + 1) : 0;
    const chase = b >= 15 && b < 16.4 ? Math.exp(-Math.abs((b - 15) * 12 - k) * 1.2) : 0;
    c.style.left = (80 * k + gl / 2) + 'px';
    c.style.width = (80 - gl / 2 - gr / 2) + 'px';
    const rl = k === 0 ? 6 : clamp(gl, 0, 6), rr = k === 11 ? 6 : clamp(gr, 0, 6);
    c.style.borderRadius = `${rl}px ${rr}px ${rr}px ${rl}px`;
    c.style.borderLeftWidth = (k === 0 || gl > .5) ? '1px' : '0';
    c.style.borderRightWidth = (k === 11 || gr > .5) ? '1px' : '0';
    const pop = k > 0 && cutOn(k) ? Math.exp(-bt(b - (12 + .25 * k)) * 10) : 0;
    tf(c, `translateY(${-pop * 8 - chase * 6}px)`);
    c.style.outline = chase > .3 ? `2px solid rgba(255,255,255,${(chase * .9).toFixed(2)})` : 'none';
    op(lb, cutOn(Math.max(1, k)) ? P(b, 12 + .25 * Math.max(1, k), 12.4 + .25 * Math.max(1, k)) : 0);
  });
  op(R.vLabel, 1 - P(b, 12.2, 12.5));
  R.cutFx.forEach((e, i) => { const d = b - (12 + .25 * (i + 1)); op(e, d >= 0 ? Math.exp(-d * 9) : 0); });
  // callout
  const cp = P(b, 15, 15.25), cOut = P(b, 16.15, 16.45);
  R.callout.style.left = (990 - 450) + 'px'; R.callout.style.top = '640px';
  tf(R.callout, `translateZ(${120 + 40 * (1 - cOut)}px) scale(${lerp(1.7, 1, ox(cp)) * (1 - .2 * cOut)})`);
  op(R.callout, cp > 0 ? Math.min(P(b, 15, 15.06), 1 - cOut) : 0);
  // new tracks
  const hv2 = 56 * oc(P(b, 16.15, 16.45)), ha2 = 56 * oc(P(b, 16.3, 16.6));
  let y = 785;
  for (const [id, h] of [['v2', hv2], ['v', 56], ['a', 56], ['a2', ha2], ['t', 56]]) {
    const rr = R.rows[id].row; rr.style.top = y + 'px'; rr.style.height = h + 'px'; y += h;
  }
  R.fx.forEach((c, j) => { const d = 16.3 + j * .1; const p = ob(P(b, d, d + .2), 2); tf(c, `translateY(${(1 - p) * -26}px) scale(${.6 + .4 * p})`); op(c, P(b, d, d + .05)); });
  R.sfx.forEach((c, j) => { const d = 16.5 + j * .125; const p = ob(P(b, d, d + .2), 2); tf(c, `translateY(${(1 - p) * -26}px) scale(${.6 + .4 * p})`); op(c, P(b, d, d + .05)); });
  R.caps.forEach((c, j) => { const d = 16.6 + j * .125; const p = ob(P(b, d, d + .2), 2); tf(c, `translateY(${(1 - p) * -30}px) scale(${.6 + .4 * p})`); op(c, P(b, d, d + .05)); });
  // ---- S5: post flow
  const press = P(b, 41.98, 42.05) - P(b, 42.1, 42.3);
  tf(R.btnPost, `scale(${1 - .08 * press})`);
  R.btnPost.style.background = inS5 && b > 41.4 && b < 42.6 ? `rgba(255,255,255,${(.07 + .18 * P(b, 41.4, 41.9)).toFixed(3)})` : 'rgba(255,255,255,.07)';
  const dIn = P(b, 42.2, 42.45), dOut = P(b, 43.95, 44.15);
  op(R.overlay, inS5 ? Math.min(P(b, 42.15, 42.4), 1) : 0);
  op(R.dlg, inS5 ? Math.min(dIn, 1 - dOut) : 0);
  tf(R.dlg, `scale(${.95 + .05 * oc(dIn)})`);
  const prog = ioc(P(b, 42.4, 43.85));
  R.pbFill.style.width = (100 * prog) + '%'; txt(R.pct, Math.round(100 * prog) + '%');
  const cIn = P(b, 44.05, 44.35);
  op(R.comp, inS5 ? cIn : 0);
  tf(R.comp, `scale(${.94 + .06 * ob(cIn, 1.4)})`);
  if (inS5 && b > 44) {
    const n = CAP2.filter((c, i) => b >= 44.3 + 1.0 * i / (CAP2.length - 1)).length;
    if (R.cText._n !== n) { R.cText.textContent = CAP2.slice(0, n).join(''); R.cText.appendChild(R.cCaret); R.cText._n = n; }
    op(R.cCaret, Math.floor(b * 2) % 2 === 0 || b < 45.4 ? 1 : 0);
    drawBR(R.cvThumb.getContext('2d'), 420, 746, 20 + ((b - 40) % 8), 'th', { emoji: true });
  }
  const pp = P(b, 45.62, 45.7) - P(b, 45.75, 45.95);
  tf(R.cPost, `scale(${1 - .1 * pp})`);
  // cursor (editor space)
  let cx = 1500, cy = 420, co = 0, cs = 1;
  if (inS5) {
    const p1 = ioc(P(b, 40.8, 41.95));
    cx = lerp(1420, 1858, p1); cy = lerp(470, 34, p1) - Math.sin(p1 * Math.PI) * 40;
    co = P(b, 40.6, 40.9);
    cs = 1 - .15 * press;
    if (b > 44.2) {
      const pb2 = R.cPost.getBoundingClientRect ? null : null;
      const p2 = ioc(P(b, 44.4, 45.6));
      const tx = 640 + 22 + 596 - 50, ty = 250 + 20 + 600; // composer post button (approx; refined at init)
      cx = lerp(1858, R.cPostXY ? R.cPostXY[0] : tx, p2); cy = lerp(34, R.cPostXY ? R.cPostXY[1] : ty, p2);
      cs = 1 - .15 * pp;
    }
  }
  R.cur.style.left = cx + 'px'; R.cur.style.top = cy + 'px';
  tf(R.cur, `scale(${cs})`); op(R.cur, co);
}

// ======================================================================= S3: brainrot result
const s3 = mk('div', 'fill', '', world);
const s3cam = mk('div', 'fill', 'transform-origin:50% 50%', s3);
const cvBlur = mk('canvas', '', `position:absolute;left:0;top:0;width:${W}px;height:${H}px;opacity:0`, s3cam); cvBlur.width = 32; cvBlur.height = 18;
const blurDim = mk('div', 'fill', 'background:radial-gradient(ellipse at 50% 50%, rgba(0,0,0,.25), rgba(0,0,0,.8))', s3cam);
const marq = [0, 1].map(i => mk('div', 'ab nowrap', `top:${VERT ? (i ? H * .78 : H * .08) : (i ? H * .62 : H * .06)}px;font-size:${VERT ? 220 : 250}px;font-weight:700;line-height:1;color:transparent;-webkit-text-stroke:2px rgba(255,255,255,.11);letter-spacing:-.01em`, s3cam, 'BRAINROT · BRAINROT · BRAINROT · BRAINROT · BRAINROT · BRAINROT · '));
const frame = mk('div', 'ab', `width:${FR.w}px;height:${FR.h}px;left:${(W - FR.w) / 2}px;top:${(H - FR.h) / 2}px;overflow:hidden;${VERT ? '' : 'border-radius:34px;'}background:#000;transform-origin:50% 50%`, s3cam);
const cvFR = mk('canvas', '', `width:${FR.w}px;height:${FR.h}px;display:block`, frame); cvFR.width = 1080; cvFR.height = 1920;
const frameRing = mk('div', 'ab', `width:${FR.w}px;height:${FR.h}px;left:${(W - FR.w) / 2}px;top:${(H - FR.h) / 2}px;border-radius:34px;box-shadow:0 0 0 2px rgba(255,255,255,.35), 0 40px 120px rgba(0,0,0,.8);transform-origin:50% 50%;${VERT ? 'display:none' : ''}`, s3cam);
const PILLS = VERT ? [] : [
  [20.5, 'Scissors', '12 × 1-second cuts', -1, H * .30],
  [21.5, 'Type', 'auto captions', -1, H * .56],
  [22.5, 'Volume2', 'sound effects', 1, H * .40],
  [23.5, 'Sparkles', 'flashes + zoom punches', 1, H * .66],
].map(([b0, i, l, side, y]) => {
  const p = mk('div', 'pill', `top:${y}px;transform-origin:${side < 0 ? '100%' : '0'} 50%`, s3cam, ico(i, 28) + `<span class="mono" style="font-size:25px;letter-spacing:.12em">${l}</span>`);
  const ln = mk('div', 'ab', `top:${y + 33}px;height:2px;background:linear-gradient(90deg,rgba(255,255,255,.55),rgba(255,255,255,.15));transform-origin:${side < 0 ? '0' : '100%'} 50%`, s3cam);
  const dot = mk('div', 'ab', `top:${y + 28}px;width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 0 12px #fff`, s3cam);
  return { b0, p, ln, dot, side, y };
});
const DOM_EMO = [[23.5, 'skull', zw(-.55, -.24), -.28, -12], [26, 'cry', zw(.55, .24), zw(-.18, -.2), 10], [27.5, 'fire', .0, .36, 0]].map(([b0, n, x, y, r]) => {
  const sz = VERT ? 520 : 330;
  const e = mk('img', 'ab', `width:${sz}px;height:${sz}px;transform-origin:50% 50%;filter:drop-shadow(0 20px 40px rgba(0,0,0,.6))`, s3cam);
  return { b0, n, x, y, r, e, sz };
});
EVENTS.pop.push(...[19, 23.5, 26, 27.5].map(bt));
function s3Update(b) {
  const on = b >= 19.98 && b < 28.0;
  vis(s3, on); if (!on) return;
  const t = bt(b);
  op(s3, 1);
  const bgIn = P(b, 20, 20.5);
  marq.forEach((m, i) => { tf(m, `translateX(${(i ? -1 : 1) * ((t * 260) % 2600) - (i ? 0 : 2600)}px)`); op(m, bgIn); });
  drawBR(cvFR.getContext('2d'), 1080, 1920, b, 'fr', { emoji: false });
  if (!VERT) { const g = cvBlur.getContext('2d'); g.drawImage(cvFR, 0, 480, 1080, 960, 0, 0, 32, 18); op(cvBlur, .75 * bgIn); }
  const beatPunch = Math.exp(-(b - Math.floor(b)) * 5) * P(b, 20, 20.2);
  const sway = Math.sin(t * 2.2) * .6;
  const zoomOut = VERT ? 1 : 1;
  tf(frame, `rotate(${sway * .4}deg) scale(${(1 + .018 * beatPunch) * zoomOut})`);
  tf(frameRing, `rotate(${sway * .4}deg) scale(${(1 + .018 * beatPunch) * zoomOut})`);
  op(frameRing, bgIn);
  const end = P(b, 27.75, 28.05);
  tf(s3cam, `scale(${1 + .006 * Math.sin(t * 1.3) + .25 * ic(end)})`);
  PILLS.forEach(({ b0, p, ln, dot, side, y }) => {
    const pp = ob(P(b, b0, b0 + .3), 1.8), lp = oc(P(b, b0 - .1, b0 + .2));
    const fx = side < 0 ? (W - FR.w) / 2 : (W + FR.w) / 2;
    const gap = 70;
    const pw = p.offsetWidth;
    const px = side < 0 ? fx - gap - pw - 60 : fx + gap + 60;
    p.style.left = px + 'px';
    tf(p, `scale(${.6 + .4 * pp})`); op(p, P(b, b0, b0 + .08));
    const lx0 = side < 0 ? px + pw : fx, lx1 = side < 0 ? fx : px;
    ln.style.left = lx0 + 'px'; ln.style.width = (lx1 - lx0) + 'px';
    tf(ln, `scaleX(${lp})`); op(ln, lp > 0 ? 1 : 0);
    dot.style.left = (fx - 6) + 'px'; op(dot, lp >= 1 ? 1 : 0);
  });
  DOM_EMO.forEach(({ b0, n, x, y, r, e, sz }) => {
    const d = b - b0;
    if (d < 0 || d > 1.7) { op(e, 0); return; }
    if (e._fr !== emoFrame(n, bt(d)).src) { e.src = emoFrame(n, bt(d)).src; e._fr = e.src; }
    const p = ob(P(d, 0, .32), 2.8), out = ic(P(d, 1.25, 1.7));
    const cx = W / 2 + x * FR.w - sz / 2, cy = H / 2 + y * FR.h - sz / 2;
    e.style.left = cx + 'px'; e.style.top = (cy - out * 120) + 'px';
    tf(e, `rotate(${r + Math.sin(d * 9) * 6 * (1 - P(d, 0, 1))}deg) scale(${p * (1 - .25 * out)})`);
    op(e, 1 - out);
  });
}

// ======================================================================= S4: kinetic type + feature barrage
const s4 = mk('div', 'fill', 'perspective:1600px', world);
const s4a = mk('div', 'fill', '', s4);
const FS4 = VERT ? 178 : 250;
const L4 = [mk('div', 'ab nowrap', `width:${W}px;text-align:center;font-size:${FS4}px;font-weight:700;line-height:1;letter-spacing:-.025em;top:${H / 2 - FS4 * .98}px`, s4a), mk('div', 'ab nowrap', `width:${W}px;text-align:center;font-size:${FS4}px;font-weight:700;line-height:1;letter-spacing:-.025em;top:${H / 2 + FS4 * .02}px`, s4a)];
const WORDS4 = [[28, 'YOU', 0], [28.5, 'ASK.', 0], [30, 'IT', 1], [30.5, 'EDITS.', 1]].map(([b0, w, li]) => {
  const s = mk('span', 'chrome', 'display:inline-block;margin:0 .14em;transform-origin:50% 60%;background-size:100% 100%', L4[li], w);
  EVENTS.slam.push(bt(b0));
  shineInit(s);
  return { b0, s };
});
const s4b = mk('div', 'fill', '', s4);
const FEAT = [
  ['CUT', 'frame-exact splits'], ['TRIM', 'keep only the good part'], ['CAPTIONS', 'auto, from speech'], ['BEAT SYNC', 'cuts land on the beat'],
  ['AUTO-DUB', 'foreign speech, dubbed'], ['CLEAN AUDIO', 'noise out, voice up'], ['STOCK VIDEO', 'search and drop in'], ['MUSIC + SFX', 'free library'],
  ['REMOVE BG', 'one ask'], ['FILTERS', 'warmth · contrast · vignette'], ['TRANSITIONS', 'fades · slides · wipes'], ['KEYFRAMES', 'custom motion'],
  ['RECORD', 'camera · screen · voice'], ['SCENE DETECT', 'finds every cut'], ['GIF EXPORT', 'looping, shareable'], ['9:16 · 1:1 · 16:9', 'resize in one ask'],
];
const FS4B = VERT ? 150 : 210;
const featIdx = mk('div', 'ab nowrap', `width:${W}px;text-align:center;top:${H / 2 - (VERT ? 330 : 360)}px;font-size:${VERT ? 560 : 640}px;font-weight:700;line-height:1;color:transparent;-webkit-text-stroke:2px rgba(255,255,255,.09)`, s4b, '01');
const FEL = FEAT.map(([w, d], i) => {
  const box = mk('div', 'ab', `width:${W}px;top:${H / 2 - FS4B * .62}px;text-align:center;transform-origin:50% 50%`, s4b);
  const word = mk('div', 'nowrap', `display:inline-block;font-size:${FS4B}px;font-weight:700;line-height:1;letter-spacing:-.02em;color:#fff`, box, w);
  const desc = mk('div', 'mono', `font-size:${VERT ? 26 : 26}px;margin-top:${VERT ? 26 : 30}px;color:rgba(255,255,255,.62)`, box, d);
  return { box, word, desc, b0: 32 + .5 * i, fit: 1 };
});
const featTop = mk('div', 'ab mono nowrap', `top:${VERT ? 300 : 120}px;width:${W}px;text-align:center;font-size:${VERT ? 26 : 22}px;color:rgba(255,255,255,.7)`, s4b, 'just ask for it');
const segs = mk('div', 'ab', `top:${H - (VERT ? 330 : 140)}px;left:${(W - (VERT ? 760 : 900)) / 2}px;width:${VERT ? 760 : 900}px;height:6px;display:flex;gap:6px`, s4b);
const SEG = FEAT.map(() => mk('div', '', 'flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,.14)', segs));
const segNum = mk('div', 'ab mono', `top:${H - (VERT ? 300 : 112)}px;width:${W}px;text-align:center;font-size:20px;color:rgba(255,255,255,.55)`, s4b, '01 / 16');
FEL.forEach(f => EVENTS.tick.push(bt(f.b0)));
function s4Update(b) {
  const on = b >= 28.0 && b < 40.35;
  vis(s4, on); if (!on) return;
  // kinetic words
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
  // barrage
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
  txt(featIdx, String(cur + 1).padStart(2, '0'));
  const ip = P(b, 32 + .5 * cur, 32 + .5 * cur + .3);
  tf(featIdx, `scale(${lerp(1.15, 1, oc(ip))})`);
  op(featIdx, P(b, 32, 32.2));
  SEG.forEach((s, i) => { s.style.background = i <= cur && b >= 32 ? '#fff' : 'rgba(255,255,255,.14)'; });
  txt(segNum, `${String(cur + 1).padStart(2, '0')} / 16`);
  op(featTop, P(b, 32, 32.3)); op(segs, P(b, 32, 32.2)); op(segNum, P(b, 32, 32.2));
  const wp = ic(P(b, 39.75, 40.3));
  tf(s4b, `translateX(${-wp * W}px)`);
  tf(s4a, 'none');
}

// ======================================================================= S5 overlays: headline + feed
const s5h = mk('div', 'fill', '', world);
const s5grad = mk('div', 'fill', `background:linear-gradient(0deg, rgba(0,0,0,.92) 0%, rgba(0,0,0,.6) ${VERT ? 28 : 34}%, rgba(0,0,0,0) ${VERT ? 48 : 58}%)`, s5h);
const FS5 = VERT ? 92 : 104;
const H5 = ['POST STRAIGHT', 'FROM THE EDITOR.'].map((l, i) => mk('div', 'ab nowrap chrome', `left:${VERT ? 60 : 96}px;top:${H - (VERT ? 420 : 340) + i * FS5 * 1.02}px;font-size:${FS5}px;font-weight:700;line-height:1;letter-spacing:-.02em`, s5h, l));
H5.forEach(shineInit);
const H5m = mk('div', 'ab mono nowrap', `left:${VERT ? 64 : 100}px;top:${H - (VERT ? 420 : 340) + FS5 * 2.2}px;font-size:${VERT ? 24 : 22}px;color:rgba(255,255,255,.7)`, s5h, 'no export · no re-upload · one click');
[40.5, 41].forEach(b => EVENTS.slam.push(bt(b)));
function s5hUpdate(b) {
  const on = b >= 40.3 && b < 44.2;
  vis(s5h, on); if (!on) return;
  op(s5grad, P(b, 40.3, 40.6) * (1 - P(b, 43.6, 44.1)));
  H5.forEach((e, i) => {
    const b0 = 40.5 + i * .5, p = P(b, b0, b0 + .3);
    e.style.clipPath = `inset(0 ${100 - 100 * oq(p)}% -20% 0)`;
    tf(e, `translateX(${(1 - oq(p)) * -40}px)`);
    op(e, (p > 0 ? 1 : 0) * (1 - P(b, 43.6, 43.95)));
    shine(e, P(b, 41.7 + i * .15, 42.5 + i * .15));
  });
  op(H5m, P(b, 41.6, 42) * (1 - P(b, 43.6, 43.95)));
}
// feed
const s5f = mk('div', 'fill', '', world);
const feedBg = mk('div', 'fill', 'background:#000', s5f);
const feedBgImg = mk('img', 'ac', `width:${Math.max(W, H * 16 / 9) * 1.3}px;left:${(W - Math.max(W, H * 16 / 9) * 1.3) / 2}px;top:${(H - Math.max(W, H * 16 / 9) * 1.3 * 9 / 16) / 2}px;opacity:.5`, s5f); loads.push(whenLoaded(feedBgImg, 'a/bg/bg-25.jpg')); feedBgImg.src = 'a/bg/bg-25.jpg';
mk('div', 'fill', 'background:radial-gradient(ellipse 55% 60% at 62% 45%, rgba(255,255,255,.12), rgba(0,0,0,0) 70%), radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 35%, rgba(0,0,0,.8) 100%)', s5f);
const PH = VERT ? { h: 1300, x: W / 2, y: 1195 } : { h: 960, x: W * .66, y: H / 2 };
PH.w = Math.round(PH.h * 9 / 19.5);
const phoneWrap = mk('div', 'ab', `left:${PH.x - PH.w / 2}px;top:${PH.y - PH.h / 2}px;width:${PH.w}px;height:${PH.h}px;transform-style:preserve-3d;transform-origin:50% 50%`, s5f);
const phone = mk('div', 'ab', `width:${PH.w}px;height:${PH.h}px;border-radius:${PH.w * .14}px;background:#050505;box-shadow:0 0 0 ${PH.w * .022}px #121212, 0 0 0 ${PH.w * .027}px #3a3a3a, 0 60px 140px rgba(0,0,0,.85);overflow:hidden`, phoneWrap);
const cvFeed = mk('canvas', '', `position:absolute;left:0;top:0;width:${PH.w}px;height:${PH.h}px;object-fit:cover`, phone); cvFeed.width = 720; cvFeed.height = 1560;
const pu = PH.w / 440;
const fUI = mk('div', 'fill', `font-size:${15 * pu}px`, phone);
mk('div', 'fill', 'background:linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,0) 16%, rgba(0,0,0,0) 62%, rgba(0,0,0,.75) 100%)', fUI);
mk('div', 'ab', `left:${30 * pu}px;top:${16 * pu}px;font-weight:700;font-size:${15 * pu}px`, fUI, '9:41');
mk('div', 'ab', `right:${28 * pu}px;left:auto;top:${17 * pu}px;display:flex;gap:${6 * pu}px`, fUI, ico('Signal', 15 * pu) + ico('Wifi', 15 * pu) + ico('BatteryFull', 17 * pu));
mk('div', 'ab nowrap', `left:0;width:${PH.w}px;top:${58 * pu}px;text-align:center;font-size:${16 * pu}px`, fUI, `<span style="opacity:.55;margin-right:${22 * pu}px">Following</span><span style="font-weight:700;border-bottom:${2.5 * pu}px solid #fff;padding-bottom:${5 * pu}px">For You</span>`);
const rail = mk('div', 'ab', `left:${PH.w - 66 * pu}px;top:${PH.h * .44}px;width:${56 * pu}px;display:flex;flex-direction:column;align-items:center;gap:${20 * pu}px;font-size:${12.5 * pu}px;font-weight:700;text-shadow:0 1px 3px rgba(0,0,0,.6)`, fUI);
mk('div', '', `width:${48 * pu}px;height:${48 * pu}px;border-radius:50%;background:#111;border:${2 * pu}px solid #fff;display:flex;align-items:center;justify-content:center`, rail, `<img src="a/mark.png" style="width:${20 * pu}px">`);
const likeBox = mk('div', '', 'display:flex;flex-direction:column;align-items:center;gap:4px', rail);
const heartI = mk('div', '', 'transform-origin:50% 50%', likeBox, `<svg width="${36 * pu}" height="${36 * pu}" viewBox="0 0 24 24" fill="#fff"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`);
const likeN = mk('div', '', 'font-variant-numeric:tabular-nums', likeBox, '0');
const cmBox = mk('div', '', 'display:flex;flex-direction:column;align-items:center;gap:4px', rail, `<svg width="${34 * pu}" height="${34 * pu}" viewBox="0 0 24 24" fill="#fff"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>`);
const cmN = mk('div', '', 'font-variant-numeric:tabular-nums', cmBox, '0');
const tipBox = mk('div', '', 'display:flex;flex-direction:column;align-items:center;gap:4px', rail, `<span style="font-size:${32 * pu}px;line-height:1;font-family:'Noto Color Emoji'">💎</span>`);
const tipN = mk('div', '', 'font-variant-numeric:tabular-nums', tipBox, '0');
mk('div', '', 'display:flex;flex-direction:column;align-items:center;gap:4px', rail, ico('Share2', 32 * pu, 2.2) + '<div>Share</div>');
const fCap = mk('div', 'ab', `left:${18 * pu}px;top:${PH.h - 128 * pu}px;width:${PH.w - 110 * pu}px;text-shadow:0 1px 3px rgba(0,0,0,.7)`, fUI,
  `<div style="font-weight:700;font-size:${17 * pu}px">@you</div><div style="margin-top:${6 * pu}px;font-size:${15 * pu}px">cut it into 1 second chunks 💀</div><div style="margin-top:${8 * pu}px;font-size:${13 * pu}px;opacity:.8">♫ original sound · edited on DeHub</div>`);
const toast = mk('div', 'ab nowrap', `left:${PH.w / 2}px;top:${96 * pu}px;transform-origin:50% 50%;display:flex;align-items:center;gap:${8 * pu}px;background:#fff;color:#000;border-radius:999px;padding:${8 * pu}px ${16 * pu}px;font-weight:700;font-size:${14 * pu}px`, fUI, ico('Check', 16 * pu, 3) + 'Posted to DeHub');
const FLOAT = Array.from({ length: 22 }, (_, j) => ({ b0: 46.6 + j * .25, n: ['heart', 'fire', 'hundred', 'joy', 'heart', 'skull'][j % 6], e: mk('img', 'ab', `width:${70 * pu}px;height:${70 * pu}px;transform-origin:50% 50%;opacity:0`, phone), dx: (rnd(j * 9.1) - .5) * 120 * pu, s: .7 + rnd(j * 4.2) * .6 }));
const flood = mk('div', 'ab', 'border:4px solid #fff;border-radius:50%;opacity:0;box-shadow:0 0 30px rgba(255,255,255,.6)', world);
const FS5F = VERT ? 120 : 132;
const F5 = ['EDIT IT.', 'POST IT.', 'DONE.'].map((w, i) => mk('div', 'ab nowrap chrome', VERT ? `left:0;width:${W}px;text-align:center;top:${84 + i * FS5F * .98}px;font-size:${FS5F}px;font-weight:700;line-height:1;letter-spacing:-.02em;transform-origin:50% 50%` : `left:${W * .08}px;top:${H / 2 - FS5F * 1.65 + i * FS5F * 1.02}px;font-size:${FS5F}px;font-weight:700;line-height:1;letter-spacing:-.02em;transform-origin:0 50%`, s5f, w));
F5.forEach(shineInit);
const F5m = mk('div', 'ab mono nowrap', VERT ? `left:0;width:${W}px;text-align:center;top:${84 + 3 * FS5F * .98 + 14}px;font-size:24px;color:rgba(255,255,255,.7)` : `left:${W * .08 + 4}px;top:${H / 2 + FS5F * 1.55}px;font-size:22px;color:rgba(255,255,255,.7)`, s5f, 'from timeline to feed in one click');
[46.5, 47, 47.5].forEach(b => EVENTS.slam.push(bt(b)));
EVENTS.whoosh.push(bt(46));
let FLOOD_C = [W / 2, H / 2];
function s5fUpdate(b) {
  const on = b >= 45.95 && b < 52.15;
  vis(s5f, on);
  // flood origin = where the composer's Post button is on screen
  if (b >= 45.6 && b < 46.05) { const r = R.cPost.getBoundingClientRect(); FLOOD_C = [r.left + r.width / 2, r.top + r.height / 2]; }
  const fp = P(b, 46, 46.7);
  const Rmax = Math.hypot(W, H) * 1.05, rr = Rmax * iox(fp) + 1;
  if (on) s5f.style.clipPath = fp < 1 ? `circle(${rr}px at ${FLOOD_C[0]}px ${FLOOD_C[1]}px)` : 'none';
  vis(flood, fp > 0 && fp < 1);
  if (fp > 0 && fp < 1) {
    flood.style.left = (FLOOD_C[0] - rr) + 'px'; flood.style.top = (FLOOD_C[1] - rr) + 'px';
    flood.style.width = flood.style.height = (rr * 2) + 'px'; op(flood, 1 - fp * .6);
  }
  if (!on) return;
  const t = bt(b);
  // phone
  const pin = oc(P(b, 46, 46.9));
  tf(phoneWrap, `translateY(${(1 - pin) * 80 + Math.sin(t * 1.4) * 6}px) rotateY(${VERT ? 0 : lerp(-26, -12, pin) + Math.sin(t * .9) * 2}deg) rotateX(${lerp(10, 3, pin)}deg) scale(${lerp(1.15, 1, pin) * (1 - .2 * ic(P(b, 51.7, 52.15)))})`);
  s5f.style.perspective = '2000px';
  drawBR(cvFeed.getContext('2d'), 720, 1560, 20 + ((b - 46) % 8), 'feed', { emoji: false });
  const lp = oq(P(b, 46.6, 51.4));
  txt(likeN, fmtK(12400 * lp)); txt(cmN, fmtK(842 * oq(P(b, 47, 51.6)))); txt(tipN, fmtK(316 * oq(P(b, 47.3, 51.8))));
  const beatP = Math.exp(-((b - 46.6) % .5 + .5) % .5 * 10);
  tf(heartI, `scale(${1 + .18 * beatP * (b > 46.6 ? 1 : 0)})`);
  heartI.firstChild.setAttribute('fill', b > 46.55 ? '#ff3b5c' : '#fff');
  const tp = P(b, 46.35, 46.6), tq = P(b, 48.4, 48.7);
  op(toast, tp * (1 - tq)); tf(toast, `translateX(-50%) translateY(${(1 - ob(tp, 2)) * -30}px)`);
  const lr = likeBox.getBoundingClientRect(), phr = phone.getBoundingClientRect();
  FLOAT.forEach(f => {
    const d = b - f.b0;
    if (d < 0 || d > 2.2) { op(f.e, 0); return; }
    const fr = emoFrame(f.n, bt(d)); if (f.e._src !== fr.src) { f.e.src = fr.src; f.e._src = fr.src; }
    const p = d / 2.2;
    const x0 = PH.w - 66 * pu + 28 * pu - 35 * pu, y0 = PH.h * .44 + 70 * pu;
    f.e.style.left = (x0 + f.dx * p + Math.sin(d * 5 + f.b0) * 18 * pu) + 'px';
    f.e.style.top = (y0 - p * PH.h * .42) + 'px';
    tf(f.e, `scale(${f.s * ob(P(d, 0, .25), 2)})`);
    op(f.e, 1 - ic(P(d, 1.4, 2.2)));
  });
  F5.forEach((e, i) => {
    const b0 = 46.5 + i * .5, p = P(b, b0, b0 + .3);
    op(e, P(b, b0, b0 + .05) * (1 - P(b, 51.7, 52.1)));
    tf(e, `scale(${lerp(1.7, 1, ox(p))})`);
    shine(e, P(b, 48.6 + i * .2, 49.5 + i * .2));
  });
  op(F5m, P(b, 48.2, 48.6) * (1 - P(b, 51.7, 52.1)));
}

// ======================================================================= S6: FREE
const s6 = mk('div', 'fill', 'perspective:1400px', world);
const FS6 = VERT ? 330 : 430;
const freeRow = mk('div', 'ab nowrap', `width:${W}px;text-align:center;top:${H / 2 - FS6 * (VERT ? .78 : .72)}px;font-size:${FS6}px;font-weight:700;line-height:1;letter-spacing:-.03em;transform-style:preserve-3d`, s6);
const FREE = [...'FREE'].map((c, i) => { EVENTS.slam.push(bt(52 + .5 * i)); const e = mk('span', 'chrome', 'display:inline-block;transform-origin:50% 100%', freeRow, c); shineInit(e); return e; });
const freeShine = mk('div', 'ab nowrap', `width:${W}px;text-align:center;top:${H / 2 - FS6 * (VERT ? .78 : .72)}px;font-size:${FS6}px;font-weight:700;line-height:1;letter-spacing:-.03em;color:transparent;background:linear-gradient(100deg, rgba(255,255,255,0) 40%, rgba(255,255,255,.95) 50%, rgba(255,255,255,0) 60%);background-size:300% 100%;-webkit-background-clip:text;background-clip:text`, s6, 'FREE');
const sub6 = mk('div', 'ab nowrap', `width:${W}px;text-align:center;top:${H / 2 + FS6 * (VERT ? .34 : .4)}px;font-size:${VERT ? 50 : 58}px;font-weight:700;letter-spacing:.3em;padding-left:.3em`, s6, 'FOR EVERY USER');
const badge6 = mk('div', 'ab nowrap mono', `top:${H / 2 + FS6 * (VERT ? .34 : .4) + (VERT ? 100 : 108)}px;display:flex;align-items:center;gap:14px;padding:14px 26px;border-radius:999px;border:1.5px solid rgba(255,255,255,.35);background:rgba(0,0,0,.4);font-size:${VERT ? 24 : 24}px;color:rgba(255,255,255,.9)`, s6);
const b6dot = mk('span', '', 'display:inline-block;width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 0 14px #fff', badge6);
mk('span', '', '', badge6, 'until further notice');
const SPARK = [['sparkle', -.36, -.34, 150], ['star', .38, -.3, 120], ['sparkles-duo', .33, .3, 140], ['sparkle', -.4, .26, 100]].map(([n, x, y, s], i) => {
  const e = mk('img', 'ab', `width:${s * (VERT ? 1.2 : 1)}px;transform-origin:50% 50%;filter:drop-shadow(0 20px 30px rgba(0,0,0,.6))`, s6);
  loads.push(whenLoaded(e, ICON3D[n])); e.src = ICON3D[n];
  return { e, x, y, s: s * (VERT ? 1.2 : 1), i };
});
function s6Update(b) {
  const on = b >= 51.95 && b < 60.15;
  vis(s6, on); if (!on) return;
  const t = bt(b);
  FREE.forEach((e, i) => {
    const b0 = 52 + .5 * i, p = P(b, b0, b0 + .3);
    op(e, P(b, b0 - .01, b0 + .04));
    tf(e, `translateY(${(1 - ox(p)) * -80}px) rotateX(${(1 - ox(p)) * -75}deg) scale(${lerp(1.8, 1, ox(p))})`);
  });
  const push = 1 + .05 * ioc(P(b, 54, 60));
  tf(freeRow, `scale(${push})`); tf(freeShine, `scale(${push})`);
  op(freeShine, 0);
  FREE.forEach((e, i) => { const a = P(b, 54.1 + i * .12, 54.9 + i * .12), z = P(b, 57.6 + i * .12, 58.4 + i * .12); shine(e, a > 0 && a < 1 ? a : z); });
  const sp = P(b, 54.5, 55.0);
  sub6.style.clipPath = `inset(0 ${100 - 100 * oq(sp)}% 0 0)`;
  op(sub6, sp > 0 ? 1 : 0);
  tf(sub6, `scale(${push})`);
  const bp = ob(P(b, 55.5, 55.8), 2);
  badge6.style.left = (W / 2 - badge6.offsetWidth / 2) + 'px';
  tf(badge6, `scale(${.6 + .4 * bp})`); op(badge6, P(b, 55.5, 55.6));
  op(b6dot, .35 + .65 * (.5 + .5 * Math.cos(b * Math.PI)));
  SPARK.forEach(({ e, x, y, s, i }) => {
    const p = ob(P(b, 54 + i * .25, 54.4 + i * .25), 2);
    e.style.left = (W / 2 + x * (VERT ? W * 1.6 : W) - s / 2) + 'px';
    e.style.top = (H / 2 + y * (VERT ? H * .55 : H) - s / 2 + Math.sin(t * 1.6 + i) * 14) + 'px';
    tf(e, `rotate(${Math.sin(t * .8 + i * 2) * 18 + (1 - p) * 90}deg) scale(${p})`);
    op(e, P(b, 54 + i * .25, 54.1 + i * .25));
  });
  tf(s6, `scale(${1 + .4 * ic(P(b, 59.7, 60.15))})`);
}

// ======================================================================= S7: end card (same ending as editor downloads)
const s7 = mk('div', 'fill', 'background:#000', world);
const cvEnd = mk('canvas', '', `width:${W}px;height:${H}px;display:block`, s7); cvEnd.width = W; cvEnd.height = H;
const endLine = mk('div', 'ab mono nowrap', `width:${W}px;text-align:center;font-size:${VERT ? 24 : 22}px;color:rgba(255,255,255,.55)`, s7, 'AI video editor · free for everyone');
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
  ctx.beginPath(); ctx.rect((width - unit * .9) / 2, textY - size * .8, unit * .9, size * 1.6); ctx.clip();
  ctx.fillText(label, width / 2, textY + (1 - textEase) * size * .9);
  ctx.restore();
  return textY + size;
}
function s7Update(b) {
  const on = b >= 60;
  vis(s7, on); if (!on) return;
  const ty = drawOutro(cvEnd.getContext('2d'), W, H, bt(b) - bt(60), 'dehub.io/editor');
  endLine.style.top = (ty + Math.min(W, H) * .03) + 'px';
  const p = P(b, 63.2, 64);
  op(endLine, oc(p) * .9);
  tf(endLine, `translateY(${(1 - oc(p)) * 12}px)`);
}

// ======================================================================= global fx
// [beat, rgbPx, tear(0..1), flash(0..1), shake(px), decayBeats]
const FXE = [
  [8, 22, .9, .85, 16, .55], [12.05, 8, 0, 0, 6, .4], [15, 10, .3, .15, 14, .45], [20, 12, .2, .2, 6, .5],
  [23.5, 10, .2, 0, 16, .5], [26, 10, .2, 0, 14, .5], [27.5, 12, .3, 0, 12, .4], [28, 26, 1, .45, 18, .6],
  [28.5, 8, 0, 0, 10, .35], [30, 8, 0, 0, 12, .35], [30.5, 10, .2, 0, 14, .4], [32, 14, .6, 0, 8, .4],
  [40, 18, .7, .2, 10, .5], [42.05, 0, 0, 0, 4, .3], [46, 14, .2, .3, 10, .5], [46.5, 6, 0, 0, 8, .3], [47, 6, 0, 0, 8, .3], [47.5, 8, 0, 0, 10, .35],
  [52, 12, .25, 0, 18, .45], [52.5, 10, 0, 0, 14, .4], [53, 10, 0, 0, 14, .4], [53.5, 16, .3, .12, 22, .55],
  [60, 28, 1, .5, 14, .6],
];
for (let i = 0; i < 16; i++) FXE.push([32 + .5 * i, 5, 0, 0, 3, .25]);
for (let b = 20; b < 28; b++) FXE.push([b, 4, 0, 0, 4, .3]);
// motion-blur windows [b0, b1, subframes, shutter(frames)]
const MB = [[7.8, 9.9, 6, 1], [11.3, 12.3, 6, 1], [15, 15.3, 4, .7], [18.3, 20.3, 6, 1], [27.6, 28.8, 5, 1], [29.9, 30.8, 5, 1], [31.4, 32.4, 6, 1],
  [32.4, 39.7, 4, .8], [39.6, 40.6, 6, 1.2], [41.6, 42.1, 5, 1], [45.9, 47.9, 5, 1], [51.6, 54.1, 5, 1], [59.6, 60.3, 6, 1]];
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
  const fx = fxAt(t);
  const f = Math.floor(t * 60);
  const sx = fx.shake * (rnd(f * 1.37) - .5) * 2, sy = fx.shake * (rnd(f * 2.71 + 9) - .5) * 2;
  tf(world, `translate(${sx.toFixed(2)}px,${sy.toFixed(2)}px)`);
  op(flashL, fx.flash);
  // backgrounds
  const tt = t;
  if (b < 8) bgSet(b, { '12': [.62 * P(b, 0, .8), 1.12 + .05 * b / 8, -2 + b * .3, 0, 0] });
  else if (b < 20.3) bgSet(b, { '01': [.5, 1.15 + .004 * (b - 8), (b - 8) * .25, 0, 0] });
  else if (b < 28.1) bgSet(b, { '13': [.42 * P(b, 20, 20.6), 1.2, -(b - 20) * .4, 0, 0] });
  else if (b < 32) bgSet(b, {});
  else if (b < 39.8) bgSet(b, { '30': [.28 * P(b, 32, 32.5), 1.25, (b - 32) * .6, 0, 0] });
  else if (b < 46.1) bgSet(b, { '20': [.5, 1.15, (b - 40) * .3, 0, 0] });
  else if (b < 52) bgSet(b, {});
  else if (b < 60) bgSet(b, { '40': [.55 * P(b, 52, 52.6), 1.18 + .01 * (b - 52), (b - 52) * .5, 0, 0] });
  else bgSet(b, {});
  op(spot, b < 60 ? 1 : 0);
  op(bgDim, 1);
  s1Update(b);
  editorUpdate(b);
  s3Update(b);
  s4Update(b);
  s5hUpdate(b);
  s5fUpdate(b);
  s6Update(b);
  s7Update(b);
}
window.render = render;
window.FILM = { W, H, TOTAL, BPM, fps: 60 };
window.ready = (async () => {
  await document.fonts.load('500 40px Exo'); await document.fonts.load('700 40px Exo'); await document.fonts.load('20px DMono'); await document.fonts.load('40px "Noto Color Emoji"');
  await Promise.all(loads);
  await document.fonts.ready;
  initEditorCanvases();
  // fit barrage words
  FEL.forEach(f => { vis(f.box, true); const w = f.word.offsetWidth; f.fit = Math.min(1, (W * (VERT ? .88 : .8)) / w); vis(f.box, false); });
  // composer post button position in editor space
  op(R.comp, 1); vis(s2, true);
  const cr = R.comp.offsetLeft, ctp = R.comp.offsetTop;
  let e = R.cPost, x = 0, y = 0; while (e && e !== ed) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
  R.cPostXY = [x + R.cPost.offsetWidth * .6, y + R.cPost.offsetHeight * .6];
  op(R.comp, 0);
  EVENTS.cut = Array.from({ length: 11 }, (_, k) => bt(12 + .25 * (k + 1)));
  EVENTS.drop = [16.3, ...R.sfx.map((_, j) => 16.5 + j * .125), ...R.caps.map((_, j) => 16.6 + j * .125)].map(bt);
  EVENTS.brcut = []; for (let k = 7; ; k++) { const b0 = BR0 + k * .5; if (b0 >= 27.5) break; if (!FREEZE.some(([fb]) => Math.abs(fb - b0) < .01)) EVENTS.brcut.push([bt(b0), CUT_STYLE[k % CUT_STYLE.length], k % 2]); }
  EVENTS.freeze = FREEZE.map(([fb]) => bt(fb));
  render(0);
  return true;
})();
