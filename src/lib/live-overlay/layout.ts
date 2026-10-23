import type { OverlayRect, OverlayWidget } from './types';

/**
 * Where a widget lands on screen.
 *
 * Widgets are placed against the PICTURE, not the player box. A live video is
 * drawn `object-contain`, so a landscape stream in a portrait card sits in a
 * band with black above and below; a widget laid out at the top of the frame
 * belongs at the top of that band, not the top of the card. Getting this wrong
 * puts the creator's goal bar in the letterbox.
 */

export interface PictureRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The area `object-contain` actually paints a `videoW`×`videoH` frame into. */
export function containedPicture(boxW: number, boxH: number, videoW: number, videoH: number): PictureRect {
  if (!(boxW > 0) || !(boxH > 0)) return { left: 0, top: 0, width: 0, height: 0 };
  // Before the first frame there is no intrinsic size; the box is the best
  // guess, and the layer redraws the moment metadata arrives.
  if (!(videoW > 0) || !(videoH > 0)) return { left: 0, top: 0, width: boxW, height: boxH };

  const scale = Math.min(boxW / videoW, boxH / videoH);
  const width = videoW * scale;
  const height = videoH * scale;
  return { left: (boxW - width) / 2, top: (boxH - height) / 2, width, height };
}

/** A portrait picture uses the widget's portrait layout. Square counts as landscape. */
export function isPortraitPicture(videoW: number, videoH: number): boolean {
  return videoW > 0 && videoH > 0 && videoH > videoW;
}

export function rectFor(widget: OverlayWidget, portrait: boolean): OverlayRect {
  return portrait ? widget.portrait ?? widget.landscape : widget.landscape;
}

/** Pixel box for a widget inside the picture. */
export function placeWidget(rect: OverlayRect, picture: PictureRect): PictureRect {
  return {
    left: picture.left + rect.x * picture.width,
    top: picture.top + rect.y * picture.height,
    width: rect.w * picture.width,
    height: rect.h * picture.height,
  };
}

/** Draw order: by z, then by position in the list so ties are stable. */
export function drawOrder(widgets: OverlayWidget[]): OverlayWidget[] {
  return widgets
    .map((widget, index) => ({ widget, index }))
    .sort((a, b) => (a.widget.z ?? 0) - (b.widget.z ?? 0) || a.index - b.index)
    .map(({ widget }) => widget);
}
