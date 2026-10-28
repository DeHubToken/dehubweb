/**
 * Creator Flow — running the graph.
 * =================================
 * The pipeline runner, on top of DeHub's pay-per-job model.
 *
 * A run is priced first and paid ONCE: every paid node in the run is quoted
 * by the server, the total is signed as a single DHB transfer, and each job
 * then spends that one receipt down (the same way a 4-image batch does in the
 * studio). Failed jobs release their price back onto the receipt. Assistant
 * nodes are free. Nothing is sent to a provider before the transfer confirms.
 *
 * Jobs themselves go through the shared generation queue, so every image or
 * clip a flow renders also lands in the studio library and the editor.
 */
import { fetchJobQuote } from '@/hooks/use-ai-quote';
import { payForJob } from '@/lib/ai-payment';
import { DEFAULT_VOICE_ID, hostDataUrl, type AudioRequest } from '@/lib/creator/generationEngine';
import { graphOrder, AUDIO_TASKS } from './graphContract';
import { assetNodePatch, flowAssetId, loadFlowAssets } from './assets';
import { downloadFlowAudio } from './audioInput';
import { finishReceipt, graphSignature, readReceipt, reserveReceipt, saveReceipt } from './recovery';
import { IMAGE_MODELS } from '@/constants/image-models.constants';
import { VIDEO_MODELS, snapVideoDuration, getVideoResolutions } from '@/constants/video-models.constants';
import { useGenerationStore, type GenerationJob } from '@/store/generationStore';
import { useCreatorFlowStore } from '@/store/creatorFlowStore';
import { buildPipelineWaves, resolveInputs, resolveMentions } from './executor';
import { streamAssistant, type AssistantModelId } from './assistant';
import { GEN_NODE_TYPES, type FlowNode, type GenEntry } from './types';
import i18n from '@/i18n';
import { translateCopy as _translateCopy } from '@/i18n/copy';

export const DEFAULT_IMAGE_MODEL = 'nano-banana-2';
export const DEFAULT_VIDEO_MODEL = 'seedance-2.0';

export class FlowRunError extends Error {
  constructor(message: string, public code: 'SIGN_IN_REQUIRED' | 'EMPTY' | 'INVALID' | 'PAYMENT' | 'FAILED') {
    super(message);
  }
}

export interface PlanItem {
  nodeId: string;
  label: string;
  kind: 'image' | 'video' | 'audio' | 'assistant';
  model: string;
  modelName: string;
  priceDhb: number;
}

export interface RunPlan {
  items: PlanItem[];
  waves: string[][];
  totalDhb: number;
  wallet: string;
  flowId: string;
  signature: string;
  resumeTxHash?: string;
  scopeVersion: number;
  requiresFreeRetry?: boolean;
}

export interface NodeIssue {
  nodeId: string;
  /** i18n key of what is wrong. */
  key: string;
  /** Upstream node to flag as well, when the fault is theirs. */
  sourceId?: string;
  edgeId?: string;
}

function store() {
  return useCreatorFlowStore.getState();
}

function assertOwner(wallet: string, flowId: string, scopeVersion = store().scopeVersion) {
  if (!wallet || localStorage.getItem('dehub_wallet')?.toLowerCase() !== wallet || !localStorage.getItem('dehub_token') || store().activeFlowId !== flowId || store().scopeVersion !== scopeVersion) {
    throw new FlowRunError('Sign in to the original account and reopen this Flow to resume.', 'SIGN_IN_REQUIRED');
  }
}
function scopedStore() {
  const state = store(), wallet = localStorage.getItem('dehub_wallet')?.toLowerCase() || '', flowId = state.activeFlowId;
  return { ...state, updateNodeData: (id: string, data: Parameters<typeof state.updateNodeData>[1]) => { assertOwner(wallet, flowId, state.scopeVersion); state.updateNodeData(id, data); } };
}

