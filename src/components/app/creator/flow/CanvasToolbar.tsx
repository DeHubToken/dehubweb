/**
 * Creator Flow — the floating left toolbar.
 * =========================================
 * Adapted from HeliosGen's CanvasToolbar (MIT) — see LICENSE-HeliosGen.
 */
import { Hand, MousePointer2, Plus, Redo2, Share2, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export type ToolId = 'select' | 'hand';

interface Props {
  activeTool: ToolId;
  onToolChange: (tool: ToolId) => void;
  onAddNode: (anchor: DOMRect) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onShare: () => void;
  isPublic: boolean;
}

function Btn({ title, active, dimmed, onClick, children }: { title: string; active?: boolean; dimmed?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] transition',
        active ? 'bg-white text-black' : 'text-white/60 hover:bg-white/10 hover:text-white',
        dimmed && 'opacity-35',
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="my-0.5 block h-px w-5 bg-white/10" />;
}

export default function CanvasToolbar({ activeTool, onToolChange, onAddNode, onUndo, onRedo, canUndo, canRedo, onShare, isPublic }: Props) {
  const { t } = useTranslation();
  return (
    <div
      className="absolute left-4 top-1/2 z-[100] flex -translate-y-1/2 select-none flex-col items-center gap-0.5 rounded-2xl border border-white/10 bg-zinc-950/90 px-[5px] py-2 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl"
      role="toolbar"
      aria-label={t('creatorFlow.toolbar')}
    >
      <button
        type="button"
        title={t('creatorFlow.addNodeShortcut')}
        aria-label={t('creatorFlow.addNode')}
        onClick={(e) => onAddNode((e.currentTarget as HTMLElement).getBoundingClientRect())}
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] border border-white/20 bg-white/10 text-white transition hover:border-white/40 hover:bg-white/20"
      >
        <Plus size={16} strokeWidth={2.5} />
      </button>

      <Divider />

      <Btn title={t('creatorFlow.toolSelect')} active={activeTool === 'select'} onClick={() => onToolChange('select')}>
        <MousePointer2 size={15} strokeWidth={1.8} />
      </Btn>
      <Btn title={t('creatorFlow.toolHand')} active={activeTool === 'hand'} onClick={() => onToolChange('hand')}>
        <Hand size={15} strokeWidth={1.8} />
      </Btn>

      <Divider />

      <Btn title={t('creatorFlow.undo')} dimmed={!canUndo} onClick={onUndo}>
        <Undo2 size={15} strokeWidth={1.8} />
      </Btn>
      <Btn title={t('creatorFlow.redo')} dimmed={!canRedo} onClick={onRedo}>
        <Redo2 size={15} strokeWidth={1.8} />
      </Btn>

      <span className="my-1 block h-px w-full bg-white/10" />

      <Btn title={t('creatorFlow.shareFlow')} active={isPublic} onClick={onShare}>
        <Share2 size={15} strokeWidth={1.8} />
      </Btn>
    </div>
  );
}
