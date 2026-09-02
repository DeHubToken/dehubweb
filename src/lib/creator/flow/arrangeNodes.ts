/**
 * Creator Flow — arrange a selection into a grid.
 * ===============================================
 * Adapted from HeliosGen's lib/arrangeNodes.ts (MIT) — see LICENSE-HeliosGen.
 * The overall centre never moves: with a group id it centres on the group
 * rectangle, otherwise on the selection's current bounding box.
 */
import type { FlowNode } from './types';
import { useCreatorFlowStore } from '@/store/creatorFlowStore';

const ANIM = 'transform 0.38s cubic-bezier(0.25, 0.46, 0.45, 0.94)';

function sizeOf(n: FlowNode): { w: number; h: number } {
  return {
    w: n.measured?.width ?? (typeof n.width === 'number' ? n.width : 240),
    h: n.measured?.height ?? (typeof n.height === 'number' ? n.height : 160),
  };
}

export function arrangeNodes(nodeIds: string[], options?: { groupId?: string; gap?: number }) {
  const { groupId, gap = 56 } = options ?? {};
  const state = useCreatorFlowStore.getState();
  const pool = state.nodes.filter((n) => nodeIds.includes(n.id));
  if (pool.length < 2) return;

  const sorted = [...pool].sort((a, b) =>
    a.position.x !== b.position.x ? a.position.x - b.position.x : a.position.y - b.position.y,
  );

  const cols = sorted.length <= 4 ? sorted.length : Math.ceil(Math.sqrt(sorted.length));
  const rows: FlowNode[][] = [];
  for (let i = 0; i < sorted.length; i += cols) rows.push(sorted.slice(i, i + cols));

  const colWidths: number[] = Array(cols).fill(0);
  for (const row of rows) row.forEach((n, ci) => { colWidths[ci] = Math.max(colWidths[ci], sizeOf(n).w); });
  const rowHeights = rows.map((row) => Math.max(...row.map((n) => sizeOf(n).h)));

  const totalW = colWidths.reduce((s, w) => s + w, 0) + gap * (cols - 1);
  const totalH = rowHeights.reduce((s, h) => s + h, 0) + gap * (rows.length - 1);

  let centerX: number;
  let centerY: number;
  if (groupId) {
    const g = state.nodes.find((n) => n.id === groupId);
    const gw = g?.measured?.width ?? (g?.style?.width as number | undefined) ?? 400;
    const gh = g?.measured?.height ?? (g?.style?.height as number | undefined) ?? 300;
    centerX = (g?.position.x ?? 0) + gw / 2;
    centerY = (g?.position.y ?? 0) + gh / 2;
  } else {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of sorted) {
      const { w, h } = sizeOf(n);
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + w);
      maxY = Math.max(maxY, n.position.y + h);
    }
    centerX = (minX + maxX) / 2;
    centerY = (minY + maxY) / 2;
  }

  const startX = centerX - totalW / 2;
  const startY = centerY - totalH / 2;
  const targets: Record<string, { x: number; y: number }> = {};
  let y = startY;
  rows.forEach((row, ri) => {
    let x = startX;
    row.forEach((n, ci) => {
      targets[n.id] = { x, y };
      x += colWidths[ci] + gap;
    });
    y += rowHeights[ri] + gap;
  });

  const updated = state.nodes.map((n) => {
    const target = targets[n.id];
    if (!target) return n;
    return { ...n, position: target, style: { ...n.style, transition: ANIM } };
  });
  state.replaceNodes(updated);

  setTimeout(() => {
    const cleaned: FlowNode[] = useCreatorFlowStore.getState().nodes.map((n) => {
      if (!targets[n.id]) return n;
      const { transition: _t, ...rest } = n.style ?? {};
      return { ...n, style: rest };
    });
    useCreatorFlowStore.getState().replaceNodes(cleaned);
  }, 450);
}
