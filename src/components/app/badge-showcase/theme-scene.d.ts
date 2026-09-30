export const BADGE_WORLDS: { id: string; color: string; bg: string }[];
export function createBadgeScene(canvas: HTMLCanvasElement, theme: string): {
  prepare(oldArt: CanvasImageSource, newArt: CanvasImageSource, tier?: number): void;
  iceSource: string | null;
  setIce(image: CanvasImageSource): void;
  geometry(width: number, height: number, hero: { x: number; y: number; size: number }): void;
  start(from: { x: number; y: number; size: number } | null, promotion: boolean): void;
  duration(): number;
  draw(time: number): void;
  still(box?: { x: number; y: number; size: number }): void;
  clear(): void;
  dispose(): void;
};
