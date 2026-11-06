import { floatingNote, MAX_ESCAPED_NOTES, noteRandom, notePop } from './bubbleLift';
import { paintNote, paintPop } from './bubbleLiftCanvas';
// Session-only: cards and routes can unmount without losing their escaped notes.
// Each bubble floats for NOTE_LIFETIME seconds, then pops and is removed.
const notes: { x: number; y: number; born: number; seed: number }[] = [];
let births = 0;
let canvas: HTMLCanvasElement | undefined;
let frame = 0, clock = 0, last = 0, lastBirth = -Infinity;
let reduced: MediaQueryList | undefined;
export function canEscapeMusicNote() {
  return notes.length < MAX_ESCAPED_NOTES;
}
export function escapeMusicNote(x: number, y: number) {
  if (!canEscapeMusicNote() || performance.now() - lastBirth < 6500 || document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return;
  lastBirth = performance.now();
  notes.push({ x, y, born: clock, seed: noteRandom(births++ * 17 + 3) });
  if (!canvas) {
    canvas = document.createElement('canvas'); canvas.dataset.escapedMusicNotes = 'bubble-lift';
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '2147483000' });
    document.body.append(canvas);
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    document.addEventListener('visibilitychange', wake); reduced.addEventListener('change', wake);
  }
  wake();
}
function wake() {
  if (!canvas) return;
  canvas.style.visibility = reduced?.matches ? 'hidden' : 'visible';
  if (document.hidden || reduced?.matches) { cancelAnimationFrame(frame); frame = 0; return; }
  if (!frame) { last = performance.now(); frame = requestAnimationFrame(draw); }
}
function draw(now: number) {
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) { frame = 0; return; }
  if (now - last < 30) { frame = requestAnimationFrame(draw); return; }
  clock += Math.min(.05, (now - last) / 1000); last = now;
  const width = window.innerWidth, height = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  // System's page ink is applied to surfaces, not the body's inherited colour.
  const html = document.documentElement;
  const ink = html.dataset.theme === 'light' || html.dataset.systemTone === 'light' ? '#203944' : '#e5f2f7';
  for (let i = notes.length - 1; i >= 0; i--) {
    const note = notes[i], age = clock - note.born, pop = notePop(age);
    if (pop >= 1) { notes.splice(i, 1); continue; }
    const p = floatingNote(age, note.seed, note.x, note.y, width, height);
    if (pop > 0) paintPop(ctx, p.x, p.y, p.size, p.rotation, p.opacity, ink, pop, note.seed);
    else paintNote(ctx, p.x, p.y, p.size, p.rotation, p.opacity, ink, false, true);
  }
  // Nothing left floating: stop drawing until the next note escapes.
  frame = notes.length ? requestAnimationFrame(draw) : 0;
}