/** Validation the run refuses on, so a fault surfaces before any DHB moves. */
export function findIssues(nodeIds: string[]): NodeIssue[] {
  const { nodes, edges } = store();
  const issues: NodeIssue[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const id of nodeIds) {
    const node = byId.get(id);
    if (!node) continue;
    if (node.type === 'audioGenNode') {
      const task = node.data.audioTask || 'speech';
      const upstream = resolveInputs(id, nodes, edges);
      if (!AUDIO_TASKS.includes(task)) issues.push({ nodeId: id, key: 'creatorFlow.invalidGraph' });
      if (task === 'transcribe' || task === 'isolate') {
        const wire = edges.find(edge => edge.target === id && edge.targetHandle === 'audio');
        const source = nodes.find(source => source.id === wire?.source);
        if (!source || (!source.data.audioUrl && !flowAssetId(source) && !(source.type === 'audioGenNode' && nodeIds.includes(source.id)))) issues.push({ nodeId: id, key: 'creatorFlow.issueInputEmpty' });
      } else if (!upstream.prompt?.trim() && !edges.some(edge => edge.target === id && edge.targetHandle === 'prompt' && nodes.some(source => source.id === edge.source && GEN_NODE_TYPES.has(source.type || '')))) {
        issues.push({ nodeId: id, key: 'creatorFlow.issuePromptEmpty' });
      }
      continue;
    }
    if (node.type === 'assistantNode') {
      const upstream = resolveInputs(id, nodes, edges);
      const pendingText = edges.some(edge => edge.target === id && edge.targetHandle === 'prompt' && nodeIds.includes(edge.source)
        && nodes.some(source => source.id === edge.source && (source.type === 'assistantNode' || source.type === 'audioGenNode' && source.data.audioTask === 'transcribe')));
      if (!(upstream.prompt ?? (node.data.localPrompt as string | undefined) ?? '').trim() && !pendingText) {
        issues.push({ nodeId: id, key: 'creatorFlow.issuePromptEmpty' });
      }
      continue;
    }
    if (node.type !== 'imageGenNode' && node.type !== 'videoGenNode') continue;

    const promptEdge = edges.find((e) => e.target === id && e.targetHandle === 'prompt');
    const promptSrc = promptEdge ? byId.get(promptEdge.source) : undefined;
    const promptText =
      promptSrc?.type === 'promptNode' ? (promptSrc.data.prompt as string | undefined)
      : promptSrc?.type === 'assistantNode' || promptSrc?.type === 'audioGenNode' && promptSrc.data.audioTask === 'transcribe' ? ((promptSrc.data.outputText as string | undefined) || 'pending')
      : undefined;
    if (!promptEdge) issues.push({ nodeId: id, key: 'creatorFlow.issueTextRequired' });
    else if (!promptText?.trim()) issues.push({ nodeId: id, key: 'creatorFlow.issuePromptEmpty', sourceId: promptEdge.source, edgeId: promptEdge.id });

    // A wired media source with nothing in it yet — unless it is a generator
    // that runs earlier in this same run, in which case its output arrives.
    for (const e of edges) {
      if (e.target !== id || e.targetHandle === 'prompt') continue;
      const src = byId.get(e.source);
      if (!src) continue;
      const producesLater = (src.type === 'imageGenNode' || src.type === 'videoGenNode') && nodeIds.includes(src.id);
      if (producesLater) continue;
      const hasMedia =
        !!(src.data.imageUrl || src.data.inputImage || src.data.capturedFrameUrl || flowAssetId(src)) ||
        (e.targetHandle === 'referenceVideo' && !!src.data.videoUrl);
      if (!hasMedia) issues.push({ nodeId: id, key: 'creatorFlow.issueInputEmpty', sourceId: src.id, edgeId: e.id });
    }
    if (node.type === 'videoGenNode') {
      const model = VIDEO_MODELS[(node.data.model as string) || DEFAULT_VIDEO_MODEL];
      const hasStart = edges.some((e) => e.target === id && e.targetHandle === 'startFrame');
      if (model && !model.supports.includes('text-to-video') && !hasStart) {
        issues.push({ nodeId: id, key: 'creatorFlow.issueStartFrameRequired' });
      }
    }
  }
  return issues;
}

