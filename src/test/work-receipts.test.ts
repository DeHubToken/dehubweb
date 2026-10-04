import { describe, expect, it, vi } from 'vitest';
import { handleWorkReceipt, receiptTransfers } from '../../server/work-receipts';
const hash = '0x' + 'a'.repeat(64);
const id = '12345678-1234-1234-1234-123456789abc';
const wallet = '0x' + '1'.repeat(40);
const request = () => new Request('https://dehub.io/api/work/receipt',{method:'POST',headers:{'x-dehub-token':'session'},body:JSON.stringify({id,hash,chain:8453})});
function provider(receipt: unknown, height = '0x11') {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/auth/verify')) return Response.json({address:wallet});
    const call = JSON.parse(String(init?.body));
    const result = call.method === 'eth_getTransactionReceipt' ? receipt : call.method === 'eth_blockNumber' ? height : {timestamp:'0x60000000'};
    return Response.json({result});
  });
}
describe('bounty chain receipts', () => {
  it('does not attest an unmined or singly confirmed transaction', async () => {
    expect((await handleWorkReceipt(request(),{WORK_RECEIPT_SIGNING_KEY:'test'},provider(null))).status).toBe(202);
    const receipt = {transactionHash:hash,status:'0x1',blockNumber:'0x10',logs:[]};
    expect((await handleWorkReceipt(request(),{WORK_RECEIPT_SIGNING_KEY:'test'},provider(receipt,'0x10'))).status).toBe(202);
  });
  it('attests a reverted transaction as failed', async () => {
    const receipt = {transactionHash:hash,status:'0x0',blockNumber:'0x10',logs:[]};
    const result = await (await handleWorkReceipt(request(),{WORK_RECEIPT_SIGNING_KEY:'test'},provider(receipt))).json();
    expect(JSON.parse(result.payload)).toMatchObject({id,chain:8453,hash,status:'failed',transfers:[]});
    expect(result.signature).toMatch(/^[a-f0-9]{64}$/);
  });
  it('rejects a forged login even if a chain receipt exists', async () => {
    const fetcher = vi.fn(async () => new Response(null,{status:401}));
    expect((await handleWorkReceipt(request(),{WORK_RECEIPT_SIGNING_KEY:'test'},fetcher)).status).toBe(401);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps transfer amounts as exact integers and rejects malformed log fields', () => {
    const token = '0x' + '2'.repeat(40);
    const topic = '0x' + '0'.repeat(24) + '1'.repeat(40);
    const log = {address:token,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',topic,topic],data:'0x' + (10n ** 26n).toString(16).padStart(64,'0')};
    expect(receiptTransfers([log,{...log,data:'0xgarbage'}])).toEqual([{token,from:wallet,to:wallet,amount:'100000000000000000000000000'}]);
  });
});
