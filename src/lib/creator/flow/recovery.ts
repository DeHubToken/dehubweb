import { durableFlowNodes, type GraphNode, type GraphEdge } from './graphContract';

export interface FlowReceipt {
  wallet: string;
  flowId: string;
  signature: string;
  nodeIds: string[];
  expectedPaidNodeIds: string[];
  jobIds: Record<string, string>;
  completed: string[];
  started: string[];
  txHash?: string;
  totalDhb: number;
}
const key = (wallet: string, flowId: string) => `dehub-flow-run-v1:${wallet.toLowerCase()}:${flowId}`;
export function graphSignature(nodes: GraphNode[], edges: GraphEdge[]): string {
  const settings = ['prompt', 'localPrompt', 'model', 'assistantModel', 'aspectRatio', 'duration', 'resolution', 'negativePrompt', 'seed', 'audioTask', 'voiceId', 'inputAssetId', 'audioAssetId', 'imageUrl', 'videoUrl', 'inputImage', 'captureSeconds'];
  return JSON.stringify({ nodes: durableFlowNodes(nodes).map(node => ({ id: node.id, type: node.type,
    data: Object.fromEntries(settings.filter(field => !(field === 'prompt' && node.type !== 'promptNode') && !(field === 'audioAssetId' && node.type === 'audioGenNode') && !(['imageUrl', 'videoUrl'].includes(field) && (node.type === 'imageGenNode' || node.type === 'videoGenNode'))).map(field => [field, node.data[field]])) })),
    edges: edges.map(({ source, target, sourceHandle, targetHandle }) => ({ source, target, sourceHandle, targetHandle })) });
}
export function readReceipt(wallet: string, flowId: string): FlowReceipt | null {
  const raw = localStorage.getItem(key(wallet, flowId));
  if (!raw) return null;
  const receipt = JSON.parse(raw) as FlowReceipt;
  if (receipt.wallet !== wallet.toLowerCase() || receipt.flowId !== flowId || !Array.isArray(receipt.expectedPaidNodeIds) || !Array.isArray(receipt.completed) || !receipt.jobIds) throw new Error('Invalid saved Flow run');
  return receipt;
}
/** Fail closed before payment/submission when durable storage is unavailable. */
export function saveReceipt(receipt: FlowReceipt): void {
  localStorage.setItem(key(receipt.wallet, receipt.flowId), JSON.stringify(receipt));
}
export function reserveReceipt(wallet: string, flowId: string, signature: string, nodeIds: string[], paidIds: string[], totalDhb: number): FlowReceipt {
  const existing = readReceipt(wallet, flowId);
  if (existing && (existing.txHash || existing.started.length)) {
    if (existing.signature !== signature) throw new Error('Restore the saved Flow graph before resuming its run.');
    return existing;
  }
  const receipt: FlowReceipt = { wallet: wallet.toLowerCase(), flowId, signature, nodeIds, expectedPaidNodeIds: paidIds,
    jobIds: Object.fromEntries(paidIds.map(id => [id, crypto.randomUUID()])), completed: [], started: [], totalDhb };
  saveReceipt(receipt);
  return receipt;
}
export function finishReceipt(receipt: FlowReceipt): boolean {
  if (!receipt.nodeIds.every(id => receipt.completed.includes(id)) || !receipt.expectedPaidNodeIds.every(id => receipt.completed.includes(id))) return false;
  localStorage.removeItem(key(receipt.wallet, receipt.flowId));
  return true;
}
