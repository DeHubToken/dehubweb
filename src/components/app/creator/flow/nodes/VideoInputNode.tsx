/**
 * Creator Flow — reference video node.
 * ====================================
 * Adapted from HeliosGen's VideoInputNode (MIT) — see LICENSE-HeliosGen.
 * A clip from disk or a URL, with two outputs: the video itself, and a still
 * captured at a chosen second so a video can feed an image handle. Capture
 * happens in the browser (see lib/creator/flow/frames.ts).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Link2, Loader2, Trash2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { NodeProps } from '@xyflow/react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { captureVideoFrame, readVideoDuration } from '@/lib/creator/flow/frames';
import type { FlowNode } from '@/lib/creator/flow/types';
import { useCreatorFlowStore } from '@/store/creatorFlowStore';
import { AboveLabel, CornerResizer, IoHandle, NodeActionBar, NodeCard, useHandleConnected, useInstantHandleHide } from '../NodeChrome';
import { useReadOnly } from '../FlowActionsContext';

const MAX_BYTES = 100 * 1024 * 1024;

async function uploadVideo(file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'mp4').replace(/[^a-z0-9]/gi, '');
  const path = `creator-flow/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from('ai-media-uploads').upload(path, file, { contentType: file.type || 'video/mp4' });
  if (error) throw new Error(error.message);
  return supabase.storage.from('ai-media-uploads').getPublicUrl(path).data.publicUrl;
}

export default function VideoInputNode({ id, data, selected }: NodeProps<FlowNode>) {
  const { t } = useTranslation();
  const readOnly = useReadOnly();
  const updateNodeData = useCreatorFlowStore((s) => s.updateNodeData);
  const onNodesChange = useCreatorFlowStore((s) => s.onNodesChange);
  const cardRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  useInstantHandleHide(selected, cardRef);

  const [busy, setBusy] = useState<'upload' | 'capture' | null>(null);
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const videoUrl = data.videoUrl as string | undefined;
  const frameUrl = data.capturedFrameUrl as string | undefined;
  const videoOut = useHandleConnected(id, 'video', 'source');
  const frameOut = useHandleConnected(id, 'frame', 'source');

  const setVideo = useCallback(
    async (url: string) => {
      updateNodeData(id, { videoUrl: url, capturedFrameUrl: undefined, status: 'idle' });
      const d = await readVideoDuration(url);
      if (d) updateNodeData(id, { videoDuration: d });
    },
    [id, updateNodeData],
  );

  const attach = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('video/')) {
        toast.error(t('creatorFlow.attachVideoOnly'));
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error(t('creatorFlow.videoTooLarge'));
        return;
      }
      setBusy('upload');
      try {
        const url = await uploadVideo(file);
        await setVideo(url);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('creatorFlow.uploadFailed'));
      } finally {
        setBusy(null);
      }
    },
    [setVideo, t],
  );

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

  const capture = useCallback(async () => {
    if (!videoUrl) return;
    const seconds = videoRef.current?.currentTime ?? 0;
    setBusy('capture');
    try {
      const url = await captureVideoFrame(videoUrl, { seconds });
      updateNodeData(id, { capturedFrameUrl: url, captureSeconds: seconds });
      toast.success(t('creatorFlow.frameCaptured', { seconds: seconds.toFixed(1) }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('creatorFlow.captureFailed'));
    } finally {
      setBusy(null);
    }
  }, [id, t, updateNodeData, videoUrl]);

  // A frame output that is wired needs a frame: capture the first one.
  useEffect(() => {
    if (readOnly || !frameOut || frameUrl || !videoUrl || busy) return;
    let cancelled = false;
    setBusy('capture');
    captureVideoFrame(videoUrl, { seconds: 0 })
      .then((url) => {
        if (!cancelled) updateNodeData(id, { capturedFrameUrl: url, captureSeconds: 0 });
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setBusy(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameOut, frameUrl, videoUrl, readOnly]);

  const applyUrl = () => {
    const url = urlDraft.trim();
    if (!/^https?:\/\//.test(url)) {
      toast.error(t('creatorFlow.invalidUrl'));
      return;
    }
    void setVideo(url);
    setUrlOpen(false);
    setUrlDraft('');
  };

  return (
    <NodeCard cardRef={cardRef} error={!!data.hasError} onErrorEnd={() => updateNodeData(id, { hasError: false })} style={{ minWidth: 200 }}>
      {!readOnly && <CornerResizer minWidth={180} minHeight={120} />}
      <AboveLabel text={data.label as string} />
      {!readOnly && (
        <NodeActionBar
          visible={selected}
          actions={[
            { icon: <Upload size={13} />, title: t('creatorFlow.uploadVideo'), onClick: () => fileRef.current?.click() },
            { icon: <Link2 size={13} />, title: t('creatorFlow.pasteUrl'), onClick: () => setUrlOpen((o) => !o) },
            { icon: <Camera size={13} />, title: t('creatorFlow.captureFrame'), onClick: () => void capture(), disabled: !videoUrl || !!busy },
            { icon: <Trash2 size={13} />, title: t('creatorFlow.deleteNode'), onClick: () => onNodesChange([{ type: 'remove', id }]), separatorBefore: true },
          ]}
        />
      )}
      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void attach(f);
          e.target.value = '';
        }}
      />

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[13px] bg-black/40">
        {videoUrl ? (
          <video ref={videoRef} src={videoUrl} controls muted playsInline preload="metadata" className="nodrag nowheel h-full w-full object-contain" onMouseDown={(e) => e.stopPropagation()} />
        ) : (
          <button
            type="button"
            disabled={readOnly || !!busy}
            onClick={() => fileRef.current?.click()}
            className="flex h-full min-h-[120px] w-full flex-col items-center justify-center gap-2 text-white/40 transition hover:text-white/70"
          >
            {busy === 'upload' ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
            <span className="text-[11px]">{busy === 'upload' ? t('creatorFlow.uploading') : t('creatorFlow.dropOrUploadVideo')}</span>
          </button>
        )}
        {busy === 'capture' && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white backdrop-blur">
            <Loader2 size={11} className="animate-spin" /> {t('creatorFlow.capturing')}
          </span>
        )}
        {frameUrl && (
          <img src={frameUrl} alt="" className="absolute bottom-2 right-2 h-10 w-16 rounded-md border border-white/30 object-cover shadow" title={t('creatorFlow.capturedFrame')} />
        )}
        {urlOpen && !readOnly && (
          <div className="cflow-fade-up absolute inset-x-2 top-2 flex gap-1 rounded-lg border border-white/15 bg-zinc-950/95 p-1 backdrop-blur" onMouseDown={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyUrl();
                if (e.key === 'Escape') setUrlOpen(false);
              }}
              placeholder="https://….mp4"
              className="nodrag min-w-0 flex-1 bg-transparent px-2 text-[11px] text-white outline-none placeholder:text-white/30"
            />
            <button type="button" onClick={applyUrl} className="rounded-md bg-white px-2 text-[10px] font-semibold text-black">
              OK
            </button>
          </div>
        )}
      </div>

      <IoHandle type="source" id="video" kind="video" connected={videoOut} top="calc(50% - 16px)" title={t('creatorFlow.handleVideoOut')} />
      <IoHandle type="source" id="frame" kind="image" connected={frameOut} top="calc(50% + 16px)" title={t('creatorFlow.handleFrameOut')} />
    </NodeCard>
  );
}
