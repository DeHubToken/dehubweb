import { DOUBLE_HEAD, DOUBLE_STEM, NOTE_HEAD, NOTE_STEM, popShape } from './bubbleLift';
let shapes: Path2D[] | undefined;
export function paintNote(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, opacity: number, ink: string, double = false, bubble = false) {
  shapes ??= [NOTE_HEAD, NOTE_STEM, DOUBLE_HEAD, DOUBLE_STEM].map(d => new Path2D(d));
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.scale(size, size); ctx.translate(-3, 0);
  ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.globalAlpha = opacity;
  ctx.lineWidth = 1.05; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (bubble) {
    ctx.globalAlpha = opacity * .22; ctx.lineWidth = .6;
    ctx.beginPath(); ctx.arc(3, 0, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = opacity; ctx.lineWidth = 1.05;
  }
  ctx.fill(shapes[0]); ctx.stroke(shapes[double ? 3 : 1]);
  if (double) ctx.fill(shapes[2]);
  ctx.restore();
}
// The bubble bursts: ring swells and fades, droplets fly out, the note shrinks away.
export function paintPop(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, opacity: number, ink: string, pop: number, seed: number) {
  shapes ??= [NOTE_HEAD, NOTE_STEM, DOUBLE_HEAD, DOUBLE_STEM].map(d => new Path2D(d));
  const s = popShape(pop, seed);
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.scale(size, size); ctx.translate(-3, 0);
  ctx.fillStyle = ink; ctx.strokeStyle = ink;
  ctx.globalAlpha = opacity * s.ringAlpha; ctx.lineWidth = s.ringWidth;
  ctx.beginPath(); ctx.arc(3, 0, s.ring, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = opacity * s.dropAlpha;
  for (const d of s.drops) { ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill(); }
  ctx.translate(3, 0); ctx.scale(s.glyphScale, s.glyphScale); ctx.translate(-3, 0);
  ctx.globalAlpha = opacity * s.glyphAlpha; ctx.lineWidth = 1.05; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.fill(shapes[0]); ctx.stroke(shapes[1]);
  ctx.restore();
}
