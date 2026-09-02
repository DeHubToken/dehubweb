/**
 * Creator Flow — the edge with a scissors button on hover.
 * ========================================================
 * Adapted from HeliosGen's CuttableEdge (MIT) — see LICENSE-HeliosGen.
 * A bezier that dims when unrelated to the selection, fades out while its
 * node is being deleted, and grows a cut button under the cursor.
 */
import { useEffect, useRef, useState } from 'react';
import { EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from '@xyflow/react';
import { Scissors } from 'lucide-react';
import { edgeStyle } from '@/lib/creator/flow/edgeStyles';

export default function CuttableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  targetHandleId,
  markerEnd,
  data,
  selected,
}: EdgeProps) {
  const edgeData = data as Record<string, unknown> | undefined;
  const dying = edgeData?.dying === true;
  const error = edgeData?.error === true;
  const dimmed = edgeData?.dimmed === true;

  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { screenToFlowPosition, deleteElements } = useReactFlow();

  const style = edgeStyle(targetHandleId);
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });

  useEffect(() => () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
  }, []);

  const onMove = (e: React.MouseEvent) => {
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setPos(p);
  };

  return (
    <g
      onMouseEnter={() => {
        if (leaveTimer.current) clearTimeout(leaveTimer.current);
        setVisible(true);
      }}
      onMouseLeave={() => {
        leaveTimer.current = setTimeout(() => setVisible(false), 120);
      }}
      onMouseMove={onMove}
      style={{ opacity: dying ? 0 : dimmed ? 0.25 : 1, transition: 'opacity 300ms' }}
    >
      {/* Wide invisible hit area so the edge is easy to hover. */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={18} className="react-flow__edge-interaction" />
      <path
        id={id}
        d={path}
        fill="none"
        markerEnd={markerEnd}
        className="react-flow__edge-path"
        style={{
          ...style,
          stroke: error ? '#fff' : selected ? 'rgba(255,255,255,0.9)' : (style.stroke as string),
          strokeWidth: error ? (Number(style.strokeWidth) || 2) + 1 : style.strokeWidth,
        }}
      />
      {visible && !dying && (
        <EdgeLabelRenderer>
          <button
            type="button"
            aria-label="Cut connection"
            className="nodrag nopan pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-zinc-950/95 text-white/80 shadow-xl backdrop-blur transition hover:border-white/50 hover:text-white"
            style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px)` }}
            onMouseEnter={() => {
              if (leaveTimer.current) clearTimeout(leaveTimer.current);
              setVisible(true);
            }}
            onClick={(e) => {
              e.stopPropagation();
              void deleteElements({ edges: [{ id }] });
            }}
          >
            <Scissors size={12} strokeWidth={2} />
          </button>
        </EdgeLabelRenderer>
      )}
    </g>
  );
}
