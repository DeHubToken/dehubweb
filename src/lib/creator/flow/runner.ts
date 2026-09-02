/**
 * Creator Flow — running the graph.
 * =================================
 * Adapted from HeliosGen's usePipelineRunner + the per-node generate paths
 * (MIT) — see LICENSE-HeliosGen — on top of DeHub's pay-per-job model.
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
import { hostDataUrl } from '@/lib/creator/generationEngine';
import { IMAGE_MODELS } from '@/constants/image-models.constants';
import { VIDEO_MODELS, snapVideoDuration } from '@/constants/video-models.constants';
import { useGenerationStore, type GenerationJob } from '@/store/generationStore';
import { useCreatorFlowStore } from '@/store/creatorFlowStore';
import { buildPipelineWaves, resolveInputs, resolveMentions } from './executor';
import { streamAssistant, type AssistantModelId } from './assistant';
import type { FlowNode, GenEntry } from './types';

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
  kind: 'image' | 'video' | 'assistant';
  model: string;
  modelName: string;
  priceDhb: number;
}

export interface RunPlan {
  items: PlanItem[];
  waves: string[][];
  totalDhb: number;
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

/** Validation the run refuses on, so a fault surfaces before any DHB moves. */
export function findIssues(nodeIds: string[]): NodeIssue[] {
  const { nodes, edges } = store();
  const issues: NodeIssue[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const id of nodeIds) {
    const node = byId.get(id);
    if (!node) continue;
    if (node.type === 'assistantNode') {
      const upstream = resolveInputs(id, nodes, edges);
      if (!(upstream.prompt ?? (node.data.localPrompt as string | undefined) ?? '').trim()) {
        issues.push({ nodeId: id, key: 'creatorFlow.issuePromptEmpty' });
      }
      continue;
    }
    if (node.type !== 'imageGenNode' && node.type !== 'videoGenNode') continue;

    const promptEdge = edges.find((e) => e.target === id && e.targetHandle === 'prompt');
    const promptSrc = promptEdge ? byId.get(promptEdge.source) : undefined;
    const promptText =
      promptSrc?.type === 'promptNode' ? (promptSrc.data.prompt as string | undefined)
      : promptSrc?.type === 'assistantNode' ? ((promptSrc.data.outputText as string | undefined) || 'pending')
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
        !!(src.data.imageUrl || src.data.inputImage || src.data.capturedFrameUrl) ||
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
  const { nodes, edges, updateNodeData } = store();
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
  const { nodes, edges } = store();
  const scoped = nodes.filter((n) => nodeIds.includes(n.id));
  const waves = buildPipelineWaves(scoped, edges);
  if (waves.length === 0) throw new FlowRunError('Nothing to run', 'EMPTY');

  const issues = findIssues(nodeIds);
  if (issues.length > 0) throw new FlowRunError(issues[0].key, 'INVALID');

  const paid = scoped.filter((n) => n.type === 'imageGenNode' || n.type === 'videoGenNode');
  if (paid.length > 0 && !localStorage.getItem('dehub_token')) {
    throw new FlowRunError('Sign in to generate', 'SIGN_IN_REQUIRED');
  }

  await stageInlineInputs(nodeIds);

  const items: PlanItem[] = [];
  for (const n of scoped) {
    if (n.type === 'assistantNode') {
      items.push({ nodeId: n.id, label: n.data.label, kind: 'assistant', model: (n.data.assistantModel as string) || 'gemini-flash', modelName: 'Assistant', priceDhb: 0 });
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
        quality: cfg?.supportsResolution ? priceQualityFor(n.data.resolution as string | undefined) : undefined,
      });
      items.push({ nodeId: n.id, label: n.data.label, kind: 'video', model, modelName: cfg?.name ?? model, priceDhb });
    }
  }
  const totalDhb = items.reduce((s, i) => s + i.priceDhb, 0);
  return { items, waves, totalDhb };
}