function priceQualityFor(resolution: string | undefined): 'standard' | 'HD' {
  return resolution === '1080p' ? 'HD' : 'standard';
}

/**
 * Stage anything inline: a dropped image is a data URL until it is hosted,
 * and no provider takes those. Done before quoting so a staging failure
 * cannot follow a payment.
 */
async function stageInlineInputs(nodeIds: string[]) {
  const { nodes, edges, updateNodeData } = scopedStore();
  const needed = new Set<string>();
  for (const e of edges) if (nodeIds.includes(e.target)) needed.add(e.source);
  for (const n of nodes) {
    if (!needed.has(n.id)) continue;
    const inline = n.data.inputImage as string | undefined;
    if (inline?.startsWith('data:') && !n.data.imageUrl) {
      const url = await hostDataUrl(inline);
      updateNodeData(n.id, { imageUrl: url });
    }
  }
}

/** Price every paid node in the run. Throws when signed out. */
export async function planRun(nodeIds: string[]): Promise<RunPlan> {
  let { nodes, edges } = store();
  try { graphOrder(nodes, edges); } catch { throw new FlowRunError(i18n.t('creatorFlow.invalidGraph'), 'INVALID'); }
  const wallet = localStorage.getItem('dehub_wallet')?.toLowerCase();
  const flowId = store().activeFlowId;
  const scopeVersion = store().scopeVersion;
  if (!wallet) throw new FlowRunError('Sign in to generate', 'SIGN_IN_REQUIRED');
  assertOwner(wallet, flowId);
  const signature = graphSignature(nodes, edges);
  const receipt = readReceipt(wallet, flowId);
  if (receipt && (receipt.txHash || receipt.started.length)) {
    if (receipt.signature !== signature) throw new FlowRunError('Restore the saved Flow graph before resuming its run.', 'INVALID');
    nodeIds = receipt.nodeIds;
    for (const id of receipt.completed) {
      const output = receipt.outputs?.[id];
      if (!output) throw new FlowRunError('The saved run has no recoverable output for a completed node.', 'INVALID');
      store().updateNodeData(id, { ...output, status: 'done' });
    }
    ({ nodes, edges } = store());
  }
  const inputs = nodes.filter(node => edges.some(edge => edge.source === node.id && nodeIds.includes(edge.target)) && (!(GEN_NODE_TYPES.has(node.type || '') && nodeIds.includes(node.id)) || receipt?.completed.includes(node.id)));
  const ids = inputs.map(flowAssetId).filter(Boolean);
  if (ids.length) {
    if (!wallet) throw new FlowRunError('SIGN_IN_REQUIRED', 'SIGN_IN_REQUIRED');
    const assets = await loadFlowAssets(wallet, ids);
    assertOwner(wallet, flowId, scopeVersion);
    for (const node of inputs) {
      const id = flowAssetId(node); if (!id) continue;
      const asset = assets.get(id);
      if (!asset) throw new FlowRunError(i18n.t('creatorFlow.issueInputEmpty'), 'INVALID');
      store().updateNodeData(node.id, assetNodePatch(node, asset));
    }
  }
  const scoped = nodes.filter((n) => nodeIds.includes(n.id));
  const waves = buildPipelineWaves(scoped, edges);
  if (waves.length === 0) throw new FlowRunError('Nothing to run', 'EMPTY');

  const issues = findIssues(nodeIds);
  if (issues.length > 0) throw new FlowRunError(_translateCopy(issues[0].key, { defaultValue: issues[0].key }), 'INVALID');

  const paid = scoped.filter((n) => n.type === 'imageGenNode' || n.type === 'videoGenNode' || n.type === 'audioGenNode');
  if (paid.length > 0 && !localStorage.getItem('dehub_token')) {
    throw new FlowRunError('Sign in to generate', 'SIGN_IN_REQUIRED');
  }

  await stageInlineInputs(nodeIds);
  assertOwner(wallet, flowId, scopeVersion);

  const items: PlanItem[] = [];
  for (const n of scoped) {
    if (n.type === 'audioGenNode') {
      const task = n.data.audioTask || 'speech';
      items.push({ nodeId: n.id, label: n.data.label, kind: 'audio', model: task, modelName: i18n.t(`creator.audioTask${task === 'sfx' ? 'Sfx' : task === 'transcribe' ? 'Transcribe' : task === 'isolate' ? 'Isolate' : 'Speech'}Label`), priceDhb: 0 });
      continue;
    }
    if (n.type === 'assistantNode') {
      items.push({ nodeId: n.id, label: n.data.label, kind: 'assistant', model: (n.data.assistantModel as string) || 'gemini-flash', modelName: _translateCopy("copy.391e40515277", { defaultValue: "Assistant" }), priceDhb: 0 });
      continue;
    }
    if (n.type === 'imageGenNode') {
      const model = (n.data.model as string) || DEFAULT_IMAGE_MODEL;
      const { priceDhb } = await fetchJobQuote({ kind: 'image', modelId: model, quantity: 1 });
      items.push({ nodeId: n.id, label: n.data.label, kind: 'image', model, modelName: IMAGE_MODELS[model]?.name ?? model, priceDhb });
    }
    if (n.type === 'videoGenNode') {
      const model = (n.data.model as string) || DEFAULT_VIDEO_MODEL;
      const cfg = VIDEO_MODELS[model];
      const duration = cfg ? snapVideoDuration(cfg, (n.data.duration as number) || cfg.defaultDuration || 5) : (n.data.duration as number) || 5;
      const { priceDhb } = await fetchJobQuote({
        kind: 'video',
        modelId: model,
        durationSeconds: duration,
        // Include wired upstream outputs that are produced later in this run.
        hasEndFrame: store().edges.some(edge => edge.target === n.id && edge.targetHandle === 'endFrame'),
        hasVideoReferences: store().edges.some(edge => edge.target === n.id && edge.targetHandle === 'referenceVideo'),
        resolution: (n.data.resolution as string) || '720p',
        aspectRatio: (n.data.aspectRatio as string) || '16:9',
        quality: cfg?.supportsResolution ? priceQualityFor(n.data.resolution as string | undefined) : undefined,
      });
      items.push({ nodeId: n.id, label: n.data.label, kind: 'video', model, modelName: cfg?.name ?? model, priceDhb });
    }
  }
  const totalDhb = items.reduce((s, i) => s + i.priceDhb, 0);
  assertOwner(wallet, flowId, scopeVersion);
  return { items, waves, totalDhb: receipt?.txHash ? receipt.totalDhb : totalDhb, wallet, flowId, signature: graphSignature(store().nodes, store().edges), resumeTxHash: receipt?.txHash, scopeVersion,
    requiresFreeRetry: receipt?.started.some(id => !receipt.completed.includes(id) && !receipt.expectedPaidNodeIds.includes(id)) };
}

