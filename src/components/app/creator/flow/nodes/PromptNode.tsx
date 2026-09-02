/**
 * Creator Flow — text node.
 * =========================
 * A prompt source with a JSON/YAML mode: flip it and the body is validated
 * and pretty-printed as structured data, which is how several models want
 * their prompts. `@Label` mentions of wired image nodes order the references.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Braces, Copy, CopyPlus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { NodeProps } from '@xyflow/react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { FlowNode, NodeData } from '@/lib/creator/flow/types';
import { uid } from '@/lib/creator/flow/types';
import { useCreatorFlowStore } from '@/store/creatorFlowStore';
import { AboveLabel, CornerResizer, IoHandle, NodeActionBar, NodeCard, useHandleConnected, useInstantHandleHide } from '../NodeChrome';
import { useReadOnly } from '../FlowActionsContext';

type TextMode = 'text' | 'json' | 'yaml';
const MODE_KEY = 'dehub-creator-flow-text-mode';

function loadLastMode(): TextMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'json' || v === 'yaml' ? v : 'text';
  } catch {
    return 'text';
  }
}

function jsonErrorPos(text: string): number | null {
  try {
    JSON.parse(text);
    return null;
  } catch (e) {
    const m = /position (\d+)/.exec((e as Error).message);
    return m ? Number(m[1]) : 0;
  }
}

export default function PromptNode({ id, data, selected }: NodeProps<FlowNode>) {
  const { t } = useTranslation();
  const readOnly = useReadOnly();
  const updateNodeData = useCreatorFlowStore((s) => s.updateNodeData);
  const onNodesChange = useCreatorFlowStore((s) => s.onNodesChange);
  const addNode = useCreatorFlowStore((s) => s.addNode);
  const insertEdge = useCreatorFlowStore((s) => s.insertEdge);
  const edges = useCreatorFlowStore((s) => s.edges);
  const nodes = useCreatorFlowStore((s) => s.nodes);

  const cardRef = useRef<HTMLDivElement>(null);
  useInstantHandleHide(selected, cardRef);

  const storePrompt = (data.prompt as string) ?? '';
  const [local, setLocal] = useState(storePrompt);
  const [mode, setModeState] = useState<TextMode>(() => (data.textMode as TextMode | undefined) ?? loadLastMode());
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceConnected = useHandleConnected(id, undefined, 'source');

  // External edits (undo, DB load) win over the local draft.
  useEffect(() => {
    setLocal(storePrompt);
  }, [storePrompt]);

  const commit = useCallback(
    (text: string) => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
      commitTimer.current = setTimeout(() => updateNodeData(id, { prompt: text }), 250);
    },
    [id, updateNodeData],
  );

  const setMode = useCallback(
    (next: TextMode) => {
      setModeState(next);
      updateNodeData(id, { textMode: next });
      try {
        localStorage.setItem(MODE_KEY, next);
      } catch {
        /* ignore */
      }
    },
    [id, updateNodeData],
  );

  const errorPos = useMemo(() => (mode === 'json' && local.trim() ? jsonErrorPos(local) : null), [mode, local]);

  /** Labels of image nodes wired into the generator this text feeds. */
  const mentionable = useMemo(() => {
    const target = edges.find((e) => e.source === id)?.target;
    if (!target) return [] as string[];
    return edges
      .filter((e) => e.target === target && (e.targetHandle === 'image' || e.targetHandle === 'startFrame'))
      .map((e) => nodes.find((n) => n.id === e.source)?.data.label as string | undefined)
      .filter((l): l is string => !!l);
  }, [edges, nodes, id]);

  const toggleMode = () => {
    if (mode !== 'text') {
      setMode('text');
      return;
    }
    try {
      const formatted = JSON.stringify(JSON.parse(local), null, 2);
      setLocal(formatted);
      updateNodeData(id, { prompt: formatted });
      setMode('json');
    } catch {
      const looksLikeYaml = /^(\s*[\w\-./]+\s*:|---|\s*-\s)/m.test(local);
      setMode(looksLikeYaml ? 'yaml' : 'json');
    }
  };

  const handleDuplicate = () => {
    const self = nodes.find((n) => n.id === id);
    if (!self) return;
    addNode({ ...self, id: `promptNode-${uid()}`, position: { x: self.position.x + 30, y: self.position.y + 30 }, selected: true, data: { ...self.data, label: '' } as NodeData });
  };

  const handleDelete = () => {
    onNodesChange([{ type: 'remove', id }]);
  };

  const hasError = !!data.hasError;

  return (
    <NodeCard cardRef={cardRef} error={hasError} onErrorEnd={() => updateNodeData(id, { hasError: false })} style={{ minWidth: 220 }}>
      {!readOnly && <CornerResizer minWidth={200} minHeight={90} />}
      <AboveLabel text={data.label as string} />

      {!readOnly && (
        <NodeActionBar
          visible={selected}
          actions={[
            { icon: <Copy size={13} />, title: t('creatorFlow.copyPrompt'), onClick: () => navigator.clipboard.writeText(local).then(() => toast.success(t('creatorFlow.copied'))).catch(() => undefined) },
            { icon: <CopyPlus size={13} />, title: t('creatorFlow.duplicateNode'), onClick: handleDuplicate },
            { icon: <Trash2 size={13} />, title: t('creatorFlow.deleteNode'), onClick: handleDelete, separatorBefore: true },
          ]}
        />
      )}

      <div className="flex shrink-0 items-center gap-2 px-2.5 pb-1 pt-2" onMouseDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={toggleMode}
          disabled={readOnly}
          className={cn(
            'flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition',
            mode !== 'text' ? 'border-white/40 bg-white/15 text-white' : 'border-white/10 bg-white/5 text-white/45 hover:text-white/80',
          )}
          title={t('creatorFlow.jsonModeHint')}
        >
          <Braces size={11} />
          {mode === 'yaml' ? 'YAML' : 'JSON'}
        </button>
        {mode === 'json' && errorPos !== null && (
          <span className="text-[10px] text-white/60">{t('creatorFlow.invalidJsonAt', { pos: errorPos })}</span>
        )}
        {mentionable.length > 0 && !readOnly && (
          <span className="ml-auto flex items-center gap-1 overflow-hidden">
            {mentionable.slice(0, 3).map((label) => (
              <button
                key={label}
                type="button"
                title={t('creatorFlow.insertMention', { label })}
                onClick={() => {
                  const next = `${local}${local && !local.endsWith(' ') ? ' ' : ''}@${label} `;
                  setLocal(next);
                  commit(next);
                }}
                className="truncate rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60 hover:text-white"
              >
                @{label}
              </button>
            ))}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 px-2.5 pb-2.5">
        <div className="nowheel h-full overflow-hidden rounded-lg border border-white/10 bg-black/40" onMouseDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
          <textarea
            value={local}
            readOnly={readOnly}
            spellCheck={mode === 'text'}
            onChange={(e) => {
              setLocal(e.target.value);
              commit(e.target.value);
            }}
            onBlur={() => {
              if (commitTimer.current) clearTimeout(commitTimer.current);
              if (local !== storePrompt) updateNodeData(id, { prompt: local });
            }}
            onPaste={
              mode === 'json'
                ? (e) => {
                    // Auto-format pasted JSON so the body is readable at once.
                    const pasted = e.clipboardData.getData('text');
                    try {
                      const formatted = JSON.stringify(JSON.parse(pasted), null, 2);
                      e.preventDefault();
                      setLocal(formatted);
                      commit(formatted);
                    } catch {
                      /* plain paste */
                    }
                  }
                : undefined
            }
            placeholder={mode === 'text' ? t('creatorFlow.promptPlaceholder') : mode === 'json' ? '{\n  "subject": "…"\n}' : 'subject: …'}
            className={cn('cflow-textarea nodrag', mode !== 'text' && 'is-code', errorPos !== null && 'cflow-json-error')}
          />
        </div>
      </div>

      <IoHandle type="source" kind="prompt" connected={sourceConnected} title={t('creatorFlow.handleTextOut')} />
    </NodeCard>
  );
}
