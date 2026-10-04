import { Interface, keccak256 } from 'ethers';

const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const HASH = /^0x[a-fA-F0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const RPCS: Record<number, string[]> = {
  8453: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'],
  56: ['https://bsc-dataseed.binance.org', 'https://bsc-rpc.publicnode.com'],
};
const workInterface = new Interface([
  'event JobCreated(uint256 indexed jobId,address indexed poster,address token,uint8 jobType,uint256 totalAmount,uint256 pricePerUnit,uint256 maxUnits,uint256 deadline)',
  'event Awarded(uint256 indexed jobId,address indexed worker)',
  'event ProofRegistered(uint256 indexed jobId,address indexed worker,bytes32 proofHash)',
  'event ProofRejected(uint256 indexed jobId,bytes32 proofHash)',
  'event SubmissionApproved(uint256 indexed jobId,address indexed worker,uint256 amountToWorker,uint256 fee,bytes32 proofHash,bytes32 paymentId)',
  'event Disputed(uint256 indexed jobId,address indexed openedBy)',
  'event DisputeResolved(uint256 indexed jobId,address worker,uint256 workerAmount,uint256 posterRefund,bytes32 proofHash)',
  'event JobClosed(uint256 indexed jobId,uint256 refund)',
  'function owner() view returns (address)',
  'function feeRecipient() view returns (address)',
  'function allowedToken(address) view returns (bool)',
]);

type ReceiptLog = { address: string; topics: string[]; data: string };
type ChainReceipt = { status: string; blockNumber: string; transactionHash: string; logs: ReceiptLog[]; contractAddress?: string };

export function receiptTransfers(logs: ReceiptLog[]) {
  return logs.filter(log => ADDRESS.test(log.address) && log.topics?.length === 3 && log.topics[0] === TRANSFER
    && HASH.test(log.topics[1]) && HASH.test(log.topics[2]) && /^0x[0-9a-f]{64}$/i.test(log.data))
    .map(log => ({ token: log.address.toLowerCase(), from: `0x${log.topics[1].slice(-40)}`.toLowerCase(),
      to: `0x${log.topics[2].slice(-40)}`.toLowerCase(), amount: BigInt(log.data).toString() }));
}

async function rpc(chain: number, method: string, params: unknown[], fetcher: typeof fetch) {
  for (const url of RPCS[chain]) {
    try {
      const response = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(10000) });
      if (!response.ok) continue;
      const result = await response.json() as { result?: unknown; error?: unknown };
      if (!result.error && result.result !== undefined) return result.result;
    } catch { /* try the independent provider */ }
  }
  throw new Error('Chain receipt verification is temporarily unavailable');
}

function response(request: Request, body: unknown, status = 200) {
  const origin = request.headers.get('Origin');
  const allowed = origin && ['https://dehub.io','https://staging.dehub.io'].includes(origin);
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    ...(allowed ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type,x-dehub-token',
  } });
}

