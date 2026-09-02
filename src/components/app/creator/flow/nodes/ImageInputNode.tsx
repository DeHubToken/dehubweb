/**
 * Creator Flow — reference image node.
 * ====================================
 * Adapted from HeliosGen's ImageInputNode (MIT) — see LICENSE-HeliosGen.
 * A picture from disk or a URL. Shown at once from a local data URL and
 * hosted in the background so the durable link is what gets saved and sent.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link2, Loader2, Trash2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { NodeProps } from '@xyflow/react';
import { toast } from 'sonner';
import { hostDataUrl } from '@/lib/creator/generationEngine';
import type { FlowNode } from '@/lib/creator/flow/types';
import { useCreatorFlowStore } from '@/store/creatorFlowStore';
import { AboveLabel, CornerResizer, IoHandle, NodeActionBar, NodeCard, useHandleConnected, useInstantHandleHide } from '../NodeChrome';
import { useReadOnly } from '../FlowActionsContext';

const MAX_BYTES = 20 * 1024 * 1024;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
}

export default function ImageInputNode({ id, data, selected }: NodeProps<FlowNode>) {
  const { t } = useTranslation();
  const readOnly = useReadOnly();
  const updateNodeData = useCreatorFlowStore((s) => s.updateNodeData);
  const onNodesChange = useCreatorFlowStore((s) => s.onNodesChange);
  const cardRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useInstantHandleHide(selected, cardRef);

  const [hosting, setHosting] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const src = (data.imageUrl as string | undefined) || (data.inputImage as string | undefined);
  const sourceConnected = useHandleConnected(id, undefined, 'source');

  const measure = useCallback(
    (url: string) => {
      const img = new Image();
      img.onload = () => updateNodeData(id, { imageNaturalRatio: `${img.naturalWidth} / ${img.naturalHeight}` });
      img.src = url;
    },
    [id, updateNodeData],
  );

  const attach = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        toast.error(t('creatorFlow.attachImageOnly'));
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error(t('creatorFlow.imageTooLarge'));
        return;
      }
      const dataUrl = await fileToDataUrl(file);
      updateNodeData(id, { inputImage: dataUrl, imageUrl: undefined, status: 'idle' });
      measure(dataUrl);
      // Host in the background: the runner does this anyway before a paid
      // job, but doing it now means the flow survives a reload with its image.
      setHosting(true);
      try {
        const hosted = await hostDataUrl(dataUrl);
        updateNodeData(id, { imageUrl: hosted });
      } catch {
        /* stays inline for this session */
      } finally {
        setHosting(false);
      }
    },
    [id, measure, t, updateNodeData],
  );

  // Drop straight onto the card.
  useEffect(() => {
    const el = cardRef.current;
    if (!el || readOnly) return;
    const onDrop = (e: DragEvent) => {
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      e.preventDefault();
      e.stopPropagation();
      void attach(file);
    };
    const onOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    el.addEventListener('drop', onDrop);
    el.addEventListener('dragover', onOver);
    return () => {
      el.removeEventListener('drop', onDrop);
      el.removeEventListener('dragover', onOver);
    };
  }, [attach, readOnly]);

  const applyUrl = () => {
    const url = urlDraft.trim();
    if (!/^https?:\/\//.test(url)) {
      toast.error(t('creatorFlow.invalidUrl'));
      return;
    }
    updateNodeData(id, { imageUrl: url, inputImage: undefined, status: 'idle' });
    measure(url);
    setUrlOpen(false);
    setUrlDraft('');
  };

  return (
    <NodeCard cardRef={cardRef} error={!!data.hasError} onErrorEnd={() => updateNodeData(id, { hasError: false })} style={{ minWidth: 160 }}>
      {!readOnly && <CornerResizer minWidth={140} minHeight={100} keepAspectRatio={!!src} />}
      <AboveLabel text={data.label as string} />
      {!readOnly && (
        <NodeActionBar
          visible={selected}
          actions={[
            { icon: <Upload size={13} />, title: t('creatorFlow.uploadImage'), onClick: () => fileRef.current?.click() },
            { icon: <Link2 size={13} />, title: t('creatorFlow.pasteUrl'), onClick: () => setUrlOpen((o) => !o) },
            { icon: <Trash2 size={13} />, title: t('creatorFlow.deleteNode'), onClick: () => onNodesChange([{ type: 'remove', id }]), separatorBefore: true },
          ]}
        />
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void attach(f);
          e.target.value = '';
        }}
      />

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[13px]">
        {src ? (
          <img src={src} alt={data.label as string} className="h-full w-full object-cover" draggable={false} />
        ) : (
          <button
            type="button"
            disabled={readOnly}
            onClick={() => fileRef.current?.click()}
            className="flex h-full min-h-[120px] w-full flex-col items-center justify-center gap-2 text-white/40 transition hover:text-white/70"
          >
            <Upload size={18} />
            <span className="text-[11px]">{t('creatorFlow.dropOrUpload')}</span>
          </button>
        )}
        {hosting && (
          <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 backdrop-blur">
            <Loader2 size={12} className="animate-spin text-white" />
          </span>
        )}
        {urlOpen && !readOnly && (
          <div className="cflow-fade-up absolute inset-x-2 bottom-2 flex gap-1 rounded-lg border border-white/15 bg-zinc-950/95 p-1 backdrop-blur" onMouseDown={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyUrl();
                if (e.key === 'Escape') setUrlOpen(false);
              }}
              placeholder="https://…"
              className="nodrag min-w-0 flex-1 bg-transparent px-2 text-[11px] text-white outline-none placeholder:text-white/30"
            />
            <button type="button" onClick={applyUrl} className="rounded-md bg-white px-2 text-[10px] font-semibold text-black">
              OK
            </button>
          </div>
        )}
      </div>

      <IoHandle type="source" kind="image" connected={sourceConnected} title={t('creatorFlow.handleImageOut')} />
    </NodeCard>
  );
}
