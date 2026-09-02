/**
 * Creator Flow — pieces every node shares.
 * ========================================
 * Adapted from HeliosGen's node components (MIT) — see LICENSE-HeliosGen.
 * The card shell, the label floating above it, the action pill that appears
 * when selected, the corner resize grip, typed input/output handles and the
 * warning shown when a required input is missing.
 */
import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Handle, NodeResizeControl, Position, useStore as useFlowStore } from '@xyflow/react';
import { AlertTriangle, ChevronDown, Film, Image as ImageIcon, Loader2, Type } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { NodeStatus } from '@/lib/creator/flow/types';

// ── Card ─────────────────────────────────────────────────────────────────────

interface NodeCardProps {
  cardRef?: React.Ref<HTMLDivElement>;
  className?: string;
  style?: React.CSSProperties;
  error?: boolean;
  onErrorEnd?: () => void;
  children: ReactNode;
}

export function NodeCard({ cardRef, className, style, error, onErrorEnd, children }: NodeCardProps) {
  return (
    <div
      ref={cardRef}
      className={cn('cflow-card flex h-full w-full flex-col', error && 'node-error-blink', className)}
      style={style}
      onAnimationEnd={onErrorEnd}
    >
      {children}
    </div>
  );
}

export function AboveLabel({ text }: { text: string }) {
  return <span className="cflow-above-label">{text}</span>;
}

/** Hide the handles at once on deselect instead of after the hover delay. */
export function useInstantHandleHide(selected: boolean, cardRef: React.RefObject<HTMLDivElement>) {
  const prev = useRef(selected);
  useEffect(() => {
    const was = prev.current;
    prev.current = selected;
    if (was && !selected && cardRef.current) {
      const el = cardRef.current;
      el.classList.add('handles-no-delay');
      const t = setTimeout(() => el.classList.remove('handles-no-delay'), 200);
      return () => {
        clearTimeout(t);
        el.classList.remove('handles-no-delay');
      };
    }
    return undefined;
  }, [selected, cardRef]);
}

/** Lift the React Flow node above its siblings while a menu is open. */
export function useElevateWhileOpen(cardRef: React.RefObject<HTMLDivElement>, open: boolean) {
  useEffect(() => {
    const rfNode = cardRef.current?.closest<HTMLElement>('.react-flow__node');
    if (!rfNode) return;
    if (open) {
      rfNode.style.zIndex = '10000';
      return () => {
        rfNode.style.zIndex = '';
      };
    }
    return undefined;
  }, [open, cardRef]);
}

// ── Action bar ───────────────────────────────────────────────────────────────

export interface NodeAction {
  icon: ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  /** A divider is drawn before this action. */
  separatorBefore?: boolean;
}

