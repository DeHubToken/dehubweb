// Icons in one row come from different sets: some fill their box edge to edge
// (the film strip, the star, the pin), others leave a wide margin. At one
// nominal size the row looks uneven, so each glyph is scaled until its drawn
// shape covers the same share of the box, then centred on that shape.
const INK_HEIGHT = 0.7;
const INK_WIDTH = 0.82;
const MIN_SCALE = 0.8;
const MAX_SCALE = 1.12;

export function fitIconInk(svg: SVGSVGElement) {
  const box = svg.viewBox.baseVal;
  if (!box || !box.width || !box.height) return;
  let ink: DOMRect;
  try { ink = svg.getBBox(); } catch { return; }
  if (!ink.width || !ink.height) return;
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(INK_HEIGHT / (ink.height / box.height), INK_WIDTH / (ink.width / box.width))));
  svg.style.transform = '';
  const size = svg.getBoundingClientRect().width;
  const dx = ((box.x + box.width / 2) - (ink.x + ink.width / 2)) / box.width * size * scale;
  const dy = ((box.y + box.height / 2) - (ink.y + ink.height / 2)) / box.height * size * scale;
  if (!size) return;
  svg.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${scale.toFixed(3)})`;
}
