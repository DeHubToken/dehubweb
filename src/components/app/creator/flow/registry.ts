/**
 * Creator Flow — the node and edge component maps React Flow renders with.
 * Shared by the editor canvas and the public viewer so they never drift.
 */
import PromptNode from './nodes/PromptNode';
import ImageInputNode from './nodes/ImageInputNode';
import VideoInputNode from './nodes/VideoInputNode';
import ImageGenNode from './nodes/ImageGenNode';
import VideoGenNode from './nodes/VideoGenNode';
import AssistantNode from './nodes/AssistantNode';
import GroupNode from './nodes/GroupNode';
import CuttableEdge from './CuttableEdge';

export const nodeTypes = {
  promptNode: PromptNode,
  imageInputNode: ImageInputNode,
  videoInputNode: VideoInputNode,
  imageGenNode: ImageGenNode,
  videoGenNode: VideoGenNode,
  assistantNode: AssistantNode,
  groupNode: GroupNode,
};

export const edgeTypes = {
  default: CuttableEdge,
};