async function runAudioNode(node: FlowNode) {
  const { nodes, edges, updateNodeData } = scopedStore();
  const input = resolveInputs(node.id, nodes, edges), task = node.data.audioTask || 'speech';
  let request: AudioRequest;
  if (task === 'transcribe' || task === 'isolate') {
    if (!input.audioUrl) throw new Error(i18n.t('creatorFlow.issueInputEmpty'));
    const file = await downloadFlowAudio(input.audioUrl);
    if (!file.type.startsWith('audio/') || !file.size) throw new Error(i18n.t('creatorFlow.issueInputEmpty'));
    request = { task, file };
  } else {
    const text = input.prompt?.trim() || '';
    if (!text) throw new Error(i18n.t('creatorFlow.issuePromptEmpty'));
    request = task === 'sfx' ? { task, text, durationSeconds: node.data.duration } : { task: 'speech', text, voiceId: node.data.voiceId || DEFAULT_VOICE_ID };
  }
  const slot = pushGeneration(node.id, null);
  updateNodeData(node.id, { status: 'running', errorMsg: undefined });
  const jobId = useGenerationStore.getState().startAudio(request, { prompt: input.prompt || task, resolvedPrompt: input.prompt || task, modelName: task, aspect: 'audio' });
  updateNodeData(node.id, { jobId });
  const job = await waitForJob(jobId);
  if (job.status !== 'done') throw new Error(job.error || i18n.t('creator.editorImportFailed'));
  // The generation store saves audio bytes privately. Wait for that existing
  // save rather than issuing a second upload or storing a temporary blob URL.
  const saved = await new Promise<GenerationJob>((resolve, reject) => {
    let unsubscribe: (() => void) | undefined;
    const timeout = setTimeout(() => { unsubscribe?.(); reject(new Error(i18n.t('creatorFlow.audioSavePending'))); }, 60_000);
    const check = () => {
      const current = useGenerationStore.getState().jobs.find(job => job.id === jobId);
      if (current?.cloudSaved) { clearTimeout(timeout); unsubscribe?.(); resolve(current); return true; }
      if (!current || current.saveError) { clearTimeout(timeout); unsubscribe?.(); reject(new Error(i18n.t('creatorFlow.audioSavePending'))); return true; }
      return false;
    };
    if (!check()) unsubscribe = useGenerationStore.subscribe(check);
  });
  updateNodeData(node.id, {});
  settleGeneration(node.id, slot, saved.transcript || saved.url || '');
  updateNodeData(node.id, { status: 'done', audioAssetId: saved.id, audioUrl: saved.url, outputText: saved.transcript, jobId: undefined });
}

