/**
 * Creator Flow — group frame.
 * ===========================
 * A rectangle behind a set of nodes: moving it moves them, it can be locked so
 * none of them drag, arranged into a grid, or dissolved.
 */
import { useRef } from 'react';
import { LayoutGrid, Lock, Trash2, Ungroup, Unlock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { NodeProps } from '@xyflow/react';
import { arrangeNodes } from '@/lib/creator/flow/arrangeNodes';
import type { FlowNode } from '@/lib/creator/flow/types';
import { useCreatorFlowStore } from '@/store/creatorFlowStore';
import { cn } from '@/lib/utils';
import { useReadOnly } from '../FlowActionsContext';

export default function GroupNode({ id, data, selected }: NodeProps<FlowNode>) {
  const { t } = useTranslation();
  const readOnly = useReadOnly();
  const updateNodeData = useCreatorFlowStore((s) => s.updateNodeData);
  const onNodesChange = useCreatorFlowStore((s) => s.onNodesChange);
  const ref = useRef<HTMLDivElement>(null);
  const memberIds = (data.memberIds as string[] | undefined) ?? [];
  const locked = !!data.locked;

  const Btn = ({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className="flex h-7 w-7 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );

  return (
    <div
      ref={ref}
      className={cn('relative h-full w-full rounded-2xl border border-dashed transition', selected ? 'border-white/50 bg-white/[0.04]' : 'border-white/20 bg-white/[0.02]')}
    >
      <span className="absolute -top-5 left-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
        {locked && <Lock size={10} />}
        {data.label as string}
      </span>

      {selected && !readOnly && (
        <div className="absolute left-1/2 z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-white/10 bg-zinc-950/95 px-1.5 py-1 shadow-xl backdrop-blur-xl" style={{ bottom: 'calc(100% + 24px)' }}>
          <Btn title={t('creatorFlow.arrange')} onClick={() => arrangeNodes(memberIds, { groupId: id })}>
            <LayoutGrid size={13} />
          </Btn>
          <Btn title={locked ? t('creatorFlow.unlockGroup') : t('creatorFlow.lockGroup')} onClick={() => updateNodeData(id, { locked: !locked })}>
            {locked ? <Unlock size={13} /> : <Lock size={13} />}
          </Btn>
          <Btn title={t('creatorFlow.ungroup')} onClick={() => onNodesChange([{ type: 'remove', id }])}>
            <Ungroup size={13} />
          </Btn>
          <span className="mx-0.5 h-4 w-px bg-white/10" />
          <Btn title={t('creatorFlow.deleteGroupAndMembers')} onClick={() => onNodesChange([{ type: 'remove', id }, ...memberIds.map((m) => ({ type: 'remove' as const, id: m }))])}>
            <Trash2 size={13} />
          </Btn>
        </div>
      )}
    </div>
  );
}
