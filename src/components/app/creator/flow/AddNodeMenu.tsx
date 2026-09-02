/**
 * Creator Flow — the "+" menu.
 * ============================
 * Lists every node type with a search box, and places the chosen one next to the
 * node nearest the middle of the view (or in the middle, on an empty canvas).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FALLBACK_SIZE, NODES, NODE_SIZE, getDefaultNodeSize, getLastNodeSettings, type NodeCategory } from '@/lib/creator/flow/nodeTypes';
import type { NodeData } from '@/lib/creator/flow/types';
import { uid } from '@/lib/creator/flow/types';
import { useCreatorFlowStore } from '@/store/creatorFlowStore';
import { cn } from '@/lib/utils';

const TOOLBAR_OFFSET_PX = 80;

interface Props {
  anchorRect: DOMRect;
  onClose: () => void;
}

export default function AddNodeMenu({ anchorRect, onClose }: Props) {
  const { t } = useTranslation();
  const { screenToFlowPosition } = useReactFlow();
  const addNode = useCreatorFlowStore((s) => s.addNode);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const rectsOverlap = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number, pad = 0) =>
    ax - pad < bx + bw && ax + aw + pad > bx && ay - pad < by + bh && ay + ah + pad > by;

  /** Place a new node of `type` beside the node nearest the view centre. */
  const addNextToToolbar = useCallback(
    (type: string, extra?: Partial<NodeData>) => {
      const container = document.querySelector('.react-flow') as HTMLElement | null;
      const rect = container?.getBoundingClientRect();
      const state = useCreatorFlowStore.getState();
      const size = getDefaultNodeSize(type, state.lastNodeSize);
      const GAP = 40;
      const nodesNow = state.nodes;

      let x: number;
      let y: number;
      if (nodesNow.length === 0) {
        const screenX = (rect?.left ?? 0) + TOOLBAR_OFFSET_PX;
        const screenY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
        const p = screenToFlowPosition({ x: screenX, y: screenY });
        x = p.x;
        y = p.y - size.h / 2;
      } else {
        const centre = screenToFlowPosition({
          x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
          y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
        });
        let nearest = nodesNow[0];
        let best = Infinity;
        for (const n of nodesNow) {
          const s = NODE_SIZE[n.type ?? ''] ?? FALLBACK_SIZE;
          const d = Math.hypot(n.position.x + s.w / 2 - centre.x, n.position.y + s.h / 2 - centre.y);
          if (d < best) {
            best = d;
            nearest = n;
          }
        }
        const ns = nearest.measured ?? NODE_SIZE[nearest.type ?? ''] ?? FALLBACK_SIZE;
        const nw = (ns as { width?: number; w?: number }).width ?? (ns as { w?: number }).w ?? FALLBACK_SIZE.w;
        const nh = (ns as { height?: number; h?: number }).height ?? (ns as { h?: number }).h ?? FALLBACK_SIZE.h;
        x = nearest.position.x + nw + GAP;
        y = nearest.position.y + nh / 2 - size.h / 2;
        // Slide right until the slot is free.
        for (let i = 0; i < 20; i += 1) {
          const clash = nodesNow.some((n) => {
            const s = NODE_SIZE[n.type ?? ''] ?? FALLBACK_SIZE;
            return rectsOverlap(x, y, size.w, size.h, n.position.x, n.position.y, n.measured?.width ?? s.w, n.measured?.height ?? s.h, 12);
          });
          if (!clash) break;
          x += size.w + GAP;
        }
      }

      const id = `${type}-${uid()}`;
      addNode({
        id,
        type,
        position: { x, y },
        style: type === 'imageInputNode' || type === 'videoInputNode' ? { width: size.w } : { width: size.w, height: size.h },
        data: { label: '', status: 'idle', ...getLastNodeSettings(type, nodesNow), ...extra },
      });
      onClose();
    },
    [addNode, onClose, screenToFlowPosition],
  );

  const q = query.trim().toLowerCase();
  const visible = NODES.filter((n) => !q || t(n.labelKey).toLowerCase().includes(q) || t(n.descriptionKey).toLowerCase().includes(q));
  const categories: NodeCategory[] = ['generators', 'resources'];

  return (
    <div
      ref={menuRef}
      className="cflow-fade-up fixed z-[300] w-[280px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl"
      style={{ left: anchorRect.right + 12, top: Math.max(12, Math.min(anchorRect.top - 40, window.innerHeight - 420)) }}
      role="menu"
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
        <Search size={13} className="text-white/40" />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && visible[0]) addNextToToolbar(visible[0].type);
          }}
          placeholder={t('creatorFlow.searchNodes')}
          className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/30"
        />
      </div>
      <div className="max-h-[360px] overflow-y-auto p-1.5">
        {categories.map((cat) => {
          const items = visible.filter((n) => n.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat} className="mb-1">
              <p className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">{t(cat === 'generators' ? 'creatorFlow.generators' : 'creatorFlow.resources')}</p>
              {items.map((n) => (
                <button
                  key={n.type}
                  type="button"
                  role="menuitem"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/dehub-flow-node', n.type);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => addNextToToolbar(n.type)}
                  className={cn('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/10')}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white">{n.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-white">{t(n.labelKey)}</span>
                    <span className="block truncate text-[11px] text-white/45">{t(n.descriptionKey)}</span>
                  </span>
                </button>
              ))}
            </div>
          );
        })}
        {visible.length === 0 && <p className="px-3 py-6 text-center text-[12px] text-white/40">{t('creatorFlow.noNodesMatch')}</p>}
      </div>
      <p className="border-t border-white/10 px-3 py-2 text-[10px] text-white/30">{t('creatorFlow.dragNodeHint')}</p>
    </div>
  );
}