/** Wait for a queued job to settle. */
function waitForJob(jobId: string): Promise<GenerationJob> {
  const wallet = localStorage.getItem('dehub_wallet')?.toLowerCase() || '', flowId = store().activeFlowId, scopeVersion = store().scopeVersion;
  return new Promise((resolve, reject) => {
    const check = (jobs: GenerationJob[]) => {
      try { assertOwner(wallet, flowId, scopeVersion); } catch (error) { reject(error); return true; }
      const job = jobs.find((j) => j.id === jobId);
      if (!job) {
        reject(new Error(_translateCopy("copy.cda7e5fa6275", { defaultValue: "The job was removed before it finished." })));
        return true;
      }
      if (job.status === 'running') return false;
      resolve(job);
      return true;
    };
    if (check(useGenerationStore.getState().jobs)) return;
    const unsub = useGenerationStore.subscribe((s) => {
      if (check(s.jobs)) unsub();
    });
  });
}

async function paidJob(clientJobId: string | undefined, start: () => string): Promise<GenerationJob> {
  const existing = clientJobId && useGenerationStore.getState().jobs.find(job => job.id === clientJobId);
  if (existing?.status === 'done') return existing;
  if (existing && existing.ticket) {
    if (existing.status !== 'running') useGenerationStore.getState().retry(existing.id);
    else useGenerationStore.getState().resumeInterrupted();
    return waitForJob(existing.id);
  }
  if (existing?.status === 'running') return waitForJob(existing.id);
  return waitForJob(start());
}

function pushGeneration(nodeId: string, entry: GenEntry): number {
  const node = store().nodes.find((n) => n.id === nodeId);
  const gens = [...(((node?.data.generations as GenEntry[] | undefined) ?? []))];
  gens.push(entry);
  store().updateNodeData(nodeId, { generations: gens, currentGenIdx: gens.length - 1 });
  return gens.length - 1;
}

function settleGeneration(nodeId: string, slot: number, entry: GenEntry) {
  const node = store().nodes.find((n) => n.id === nodeId);
  const gens = [...(((node?.data.generations as GenEntry[] | undefined) ?? []))];
  gens[slot] = entry;
  store().updateNodeData(nodeId, { generations: gens, currentGenIdx: slot });
}

