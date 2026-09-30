import type { StickerItem } from './sticker-stage';

export interface MetalBox { x: number; y: number; size: number }
export interface MetalOpening {
  from?: MetalBox | null;
  fromArt?: string | null;
  promote?: boolean;
  onStarted?: () => void;
  onLanded: () => void;
}
export interface MetalOptions {
    hero: () => MetalBox;
    interactionElement?: HTMLElement;
    reducedMotion?: boolean;
    onTap?: () => void;
    onMiss?: () => void;
    onInteract?: () => void;
    onError?: () => void;
  }
export class MetalStage {
  constructor(canvas: HTMLCanvasElement, options: MetalOptions);
  attach(placeholder: HTMLCanvasElement, options: MetalOptions): void;
  setItems(items: (StickerItem & { label?: string })[]): void;
  preload(index: number): void;
  show(index: number, options?: { instant?: boolean; hold?: boolean; direction?: number }): Promise<boolean>;
  reveal(): void;
  layout(): void;
  open(options: MetalOpening): Promise<void>;
  skip(): void;
  close(home: MetalBox, onClosed: () => void): void;
  dispose(): void;
}