export function NodeActionBar({ visible, actions }: { visible: boolean; actions: NodeAction[] }) {
  return (
    <div
      className="absolute left-1/2 z-50 flex items-center gap-0.5 rounded-full border border-white/10 bg-zinc-950/95 px-1.5 py-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl"
      style={{
        bottom: 'calc(100% + 26px)',
        transform: `translateX(-50%) translateY(${visible ? '0px' : '6px'})`,
        opacity: visible ? 1 : 0,
        transition: 'opacity 160ms ease, transform 160ms ease',
        pointerEvents: visible ? 'auto' : 'none',
        whiteSpace: 'nowrap',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {actions.map((a, i) => (
        <React.Fragment key={i}>
          {a.separatorBefore && <span className="mx-0.5 h-4 w-px shrink-0 bg-white/10" />}
          <button
            type="button"
            title={a.title}
            aria-label={a.title}
            disabled={a.disabled}
            onClick={(e) => {
              e.stopPropagation();
              a.onClick();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full text-white/55 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            {a.icon}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Resize grip ──────────────────────────────────────────────────────────────

export function CornerResizer({ minWidth = 160, minHeight = 80, keepAspectRatio = false }: { minWidth?: number; minHeight?: number; keepAspectRatio?: boolean }) {
  return (
    <NodeResizeControl
      position="bottom-right"
      minWidth={minWidth}
      minHeight={minHeight}
      keepAspectRatio={keepAspectRatio}
      style={{ background: 'transparent', border: 'none', width: 18, height: 18, right: -2, bottom: -2, cursor: 'nwse-resize' }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" className="pointer-events-none text-white/30" aria-hidden>
        <path d="M16 6 6 16M16 11l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </NodeResizeControl>
  );
}

// ── Status ───────────────────────────────────────────────────────────────────

export function StatusDot({ status }: { status?: NodeStatus }) {
  const { t } = useTranslation();
  if (!status || status === 'idle') return null;
  const label = t(`creatorFlow.status_${status}`);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur">
      {status === 'running' || status === 'pending' ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <span className={cn('h-1.5 w-1.5 rounded-full', status === 'done' ? 'bg-white' : 'bg-white/40')} />
      )}
      {label}
    </span>
  );
}

export function MissingInputWarning({ messages }: { messages: string[] }) {
  const [open, setOpen] = useState(false);
  if (messages.length === 0) return null;
  return (
    <div
      className="absolute right-2 top-2 z-30"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white/80 backdrop-blur">
        <AlertTriangle className="h-3.5 w-3.5" />
      </span>
      {open && (
        <div className="cflow-fade-up absolute right-0 top-7 w-56 rounded-lg border border-white/10 bg-black/90 p-2 text-[11px] leading-snug text-zinc-300 shadow-xl backdrop-blur">
          {messages.map((m) => (
            <p key={m} className="py-0.5">
              {m}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Handles ──────────────────────────────────────────────────────────────────

export type HandleKind = 'prompt' | 'image' | 'video';

export const HANDLE_ICON: Record<HandleKind, ReactNode> = {
  prompt: <Type size={12} strokeWidth={2} />,
  image: <ImageIcon size={12} strokeWidth={2} />,
  video: <Film size={12} strokeWidth={2} />,
};

interface IoHandleProps {
  type: 'target' | 'source';
  id?: string;
  kind: HandleKind;
  /** Kinds of source this input accepts, for the connecting-state CSS. */
  accepts?: HandleKind[];
  connected?: boolean;
  error?: boolean;
  /** CSS `top` of the handle centre. */
  top?: string;
  title?: string;
  onHover?: (hovering: boolean) => void;
}

/** True when any edge touches this node's handle. */
export function useHandleConnected(nodeId: string, handleId: string | undefined, type: 'target' | 'source'): boolean {
  return useFlowStore((s) =>
    s.edges.some((e) =>
      type === 'target' ? e.target === nodeId && (e.targetHandle ?? null) === (handleId ?? null) : e.source === nodeId && (e.sourceHandle ?? null) === (handleId ?? null),
    ),
  );
}

export function IoHandle({ type, id, kind, accepts, connected, error, top = '50%', title, onHover }: IoHandleProps) {
  return (
    <Handle
      type={type}
      id={id}
      position={type === 'target' ? Position.Left : Position.Right}
      style={{ top }}
      title={title}
      data-kind={kind}
      data-accepts={(accepts ?? [kind]).join(' ')}
      className={cn('cflow-handle', connected && 'is-connected', error && 'is-error')}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
    >
      {HANDLE_ICON[kind]}
    </Handle>
  );
}

/** Tooltip that floats to the left of an input handle. */
export function HandleTip({ top, text }: { top: string; text: string }) {
  return (
    <div
      className="pointer-events-none absolute left-0 z-[1001] whitespace-nowrap rounded-lg border border-white/10 bg-black/90 px-2.5 py-1 text-[10px] text-zinc-200 shadow-xl backdrop-blur"
      style={{ top, transform: 'translate(calc(-100% - 34px), -50%)' }}
    >
      {text}
    </div>
  );
}

// ── Setting pill + menu ──────────────────────────────────────────────────────

export function Pill({ children, active, onClick, title }: { children: ReactNode; active?: boolean; onClick?: () => void; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className={cn(
        'flex h-6 items-center gap-1 rounded-full border px-2 text-[10.5px] font-medium backdrop-blur-xl transition',
        active ? 'border-white/40 bg-white/20 text-white' : 'border-white/15 bg-white/10 text-white/80 hover:border-white/30 hover:bg-white/15',
      )}
    >
      {children}
      {onClick && <ChevronDown className={cn('h-3 w-3 opacity-60 transition-transform', active && 'rotate-180')} />}
    </button>
  );
}

interface PillMenuProps<T extends string> {
  open: boolean;
  onClose: () => void;
  options: Array<{ value: T; label: string; hint?: string }>;
  value: T;
  onSelect: (v: T) => void;
  /** Anchor side. */
  align?: 'left' | 'right';
}

export function PillMenu<T extends string>({ open, onClose, options, value, onSelect, align = 'left' }: PillMenuProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
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
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className={cn(
        'nowheel cflow-fade-up absolute bottom-full z-[200] mb-1.5 max-h-56 min-w-[180px] overflow-y-auto rounded-xl border border-white/10 bg-zinc-950/95 p-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl',
        align === 'right' ? 'right-0' : 'left-0',
      )}
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(o.value);
            onClose();
          }}
          className={cn(
            'flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition',
            o.value === value ? 'bg-white/15 text-white' : 'text-zinc-300 hover:bg-white/10 hover:text-white',
          )}
        >
          <span className="truncate">{o.label}</span>
          {o.hint && <span className="shrink-0 text-[10px] text-zinc-500">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

/** Aspect ratio as a CSS `aspect-ratio` string. */
export function ratioCss(value: string | undefined, fallback = '1 / 1'): string {
  if (!value) return fallback;
  const m = value.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  return m ? `${m[1]} / ${m[2]}` : fallback;
}