async function runImageNode(node: FlowNode, txHash: string | undefined, clientJobId?: string) {
  const { nodes, edges, updateNodeData } = scopedStore();
  const upstream = resolveInputs(node.id, nodes, edges);
  const { resolvedPrompt, orderedUrls } = resolveMentions(upstream.prompt ?? '', upstream.imageNodeLabels, upstream.imageUrls);
  const model = (node.data.model as string) || DEFAULT_IMAGE_MODEL;
  const aspectRatio = (node.data.aspectRatio as string) || '1:1';
  const slot = pushGeneration(node.id, null);
  updateNodeData(node.id, { status: 'running', errorMsg: undefined, prompt: resolvedPrompt, pendingGenerate: false });

  const job = await paidJob(clientJobId, () => useGenerationStore.getState().startImage(
    {
      prompt: resolvedPrompt,
      model,
      aspectRatio,
      txHash,
      clientJobId,
      // generate-image takes one reference; the first named one wins.
      ...(orderedUrls[0] ? { sourceImage: orderedUrls[0] } : {}),
    },
    { prompt: resolvedPrompt, resolvedPrompt, modelName: IMAGE_MODELS[model]?.name ?? model, aspect: aspectRatio },
  ));
  updateNodeData(node.id, {});
  if (job.status === 'done' && job.url) {
    settleGeneration(node.id, slot, job.url);
    updateNodeData(node.id, { status: 'done', imageUrl: job.url, outputAssetId: job.id, jobId: undefined });
    return;
  }
  const message = job.error || _translateCopy("copy.78257562583c", { defaultValue: "Generation failed" });
  settleGeneration(node.id, slot, { error: message });
  updateNodeData(node.id, { status: 'error', errorMsg: message, jobId: undefined });
  throw new Error(message);
}

async function runVideoNode(node: FlowNode, txHash: string | undefined, clientJobId?: string) {
  const { nodes, edges, updateNodeData } = scopedStore();
  const upstream = resolveInputs(node.id, nodes, edges);
  const { resolvedPrompt, orderedUrls } = resolveMentions(upstream.prompt ?? '', upstream.imageNodeLabels, upstream.imageUrls);
  const model = (node.data.model as string) || DEFAULT_VIDEO_MODEL;
  const cfg = VIDEO_MODELS[model];
  const aspects = cfg?.aspectRatios ?? ['16:9', '9:16', '1:1'];
  const aspectRatio = aspects.includes(node.data.aspectRatio ?? '') ? node.data.aspectRatio! : aspects[0];
  const resolutions = getVideoResolutions(cfg);
  const resolution = resolutions.includes(node.data.resolution ?? '') ? node.data.resolution! : resolutions.includes('720p') ? '720p' : resolutions[0];
  const duration = cfg ? snapVideoDuration(cfg, (node.data.duration as number) || cfg.defaultDuration || 5) : (node.data.duration as number) || 5;
  const slot = pushGeneration(node.id, null);
  updateNodeData(node.id, { status: 'running', errorMsg: undefined, prompt: resolvedPrompt, pendingGenerate: false });

  const job = await paidJob(clientJobId, () => useGenerationStore.getState().startVideo(
    {
      prompt: resolvedPrompt,
      model,
      aspectRatio,
      duration,
      resolution: cfg?.supportsResolution ? resolution : undefined,
      negativePrompt: (node.data.negativePrompt as string | undefined) || undefined,
      seed: node.data.seed as number | undefined,
      txHash,
      clientJobId,
      ...(upstream.startFrameUrl ? { sourceImage: upstream.startFrameUrl } : {}),
      ...(upstream.endFrameUrl ? { endFrameUrl: upstream.endFrameUrl } : {}),
      ...(orderedUrls.length ? { referenceImageUrls: orderedUrls } : {}),
      ...(upstream.referenceVideoUrls.length ? { videoUrls: upstream.referenceVideoUrls } : {}),
    },
    { prompt: resolvedPrompt, resolvedPrompt, modelName: cfg?.name ?? model, aspect: aspectRatio },
  ));
  updateNodeData(node.id, {});
  if (job.status === 'done' && job.url) {
    settleGeneration(node.id, slot, job.url);
    updateNodeData(node.id, { status: 'done', videoUrl: job.url, outputAssetId: job.id, capturedFrameUrl: undefined, jobId: undefined });
    return;
  }
  const message = job.error || _translateCopy("copy.78257562583c", { defaultValue: "Generation failed" });
  settleGeneration(node.id, slot, { error: message });
  updateNodeData(node.id, { status: 'error', errorMsg: message, jobId: undefined });
  throw new Error(message);
}

