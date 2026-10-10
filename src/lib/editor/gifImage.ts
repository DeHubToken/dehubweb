import { GIF_TIMELINE_RUNTIME } from "./gifTimelineRuntime";

type GifCanvas = { frame: (seconds: number) => HTMLCanvasElement };
const createGifCanvas = new Function(GIF_TIMELINE_RUNTIME + "; return createGifCanvas;")() as (bytes: Uint8Array) => GifCanvas;
const timelines = new WeakMap<HTMLImageElement, GifCanvas>();

export async function prepareGifImage(image: HTMLImageElement, url: string, signal?: AbortSignal): Promise<void> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("GIF could not be loaded");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (signal?.aborted) throw new DOMException("GIF load cancelled", "AbortError");
  const timeline = createGifCanvas(bytes);
  timelines.set(image, timeline);
}

export function gifImageFrame(image: HTMLImageElement, seconds: number): CanvasImageSource {
  return timelines.get(image)?.frame(seconds) ?? image;
}

export function releaseGifImage(image: HTMLImageElement): void {
  timelines.delete(image);
}
