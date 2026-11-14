import type { Group } from 'three';

export const BADGE_LOOKS: string[];
export interface BadgeLookScene {
  name: string;
  decor: Group;
  update(time: number, presence: number, scale: number, unit?: number): void;
  dispose(): void;
}
export function createBadgeLook(name: string): BadgeLookScene;