export async function runAssistantNode(node: FlowNode, signal?: AbortSignal) {
  const { nodes, edges, updateNodeData } = scopedStore();
  const upstream = resolveInputs(node.id, nodes, edges);
  const prompt = (upstream.prompt ?? (node.data.localPrompt as string | undefined) ?? '').trim();
  updateNodeData(node.id, { status: 'running', outputText: '', errorMsg: undefined, pendingGenerate: false });
  try {
    const text = await streamAssistant({
      prompt,
      persona: 'rewrite',
      model: ((node.data.assistantModel as string) || 'gemini-flash') as AssistantModelId,
      onDelta: (_d, acc) => updateNodeData(node.id, { outputText: acc }),
      signal,
    });
    updateNodeData(node.id, { status: 'done', outputText: text });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      updateNodeData(node.id, { status: 'idle' });
      return;
    }
    const message = e instanceof Error ? e.message : String(e);
    updateNodeData(node.id, { status: 'error', errorMsg: message });
    throw e;
  }
}

export interface RunProgress {
  onLog?: (text: string, ok?: boolean) => void;
  retryInterruptedFree?: boolean;
}

/**
 * Execute a plan. `txHash` is the transfer that covers `plan.totalDhb`; pass
 * undefined only for a plan with nothing paid in it.
 */
export async function executeRun(plan: RunPlan, txHash: string | undefined, progress: RunProgress = {}) {
  assertOwner(plan.wallet, plan.flowId, plan.scopeVersion);
  if (graphSignature(store().nodes, store().edges) !== plan.signature) throw new FlowRunError('The Flow changed. Review the run again.', 'INVALID');
  const receipt = reserveReceipt(plan.wallet, plan.flowId, plan.signature, plan.items.map(item => item.nodeId), plan.items.filter(item => item.kind === 'image' || item.kind === 'video').map(item => item.nodeId), plan.totalDhb);
  if (receipt.started.some(id => !receipt.completed.includes(id) && !receipt.expectedPaidNodeIds.includes(id)) && !progress.retryInterruptedFree) throw new FlowRunError('Confirm retry of the interrupted audio or assistant task before resuming.', 'INVALID');
  if (plan.totalDhb > 0 && !receipt.txHash) throw new FlowRunError('Payment is required before this run can resume.', 'PAYMENT');
  txHash = receipt.txHash || txHash;
  const { setIsRunning, updateNodeData } = scopedStore();
  const log = progress.onLog ?? (() => undefined);
  setIsRunning(true);
  for (let i = 1; i < plan.waves.length; i += 1) for (const id of plan.waves[i]) updateNodeData(id, { pipelineQueued: true });

  let failures = 0;
  // A node downstream of a failed one is skipped rather than run without its
  // input. Its share of the payment stays on the receipt for the next run.
  const failed = new Set<string>();
  const dependsOnFailed = (id: string, seen = new Set<string>()): boolean => {
    for (const e of store().edges) {
      if (e.target !== id || seen.has(e.source)) continue;
      if (failed.has(e.source)) return true;
      seen.add(e.source);
      if (dependsOnFailed(e.source, seen)) return true;
    }
    return false;
  };
  try {
    for (const wave of plan.waves) {
      await Promise.all(
        wave.map(async (id) => {
          assertOwner(plan.wallet, plan.flowId, plan.scopeVersion);
          if (receipt.completed.includes(id)) return;
          const node = store().nodes.find((n) => n.id === id);
          if (!node) return;
          updateNodeData(id, { pipelineQueued: false });
          if (dependsOnFailed(id)) {
            failed.add(id);
            failures += 1;
            const message = i18n.t('creatorFlow.skippedUpstreamFailed');
            updateNodeData(id, { status: 'error', errorMsg: message });
            log(`[${node.data.label}] ${message}`, false);
            return;
          }
          try {
            assertOwner(plan.wallet, plan.flowId, plan.scopeVersion);
            if (!receipt.started.includes(id)) receipt.started.push(id);
            saveReceipt(receipt);
            if (node.type === 'imageGenNode') await runImageNode(node, txHash, receipt.jobIds[id]);
            else if (node.type === 'videoGenNode') await runVideoNode(node, txHash, receipt.jobIds[id]);
            else if (node.type === 'assistantNode') await runAssistantNode(node);
            else if (node.type === 'audioGenNode') await runAudioNode(node);
            assertOwner(plan.wallet, plan.flowId, plan.scopeVersion);
            const result = store().nodes.find(node => node.id === id)?.data;
            receipt.outputs[id] = { audioAssetId: result?.audioAssetId, outputAssetId: result?.outputAssetId, outputText: result?.outputText };
            receipt.completed.push(id);
            saveReceipt(receipt);
            log(_translateCopy("copy.59c7c1fa6f67", { defaultValue: "[{{value1}}] done", value1: node.data.label }));
          } catch (e) {
            failed.add(id);
            failures += 1;
            log(`[${node.data.label}] ${e instanceof Error ? e.message : String(e)}`, false);
          }
        }),
      );
    }
  } finally {
    if (localStorage.getItem('dehub_wallet')?.toLowerCase() === plan.wallet && store().activeFlowId === plan.flowId && store().scopeVersion === plan.scopeVersion) {
      for (const w of plan.waves) for (const id of w) updateNodeData(id, { pipelineQueued: false, pendingGenerate: false });
      setIsRunning(false);
    }
  }
  if (!failures) finishReceipt(receipt);
  return { failures };
}

