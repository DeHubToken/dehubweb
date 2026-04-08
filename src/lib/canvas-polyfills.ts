/**
 * Polyfill for CanvasRenderingContext2D.roundRect
 * Not available until Safari 16 (iOS 16). Required for iOS 15 support.
 */
if (
  typeof CanvasRenderingContext2D !== 'undefined' &&
  !CanvasRenderingContext2D.prototype.roundRect
) {
  CanvasRenderingContext2D.prototype.roundRect = function (
    x: number,
    y: number,
    w: number,
    h: number,
    radii?: number | number[]
  ) {
    const r = typeof radii === 'number' ? radii : Array.isArray(radii) ? radii[0] ?? 0 : 0;
    const clampedR = Math.min(r, w / 2, h / 2);
    this.moveTo(x + clampedR, y);
    this.lineTo(x + w - clampedR, y);
    this.arcTo(x + w, y, x + w, y + clampedR, clampedR);
    this.lineTo(x + w, y + h - clampedR);
    this.arcTo(x + w, y + h, x + w - clampedR, y + h, clampedR);
    this.lineTo(x + clampedR, y + h);
    this.arcTo(x, y + h, x, y + h - clampedR, clampedR);
    this.lineTo(x, y + clampedR);
    this.arcTo(x, y, x + clampedR, y, clampedR);
    this.closePath();
  };
}
