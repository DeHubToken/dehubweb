/**
 * Creator Flow — edge and handle styling.
 * =======================================
 *
 * Most node canvases colour every handle role. DeHub's design system is black, white
 * and zinc only, so a role is told apart by weight and dash instead: text is
 * a thin solid line, media is thicker, video is dashed. The icons on the
 * handles carry the rest.
 */
import type { CSSProperties } from 'react';

export type HandleRole = 'prompt' | 'image' | 'startFrame' | 'endFrame' | 'referenceVideo' | 'default';

const MEDIA_HANDLES = new Set(['image', 'startFrame', 'endFrame']);
const VIDEO_HANDLES = new Set(['referenceVideo']);

export const EDGE_STROKE = 'rgba(255,255,255,0.42)';
export const EDGE_STROKE_ACTIVE = 'rgba(255,255,255,0.9)';

export function edgeStyle(targetHandle?: string | null): CSSProperties {
  const key = targetHandle ?? 'default';
  const style: CSSProperties = { stroke: EDGE_STROKE, strokeWidth: 1.5 };
  if (MEDIA_HANDLES.has(key)) style.strokeWidth = 2.5;
  if (VIDEO_HANDLES.has(key)) {
    style.strokeWidth = 2.5;
    style.strokeDasharray = '7 4';
  }
  return style;
}

/** What a target handle accepts, for the tooltip and the picker. */
export function handleRoleLabelKey(handle: string): string {
  switch (handle) {
    case 'prompt':
      return 'creatorFlow.handlePrompt';
    case 'image':
      return 'creatorFlow.handleImage';
    case 'startFrame':
      return 'creatorFlow.handleStartFrame';
    case 'endFrame':
      return 'creatorFlow.handleEndFrame';
    case 'referenceVideo':
      return 'creatorFlow.handleReferenceVideo';
    default:
      return 'creatorFlow.handleInput';
  }
}
