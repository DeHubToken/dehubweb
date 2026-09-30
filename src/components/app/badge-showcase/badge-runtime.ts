/** WebView adapter; both renderers are the same modules used by the website. */
import { StickerStage, type StickerItem } from './sticker-stage';
import { MetalStage, type MetalBox } from './metal-stage';

interface Boot {
  items: (StickerItem & { label?: string })[];
  origin: number;
  metallic?: boolean;
  reducedMotion?: boolean;
  hero?: MetalBox;
}
const w = window as unknown as {
  __STICKER?: Boot;
  ReactNativeWebView?: { postMessage: (data: string) => void };
  dehubSticker?: unknown;
};
const post = (type: string, ok?: boolean) => w.ReactNativeWebView?.postMessage(JSON.stringify({ type, ok }));
const boot = w.__STICKER;
const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
let stage: StickerStage | MetalStage | null = null;
let hero = boot?.hero ?? { x: 0, y: 0, size: 1 };
if (boot && canvas) {
  try {
    const handlers = {
      onTap: () => post('tap'), onMiss: () => post('miss'), onInteract: () => post('interact'),
    };
    stage = boot.metallic ? new MetalStage(canvas, {
      ...handlers, hero: () => hero, reducedMotion: boot.reducedMotion,
      onError: () => post('failed'),
    }) : new StickerStage(canvas, handlers);
    stage.setItems(boot.items);
    void stage.show(boot.origin, { instant: true, hold: true }).then(ok => post('ready', ok)).catch(() => post('ready', false));
  } catch { post('ready', false); }
} else { post('ready', false); }
w.dehubSticker = {
  reveal: () => stage?.reveal(),
  show: (index: number, direction: 1 | -1) => {
    void stage?.show(index, { direction }).then(ok => { if (!ok) post('failed'); }).catch(() => post('failed'));
  },
  preload: (index: number) => stage?.preload(index),
  geometry: (box: MetalBox) => { hero = box; if (stage instanceof MetalStage) stage.layout(); },
  open: (from: MetalBox | null, fromArt: string | null, promote: boolean) => {
    if (stage instanceof MetalStage) void stage.open({ from, fromArt, promote, onLanded: () => post('landed') }).catch(() => post('failed'));
  },
  close: (home: MetalBox) => { if (stage instanceof MetalStage) stage.close(home, () => post('closed')); },
  skip: () => { if (stage instanceof MetalStage) stage.skip(); },
};
window.addEventListener('pagehide', () => { stage?.dispose(); stage = null; }, { once: true });
