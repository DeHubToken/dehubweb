import { useEffect, useRef, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { loadCloudGenerationPage } from '@/lib/creator/cloudLibrary';
import { loadFlowAssets } from '@/lib/creator/flow/assets';
import { AUDIO_TASKS } from '@/lib/creator/flow/graphContract';
import { DEFAULT_VOICE_ID } from '@/lib/creator/generationEngine';
import { useCreatorFlowStore } from '@/store/creatorFlowStore';
import type { FlowNode, NodeData } from '@/lib/creator/flow/types';
import { useFlowActions } from '../FlowActionsContext';
import { AboveLabel, CornerResizer, IoHandle, NodeCard, useHandleConnected } from '../NodeChrome';

const TASK_KEYS = { speech: 'creator.audioTaskSpeechLabel', sfx: 'creator.audioTaskSfxLabel', transcribe: 'creator.audioTaskTranscribeLabel', isolate: 'creator.audioTaskIsolateLabel' };
function AudioResult({ data }: { data: NodeData }) {
  const { walletAddress } = useAuth();
  const [url, setUrl] = useState(data.audioUrl);
  useEffect(() => {
    setUrl(data.audioUrl); let closed = false;
    if (!walletAddress || !data.audioAssetId) return;
    void loadFlowAssets(walletAddress, [data.audioAssetId]).then(assets => {
      if (!closed) setUrl(assets.get(data.audioAssetId!)?.url);
    }).catch(() => { if (!closed) setUrl(undefined); });
    return () => { closed = true; };
  }, [walletAddress, data.audioAssetId, data.audioUrl]);
  return data.audioTask === 'transcribe' ? <p className="whitespace-pre-wrap p-3 text-xs">{data.outputText}</p>
    : url ? <audio controls preload="none" src={url} className="nodrag nowheel w-full" /> : null;
}

export function AudioInputNode({ id, data }: NodeProps<FlowNode>) {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const { readOnly } = useFlowActions();
  const update = useCreatorFlowStore(state => state.updateNodeData);
  const [assets, setAssets] = useState<Array<{ id: string; label: string; url?: string }>>([]);
  const [offset, setOffset] = useState<number | null>(0);
  const [busy, setBusy] = useState(false);
  const request = useRef(false);
  const connected = useHandleConnected(id, 'audio', 'source');
  const load = async () => {
    if (!walletAddress || offset === null || request.current) return;
    request.current = true; setBusy(true);
    try {
      const page = await loadCloudGenerationPage(walletAddress, offset);
      setAssets(previous => [...previous, ...page.jobs.filter(job => job.kind === 'audio' && job.url).map(job => ({ id: job.id, label: job.prompt || job.modelName, url: job.url }))]);
      setOffset(page.nextOffset);
    } finally { request.current = false; setBusy(false); }
  };
  useEffect(() => { setAssets([]); setOffset(0); }, [walletAddress]);
  return <NodeCard>
    <AboveLabel text={data.label || t('creatorFlow.nodeAudioInput')} /><CornerResizer />
    <div className="space-y-3 p-4">
      {!readOnly && <>
        <button type="button" disabled={busy} onClick={() => void load().catch(() => {})} className="nodrag min-h-11 text-xs underline">{t('creator.referenceLibrary')}</button>
        <select aria-label={t('creatorFlow.nodeAudioInput')} disabled={busy} className="nodrag nowheel w-full bg-zinc-900 p-2 text-xs" value={data.audioAssetId || ''}
          onChange={event => { const asset = assets.find(asset => asset.id === event.target.value); update(id, { audioAssetId: asset?.id, audioUrl: asset?.url }); }}>
          <option value="">{t('creator.libraryEmpty')}</option>{assets.map(asset => <option key={asset.id} value={asset.id}>{asset.label}</option>)}
        </select>
      </>}
      <AudioResult data={data} />
    </div>
    <IoHandle type="source" id="audio" kind="audio" connected={connected} title={t('creator.navAudio')} />
  </NodeCard>;
}

export function AudioGenNode({ id, data }: NodeProps<FlowNode>) {
  const { t } = useTranslation();
  const { readOnly, runNodes } = useFlowActions();
  const update = useCreatorFlowStore(state => state.updateNodeData);
  const running = useCreatorFlowStore(state => state.isRunning);
  const removeEdges = useCreatorFlowStore(state => state.removeEdgesForHandle);
  const task = data.audioTask || 'speech';
  const transform = task === 'transcribe' || task === 'isolate';
  const input = useHandleConnected(id, transform ? 'audio' : 'prompt', 'target');
  const output = useHandleConnected(id, task === 'transcribe' ? 'prompt' : 'audio', 'source');
  return <NodeCard error={data.status === 'error'}>
    <AboveLabel text={data.label || t('creatorFlow.nodeAudioGen')} /><CornerResizer />
    <div className="space-y-3 p-4 text-xs">
      <label className="block">{t('creator.navAudio')}
        <select disabled={readOnly || running} value={task} className="nodrag nowheel mt-1 w-full bg-zinc-900 p-2" onChange={event => {
          removeEdges(id, 'audio'); removeEdges(id, 'prompt');
          update(id, { audioTask: event.target.value as NodeData['audioTask'], audioAssetId: undefined, audioUrl: undefined, outputText: undefined, status: 'idle', jobId: undefined });
        }}>{AUDIO_TASKS.map(value => <option key={value} value={value}>{t(TASK_KEYS[value])}</option>)}</select>
      </label>
      {task === 'speech' && <label className="block">{t('creatorFlow.audioVoiceId')}<input disabled={readOnly || running} className="nodrag nowheel mt-1 w-full bg-zinc-900 p-2" value={data.voiceId || DEFAULT_VOICE_ID} onChange={event => update(id, { voiceId: event.target.value })} /></label>}
      {task === 'sfx' && <label className="block">{t('creatorFlow.audioSeconds')}<input type="number" min={0} max={30} disabled={readOnly || running} className="nodrag mt-1 w-full bg-zinc-900 p-2" value={data.duration ?? 0} onChange={event => update(id, { duration: Number(event.target.value) })} /></label>}
      <AudioResult data={data} />
      {data.errorMsg && <p role="alert">{data.errorMsg}</p>}
      {!readOnly && <button type="button" disabled={running || !input} className="nodrag min-h-11 w-full rounded-lg border border-white/20" onClick={() => runNodes([id])}>{t('creatorFlow.run')}</button>}
    </div>
    <IoHandle type="target" id={transform ? 'audio' : 'prompt'} kind={transform ? 'audio' : 'prompt'} connected={input} title={t(transform ? 'creator.navAudio' : 'creatorFlow.handlePrompt')} />
    <IoHandle type="source" id={task === 'transcribe' ? 'prompt' : 'audio'} kind={task === 'transcribe' ? 'prompt' : 'audio'} connected={output} title={t(task === 'transcribe' ? 'creatorFlow.handlePrompt' : 'creator.navAudio')} />
  </NodeCard>;
}