export async function handleWorkReceipt(request: Request, env: { WORK_RECEIPT_SIGNING_KEY?: string }, fetcher: typeof fetch = fetch) {
  if (request.method === 'OPTIONS') return response(request, {}, 204);
  if (request.method !== 'POST') return response(request, { error: 'Use POST' }, 405);
  if (!env.WORK_RECEIPT_SIGNING_KEY) return response(request, { error: 'Receipt verification is not configured' }, 503);
  try {
    const token = request.headers.get('x-dehub-token');
    if (!token) return response(request, { error: 'Sign in to verify this transaction' }, 401);
    const auth = await fetcher('https://api.dehub.io/api/auth/verify', {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000),
    });
    if (!auth.ok) return response(request, { error: 'Session verification failed' }, auth.status >= 500 ? 503 : 401);
    const identity = await auth.json() as { address?: string };
    if (!identity.address || !ADDRESS.test(identity.address)) return response(request, { error: 'Invalid wallet session' }, 401);
    const raw = await request.text();
    if (raw.length > 4096) return response(request, { error: 'Request too large' }, 413);
    const input = JSON.parse(raw) as { id?: string; hash?: string; chain?: number; escrow?: string };
    if (!input.id || !UUID.test(input.id) || !input.hash || !HASH.test(input.hash) || !RPCS[input.chain ?? 0]
      || (input.escrow && !ADDRESS.test(input.escrow))) return response(request, { error: 'Invalid receipt request' }, 400);
    const chain = input.chain!;
    const receipt = await rpc(chain, 'eth_getTransactionReceipt', [input.hash], fetcher) as ChainReceipt | null;
    if (!receipt) return response(request, { state: 'pending' }, 202);
    if (receipt.transactionHash.toLowerCase() !== input.hash.toLowerCase()
      || !['0x0','0x1'].includes(receipt.status)) throw new Error('Invalid chain receipt');
    const [height, block] = await Promise.all([
      rpc(chain, 'eth_blockNumber', [], fetcher),
      rpc(chain, 'eth_getBlockByNumber', [receipt.blockNumber, false], fetcher),
    ]) as [string, { timestamp: string }];
    if (BigInt(height) < BigInt(receipt.blockNumber) + 1n) return response(request, { state: 'pending' }, 202);
    const createdJobs = receipt.logs.flatMap(log => {
      try {
        const event = workInterface.parseLog(log);
        if (event?.name !== 'JobCreated') return [];
        return [{ escrow: log.address.toLowerCase(), jobId: event.args.jobId.toString(), poster: event.args.poster.toLowerCase(),
          token: event.args.token.toLowerCase(), jobType: Number(event.args.jobType), amount: event.args.totalAmount.toString(),
          pricePerUnit: event.args.pricePerUnit.toString(), maxUnits: event.args.maxUnits.toString(), deadline: event.args.deadline.toString() }];
      } catch { return []; }
    });
    const events = receipt.logs.flatMap(log => {
      try {
        const event = workInterface.parseLog(log);
        if (!event) return [];
        return [{ name: event.name, escrow: log.address.toLowerCase(), ...Object.fromEntries(
          event.fragment.inputs.map((field,index) => [field.name,String(event.args[index]).toLowerCase()])
        ) }];
      } catch { return []; }
    });
    let deployment: { address: string; codeHash: string; owner: string; feeRecipient: string; dhbAllowed: boolean; usdcAllowed: boolean } | undefined;
    if (input.escrow) {
      const code = await rpc(chain, 'eth_getCode', [input.escrow, 'latest'], fetcher) as string;
      const ownerData = await rpc(chain, 'eth_call', [{ to: input.escrow, data: workInterface.encodeFunctionData('owner') }, 'latest'], fetcher) as string;
      if (code === '0x') throw new Error('The escrow contract is not deployed');
      const read = async (name: string,args: unknown[] = []) => workInterface.decodeFunctionResult(name,
        await rpc(chain,'eth_call',[{to:input.escrow,data:workInterface.encodeFunctionData(name,args)},'latest'],fetcher) as string)[0];
      const [feeRecipient,dhbAllowed,usdcAllowed] = await Promise.all([
        read('feeRecipient'),read('allowedToken',['0xd20ab1015f6a2de4a6fddebab270113f689c2f7c']),read('allowedToken',['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913']),
      ]);
      deployment = { address: input.escrow.toLowerCase(), codeHash: keccak256(code), owner: workInterface.decodeFunctionResult('owner', ownerData)[0].toLowerCase(),
        feeRecipient: feeRecipient.toLowerCase(),dhbAllowed,usdcAllowed };
    }
    const payload = JSON.stringify({ id: input.id, chain, hash: input.hash.toLowerCase(),
      status: receipt.status === '0x1' ? 'confirmed' : 'failed',
      minedAt: new Date(Number(BigInt(block.timestamp)) * 1000).toISOString(),
      transfers: receiptTransfers(receipt.logs), createdJobs, events, ...(deployment ? { deployment } : {}),
    });
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.WORK_RECEIPT_SIGNING_KEY),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))))
      .map(byte => byte.toString(16).padStart(2,'0')).join('');
    return response(request, { payload, signature });
  } catch (error) {
    return response(request, { error: error instanceof Error ? error.message : 'Receipt verification failed' }, 502);
  }
}
