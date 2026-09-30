import type { StickerItem } from './sticker-stage';
interface Box { x: number; y: number; size: number }
export class ThemeStage {
  constructor(canvas: HTMLCanvasElement, options: {
    theme: string;
    hero: () => Box;
    interactionElement?: HTMLElement;
    reducedMotion?: boolean;
    onTap?: () => void;
    onMiss?: () => void;
    onInteract?: () => void;
    onError?: () => void;
  });
  setItems(items: (StickerItem & { label?: string })[]): void;
  preload(index: number): void;
  show(index: number, options?: { instant?: boolean; hold?: boolean; direction?: number }): Promise<boolean>;
  reveal(): void;
  layout(): void;
  open(options: { from?: Box | null; fromArt?: string | null; promote?: boolean; onLanded: () => void }): Promise<void>;
  skip(): void;
  close(home: Box, onClosed: () => void): void;
  dispose(): void;
}
