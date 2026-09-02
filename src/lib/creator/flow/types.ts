/**
 * Creator Flow — shared types.
 * ============================
 * The node/edge shapes are React Flow's; `NodeData` is the bag every node type reads its settings
 * and outputs from, kept flat so the whole graph serialises as one jsonb blob.
 */
import type { Node, Edge } from '@xyflow/react';

export type NodeStatus = 'idle' | 'pending' | 'running' | 'done' | 'error';

export type FlowNodeType =
  | 'promptNode'
  | 'imageInputNode'
  | 'videoInputNode'
  | 'imageGenNode'
  | 'videoGenNode'
  | 'assistantNode'
  | 'groupNode';

export const GEN_NODE_TYPES: ReadonlySet<string> = new Set(['imageGenNode', 'videoGenNode', 'assistantNode']);

/** A previous result of a generator node; `null` while its slot is rendering. */
export type GenEntry = string | { error: string } | null;

export interface NodeData extends Record<string, unknown> {
  label: string;
  status?: NodeStatus;
  /** Text node body, or a generator's last resolved prompt. */
  prompt?: string;
  /** 'text' | 'json' | 'yaml' — how the prompt node presents its body. */
  textMode?: 'text' | 'json' | 'yaml';

  // ── generators ──
  /** Image model key (IMAGE_MODELS) or video model key (VIDEO_MODELS). */
  model?: string;
  aspectRatio?: string;
  duration?: number;
  resolution?: '480p' | '720p' | '1080p';
  negativePrompt?: string;
  seed?: number;

  // ── image (input or output) ──
  /** Durable https URL of the node's image — an upload once hosted, or the result. */
  imageUrl?: string;
  /** Inline data URL kept only for the session; never persisted. */
  inputImage?: string;
  imageNaturalRatio?: string;

  // ── video (input or output) ──
  videoUrl?: string;
  videoDuration?: number;
  /** A still pulled from the video, used when it feeds an image handle. */
  capturedFrameUrl?: string;
  captureSeconds?: number;

  // ── assistant ──
  localPrompt?: string;
  outputText?: string;
  assistantModel?: string;

  // ── run bookkeeping ──
  errorMsg?: string;
  hasError?: boolean;
  locked?: boolean;
  /** generationStore job id of the render in flight, so a reload can rejoin. */
  jobId?: string;
  generations?: GenEntry[];
  currentGenIdx?: number;
  pendingGenerate?: boolean;
  pipelineQueued?: boolean;

  // ── group ──
  memberIds?: string[];
}

export type FlowNode = Node<NodeData>;
export type FlowEdge = Edge;

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/** One canvas. */
export interface Flow {
  id: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  nodeCounters: Record<string, number>;
  createdAt: number;
  updatedAt?: number;
  viewport?: Viewport;
  isPublic?: boolean;
  coverUrl?: string | null;
}

export const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Human-readable label with the per-type counter. */
export function nodeLabel(type: string, n: number): string {
  if (type === 'assistantNode') return 'ASSISTANT';
  const names: Record<string, string> = {
    promptNode: 'TEXT',
    imageInputNode: 'IMAGE',
    videoInputNode: 'VIDEO',
    imageGenNode: 'IMAGE GEN',
    videoGenNode: 'VIDEO GEN',
    groupNode: 'GROUP',
  };
  return `${names[type] ?? type} #${n}`;
}
