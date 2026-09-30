import { MetalStage, type MetalOptions } from './metal-stage';
import type { StickerItem } from './sticker-stage';

type Item = StickerItem & { label?: string };
type Prepared = { stage: MetalStage; host: HTMLDivElement; ready: Promise<boolean>; timer: number; src: string; released: boolean };
let prepared: Prepared | undefined;

/** One held context, prepared before a click, rather than a renderer per feed badge. */
export function warmMetalBadge(item: Item, replace = true) {
  if (document.hidden) return;
  if (prepared) {
    const entry = prepared;
    if (replace && entry.src !== item.src) {
      entry.src = item.src;
      // Reuse the lighting and shader programs as the pointer crosses badges.
      entry.ready = entry.ready.then(() => {
        if (entry.released) return false;
        entry.stage.setItems([item]);
        return entry.stage.show(0, { hold: true, instant: true });
      }).catch(() => false);
    }
    clearTimeout(entry.timer);
    entry.timer = window.setTimeout(() => release(entry), 60_000);
    return;
  }
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, { position: 'fixed', width: '256px', height: '256px', left: '-512px', top: '0', visibility: 'hidden', pointerEvents: 'none' });
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { width: '100%', height: '100%' });
  host.append(canvas);
  document.body.append(host);
  try {
    const stage = new MetalStage(canvas, { hero: () => ({ x: -512, y: 0, size: 256 }) });
    stage.setItems([item]);
    const entry: Prepared = { stage, host, src: item.src, timer: 0, released: false, ready: stage.show(0, { hold: true, instant: true }).catch(() => false) };
    prepared = entry;
    entry.timer = window.setTimeout(() => release(entry), 60_000);
    void entry.ready.then(ok => { if (!ok && prepared === entry) release(entry); }).catch(() => { if (prepared === entry) release(entry); });
  } catch { host.remove(); }
}

function release(entry: Prepared) {
  entry.released = true;
  clearTimeout(entry.timer);
  entry.stage.dispose();
  entry.host.remove();
  if (prepared === entry) prepared = undefined;
}

export async function acquireMetalStage(canvas: HTMLCanvasElement, options: MetalOptions, src: string) {
  const entry = prepared;
  if (!entry || entry.src !== src) {
    if (entry) release(entry);
    return new MetalStage(canvas, options);
  }
  prepared = undefined;
  clearTimeout(entry.timer);
  try {
    if (!await entry.ready) throw new Error('Badge preparation failed');
    entry.stage.attach(canvas, options);
    entry.host.remove();
    return entry.stage;
  } catch {
    release(entry);
    return new MetalStage(canvas, options);
  }
}