/** Wait for a queued job to settle. */
function waitForJob(jobId: string): Promise<GenerationJob> {
  return new Promise((resolve, reject) => {
    const check = (jobs: GenerationJob[]) => {
      const job = jobs.find((j) => j.id === jobId);
      if (!job) {
        reject(new Error('The job was removed before it finished.'));
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

async function runImageNode(node: FlowNode, txHash: string | undefined) {
  const { nodes, edges, updateNodeData } = store();
  const upstream = resolveInputs(node.id, nodes, edges);
  const { resolvedPrompt, orderedUrls } = resolveMentions(upstream.prompt ?? '', upstream.imageNodeLabels, upstream.imageUrls);
  const model = (node.data.model as string) || DEFAULT_IMAGE_MODEL;
  const aspectRatio = (node.data.aspectRatio as string) || '1:1';
  const slot = pushGeneration(node.id, null);
  updateNodeData(node.id, { status: 'running', errorMsg: undefined, prompt: resolvedPrompt, pendingGenerate: false });

  const jobId = useGenerationStore.getState().startImage(
    {
      prompt: resolvedPrompt,
      model,
      aspectRatio,
      txHash,
      // generate-image takes one reference; the first named one wins.
      ...(orderedUrls[0] ? { sourceImage: orderedUrls[0] } : {}),
    },
    { prompt: resolvedPrompt, resolvedPrompt, modelName: IMAGE_MODELS[model]?.name ?? model, aspect: aspectRatio },
  );
  updateNodeData(node.id, { jobId });
  const job = await waitForJob(jobId);
  if (job.status === 'done' && job.url) {
    settleGeneration(node.id, slot, job.url);
    updateNodeData(node.id, { status: 'done', imageUrl: job.url, jobId: undefined });
    return;
  }
  const message = job.error || 'Generation failed';
  settleGeneration(node.id, slot, { error: message });
  updateNodeData(node.id, { status: 'error', errorMsg: message, jobId: undefined });
  throw new Error(message);
}

async function runVideoNode(node: FlowNode, txHash: string | undefined) {
  const { nodes, edges, updateNodeData } = store();
  const upstream = resolveInputs(node.id, nodes, edges);
  const { resolvedPrompt, orderedUrls } = resolveMentions(upstream.prompt ?? '', upstream.imageNodeLabels, upstream.imageUrls);
  const model = (node.data.model as string) || DEFAULT_VIDEO_MODEL;
  const cfg = VIDEO_MODELS[model];
  const aspectRatio = (node.data.aspectRatio as string) || '16:9';
  const duration = cfg ? snapVideoDuration(cfg, (node.data.duration as number) || cfg.defaultDuration || 5) : (node.data.duration as number) || 5;
  const slot = pushGeneration(node.id, null);
  updateNodeData(node.id, { status: 'running', errorMsg: undefined, prompt: resolvedPrompt, pendingGenerate: false });

  const jobId = useGenerationStore.getState().startVideo(
    {
      prompt: resolvedPrompt,
      model,
      aspectRatio,
      duration,
      resolution: cfg?.supportsResolution ? (node.data.resolution as '480p' | '720p' | '1080p' | undefined) : undefined,
      negativePrompt: (node.data.negativePrompt as string | undefined) || undefined,
      seed: node.data.seed as number | undefined,
      txHash,
      ...(upstream.startFrameUrl ? { sourceImage: upstream.startFrameUrl } : {}),
      ...(upstream.endFrameUrl ? { endFrameUrl: upstream.endFrameUrl } : {}),
      ...(orderedUrls.length ? { referenceImageUrls: orderedUrls } : {}),
      ...(upstream.referenceVideoUrls.length ? { videoUrls: upstream.referenceVideoUrls } : {}),
    },
    { prompt: resolvedPrompt, resolvedPrompt, modelName: cfg?.name ?? model, aspect: aspectRatio },
  );
  updateNodeData(node.id, { jobId });
  const job = await waitForJob(jobId);
  if (job.status === 'done' && job.url) {
    settleGeneration(node.id, slot, job.url);
    updateNodeData(node.id, { status: 'done', videoUrl: job.url, capturedFrameUrl: undefined, jobId: undefined });
    return;
  }
  const message = job.error || 'Generation failed';
  settleGeneration(node.id, slot, { error: message });
  updateNodeData(node.id, { status: 'error', errorMsg: message, jobId: undefined });
  throw new Error(message);
}

export async function runAssistantNode(node: FlowNode, signal?: AbortSignal) {
  const { nodes, edges, updateNodeData } = store();
  const upstream = resolveInputs(node.id, nodes, edges);
  const prompt = (upstream.prompt ?? (node.data.localPrompt as string | undefined) ?? '').trim();
  updateNodeData(node.id, { status: 'running', outputText: '', errorMsg: undefined, pendingGenerate: false });
  try {
    const text = await streamAssistant({
      prompt,
      persona: 'rewrite',
      model: ((node.data.assistantModel as string) || 'gemini-flash') as AssistantModelId,
      onDelta: (_d, acc) => store().updateNodeData(node.id, { outputText: acc }),
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
}

/**
 * Execute a plan. `txHash` is the transfer that covers `plan.totalDhb`; pass
 * undefined only for a plan with nothing paid in it.
 */
export async function executeRun(plan: RunPlan, txHash: string | undefined, progress: RunProgress = {}) {
  const { setIsRunning, updateNodeData } = store();
  const log = progress.onLog ?? (() => undefined);
  setIsRunning(true);
  for (let i = 1; i < plan.waves.length; i += 1) for (const id of plan.waves[i]) updateNodeData(id, { pipelineQueued: true });

  let failures = 0;
  try {
    for (const wave of plan.waves) {
      await Promise.all(
        wave.map(async (id) => {
          const node = store().nodes.find((n) => n.id === id);
          if (!node) return;
          updateNodeData(id, { pipelineQueued: false });
          try {
            if (node.type === 'imageGenNode') await runImageNode(node, txHash);
            else if (node.type === 'videoGenNode') await runVideoNode(node, txHash);
            else if (node.type === 'assistantNode') await runAssistantNode(node);
            log(`[${node.data.label}] done`);
          } catch (e) {
            failures += 1;
            log(`[${node.data.label}] ${e instanceof Error ? e.message : String(e)}`, false);
          }
        }),
      );
    }
  } finally {
    for (const w of plan.waves) for (const id of w) updateNodeData(id, { pipelineQueued: false, pendingGenerate: false });
    setIsRunning(false);
  }
  return { failures };
}

/**
 * Pay for a plan. One transfer for the whole run; the receipt is spent down
 * job by job on the server.
 */
export async function payForPlan(plan: RunPlan): Promise<string | undefined> {
  if (plan.totalDhb <= 0) return undefined;
  return payForJob(plan.totalDhb);
}
