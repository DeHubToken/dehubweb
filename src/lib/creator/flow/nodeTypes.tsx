/**
 * Creator Flow — node catalogue.
 * ==============================
 * Adapted from HeliosGen's lib/nodeTypes.tsx (MIT) — see LICENSE-HeliosGen.
 * The sidebar, the add menu and the edge-drop picker all read from this one
 * list, so a node type is declared once.
 */
import type { ReactNode } from 'react';
import { Bot, Clapperboard, Film, Image as ImageIcon, MessageSquare, Sparkles } from 'lucide-react';
import type { FlowNodeType } from './types';

export type NodeCategory = 'generators' | 'resources';

export interface NodeMeta {
  type: FlowNodeType;
  category: NodeCategory;
  /** Whether an edge dragged from another node can land on this type. */
  canReceiveConnection: boolean;
  icon: ReactNode;
  labelKey: string;
  descriptionKey: string;
}

export const NODES: NodeMeta[] = [
  {
    type: 'assistantNode',
    category: 'generators',
    canReceiveConnection: false,
    icon: <Bot size={14} strokeWidth={1.6} />,
    labelKey: 'creatorFlow.nodeAssistant',
    descriptionKey: 'creatorFlow.nodeAssistantDesc',
  },
  {
    type: 'videoGenNode',
    category: 'generators',
    canReceiveConnection: true,
    icon: <Clapperboard size={14} strokeWidth={1.6} />,
    labelKey: 'creatorFlow.nodeVideoGen',
    descriptionKey: 'creatorFlow.nodeVideoGenDesc',
  },
  {
    type: 'imageGenNode',
    category: 'generators',
    canReceiveConnection: true,
    icon: <Sparkles size={14} strokeWidth={1.6} />,
    labelKey: 'creatorFlow.nodeImageGen',
    descriptionKey: 'creatorFlow.nodeImageGenDesc',
  },
  {
    type: 'promptNode',
    category: 'resources',
    canReceiveConnection: false,
    icon: <MessageSquare size={14} strokeWidth={1.6} />,
    labelKey: 'creatorFlow.nodeText',
    descriptionKey: 'creatorFlow.nodeTextDesc',
  },
  {
    type: 'imageInputNode',
    category: 'resources',
    canReceiveConnection: false,
    icon: <ImageIcon size={14} strokeWidth={1.6} />,
    labelKey: 'creatorFlow.nodeImageInput',
    descriptionKey: 'creatorFlow.nodeImageInputDesc',
  },
  {
    type: 'videoInputNode',
    category: 'resources',
    canReceiveConnection: false,
    icon: <Film size={14} strokeWidth={1.6} />,
    labelKey: 'creatorFlow.nodeVideoInput',
    descriptionKey: 'creatorFlow.nodeVideoInputDesc',
  },
];

/** Settings a freshly added generator inherits from the last one of its type. */
const GEN_NODE_SETTINGS: Record<string, string[]> = {
  imageGenNode: ['model', 'aspectRatio'],
  videoGenNode: ['model', 'aspectRatio', 'duration', 'resolution'],
  assistantNode: ['assistantModel'],
};

export function getLastNodeSettings(
  type: string,
  nodes: Array<{ type?: string | null; data: Record<string, unknown> }>,
): Record<string, unknown> {
  const keys = GEN_NODE_SETTINGS[type];
  if (!keys) return {};
  const matching = nodes.filter((n) => n.type === type);
  if (!matching.length) return {};
  const last = matching[matching.length - 1];
  const out: Record<string, unknown> = {};
  for (const k of keys) if (last.data[k] !== undefined) out[k] = last.data[k];
  return out;
}

/** Rough footprint per node type — placement and collision detection. */
export const NODE_SIZE: Record<string, { w: number; h: number }> = {
  assistantNode: { w: 300, h: 220 },
  videoGenNode: { w: 340, h: 260 },
  imageGenNode: { w: 300, h: 300 },
  promptNode: { w: 340, h: 220 },
  imageInputNode: { w: 220, h: 180 },
  videoInputNode: { w: 240, h: 190 },
  groupNode: { w: 400, h: 300 },
};

export const FALLBACK_SIZE = { w: 280, h: 240 };

/** Last manually-resized size for the type, else the static default. */
export function getDefaultNodeSize(
  type: string,
  lastNodeSize: Record<string, { w: number; h: number }>,
): { w: number; h: number } {
  return lastNodeSize[type] ?? NODE_SIZE[type] ?? FALLBACK_SIZE;
}