/**
 * Pay for a plan. One transfer for the whole run; the receipt is spent down
 * job by job on the server.
 */
export async function payForPlan(plan: RunPlan): Promise<string | undefined> {
  const pay = async () => {
    assertOwner(plan.wallet, plan.flowId, plan.scopeVersion);
    const pending = readReceipt(plan.wallet, plan.flowId);
    if (graphSignature(store().nodes, store().edges) !== plan.signature) throw new FlowRunError('The Flow changed. Review the run again.', 'INVALID');
    if (pending?.txHash) {
      if (pending.signature !== plan.signature) throw new FlowRunError('Restore the saved Flow graph before resuming its run.', 'INVALID');
      return pending.txHash;
    }
    const fresh = await planRun(plan.items.map(item => item.nodeId));
    assertOwner(plan.wallet, plan.flowId, plan.scopeVersion);
    if (fresh.signature !== plan.signature || fresh.totalDhb !== plan.totalDhb) throw new FlowRunError('The Flow or its price changed. Review the run again.', 'INVALID');
    const receipt = reserveReceipt(plan.wallet, plan.flowId, plan.signature, plan.items.map(item => item.nodeId), plan.items.filter(item => item.kind === 'image' || item.kind === 'video').map(item => item.nodeId), plan.totalDhb);
    if (plan.totalDhb <= 0) return undefined;
    const hash = await payForJob(plan.totalDhb);
    // Save accepted money under its original owner before honoring navigation.
    receipt.txHash = hash;
    saveReceipt(receipt);
    assertOwner(plan.wallet, plan.flowId, plan.scopeVersion);
    return hash;
  };
  if (navigator.locks) return navigator.locks.request(`flow-payment:${plan.wallet}:${plan.flowId}`, pay);
  if (plan.totalDhb <= 0 || readReceipt(plan.wallet, plan.flowId)?.txHash) return pay();
  throw new FlowRunError('This browser cannot safely coordinate a Flow payment. Use a current browser and retry.', 'PAYMENT');
}
