import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const html = readFileSync(resolve(__dirname, '../../public/trenchstar-game/index.html'), 'utf8');
function section(start: string, end: string) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Missing trading section: ${start}`);
  return html.slice(from, to);
}
const amounts = section('function fmtUnits(', '/* Reads go');
const identity = section('function captureTradeWallet(', '/* Which pool.');
const network = section('async function switchTo(', 'const switchToBase=');
const sell = section('async function planSellEvm(', 'async function waitEvmTx(');
const solPlan = section('async function planSol(', '/* ---- the book');

function evmHarness() {
  const ch = { id: 8453, hex: '0x2105', key: 'base', router: 'router', weth: 'weth', rpc: 'rpc' };
  const address = '0x1111111111111111111111111111111111111111';
  const sent: unknown[] = [];
  const provider = { request: vi.fn(async ({ method, params }: any) => {
    if (method === 'eth_accounts') return [address];
    if (method === 'eth_chainId') return ch.hex;
    if (method === 'eth_sendTransaction') { sent.push(params[0]); return 'hash'; }
    return null;
  }) };
  const context: any = {
    wallet: { addr: address, provider, chainId: ch.id }, walletRevision: 0, localTradingWallet: null,
    CHAINS: { base: ch }, evmAddr: () => context.wallet.addr, evmSigner: () => 'injected',
    routeEvm: vi.fn(async () => ({ out: 1000n, fee: 500 })),
    ethCallOn: vi.fn(async () => '0x0'), hexToBig: BigInt,
    SEL: { allowance: 'allow', approve: 'approve' }, encAddr: (s: string) => s, encUint: String,
    encMulticall: () => 'swap', encExactInputSingle: () => 'swap', encUnwrap: () => 'unwrap', ROUTER_SELF: 'self',
    rpcPublic: vi.fn(async () => '0x'), watchEvmTx: vi.fn(),
    waitEvmTx: vi.fn(async () => ({ status: '0x1' })),
  };
  runInNewContext(identity + network + sell, context);
  return { context, ch, provider, sent, market: { chain: 'base', tokenAddr: 'token' } };
}

describe('Chartopia amount precision', () => {
  const context: any = {};
  runInNewContext(amounts, context);
  it('accepts small amounts that JavaScript prints in scientific notation', () => {
    expect(context.toUnits(1e-7, 18)).toBe(100000000000n);
    expect(context.toUnits(1e-9, 9)).toBe(1n);
    expect(context.toUnits('1.23456789', 6)).toBe(1234567n);
  });
  it('preserves zero-decimal holdings and rejects zero or invalid inputs', () => {
    expect(context.fmtUnits(123n, 0)).toBe(123);
    expect(context.toUnits('123', 0)).toBe(123n);
    for (const amount of [0, -1, Infinity, NaN, '0.0000000001', '1junk']) {
      expect(() => context.toUnits(amount, 9)).toThrow();
    }
  });
});

describe('Robinhood pool discovery', () => {
  it('pages within the RPC block limit and finds older pools without gaps', async () => {
    const ranges: Array<[bigint, bigint]> = [];
    const log = { data: 'pool key' };
    const context: any = {
      V4: { robinhood: { logs: true, logRange: 10_000_000, pm: 'manager' } }, V4_INIT: 'topic',
      hexBig: (n: bigint) => '0x' + n.toString(16),
      rpcPublic: async (_: string, method: string, params: any[]) => {
        if (method === 'eth_blockNumber') return '0x5d6025c';
        ranges.push([BigInt(params[0].fromBlock), BigInt(params[0].toBlock)]);
        return ranges.length === 3 ? [log] : [];
      },
    };
    runInNewContext(section('async function v4InitLog(', 'async function v4Key('), context);
    expect(await context.v4InitLog({ key: 'robinhood', rpc: 'rpc' }, 'pool')).toBe(log);
    expect(ranges).toHaveLength(3);
    for (const [start, end] of ranges) expect(end - start + 1n).toBe(10_000_000n);
    expect(ranges[1][1]).toBe(ranges[0][0] - 1n);
    expect(ranges[2][1]).toBe(ranges[1][0] - 1n);
  });
});

describe('Chartopia EVM execution', () => {
  it.each([null, { status: '0x0' }])('does not send a swap after unsuccessful approval %j', async receipt => {
    const { context, market, sent } = evmHarness();
    context.waitEvmTx.mockResolvedValue(receipt);
    const plan = await context.planSellEvm(market, 100n, 1);
    await expect(plan.send()).rejects.toThrow(/Approval|approval/);
    expect(sent).toHaveLength(1);
    expect(context.rpcPublic).not.toHaveBeenCalled();
  });
  it('simulates and sends only after the approval succeeds', async () => {
    const { context, market, sent } = evmHarness();
    const plan = await context.planSellEvm(market, 100n, 1);
    expect(await plan.send()).toBe('hash');
    expect(sent).toHaveLength(2);
    expect(context.rpcPublic).toHaveBeenCalledWith('rpc', 'eth_call', [expect.objectContaining({ data: 'swap' }), 'latest']);
  });
  it('invalidates a quote when its wallet changes', async () => {
    const { context, market, sent } = evmHarness();
    const plan = await context.planSellEvm(market, 100n, 1);
    context.walletRevision++;
    await expect(plan.send()).rejects.toThrow('Wallet changed');
    expect(sent).toHaveLength(0);
  });
  it('stops if the wallet changes while approval is confirming', async () => {
    const { context, market, sent } = evmHarness();
    context.waitEvmTx.mockImplementation(async () => { context.wallet.addr = 'another'; return { status: '0x1' }; });
    const plan = await context.planSellEvm(market, 100n, 1);
    await expect(plan.send()).rejects.toThrow('Wallet changed');
    expect(sent).toHaveLength(1);
  });
  it('does not trust a cached chain ID', async () => {
    const { context, market, provider, sent } = evmHarness();
    provider.request.mockImplementation(async ({ method }: any) => method === 'eth_chainId' ? '0x1' : null);
    const plan = await context.planSellEvm(market, 100n, 1);
    await expect(plan.send()).rejects.toThrow('network changed');
    expect(sent).toHaveLength(0);
  });
  it('explicitly switches after adding a missing network', async () => {
    const { context, provider, ch } = evmHarness();
    let current = '0x1', switches = 0;
    provider.request.mockImplementation(async ({ method }: any) => {
      if (method === 'eth_chainId') return current;
      if (method === 'wallet_switchEthereumChain') {
        if (++switches === 1) throw Object.assign(new Error('Missing chain'), { code: 4902 });
        current = ch.hex;
      }
      return null;
    });
    await context.switchTo(ch);
    expect(switches).toBe(2);
    expect(current).toBe(ch.hex);
  });
});

describe('Chartopia Solana execution', () => {
  it('does not sign a transaction built for a wallet that changed during the request', async () => {
    const context: any = {
      CHAINS: { solana: { sol: true, wsol: 'SOL' } }, sol: { addr: 'first', prov: {} },
      walletRevision: 0, localTradingWallet: null,
      jupQuote: async () => ({ outAmount: '100', otherAmountThreshold: '99' }),
      jupSwap: async () => { context.sol.addr = 'second'; return 'serialized'; },
      solSend: vi.fn(),
    };
    runInNewContext(identity + solPlan, context);
    const plan = await context.planSol({ tokenAddr: 'mint' }, 'buy', 100n, 1);
    await expect(plan.send()).rejects.toThrow('Wallet changed');
    expect(context.solSend).not.toHaveBeenCalled();
  });
});

describe('Chartopia quote review', () => {
  it.each(['ticket', 'wallet'])('discards a quote when the %s changes during its request', async change => {
    let finish!: (plan: object) => void;
    let click!: () => Promise<void>;
    const elements: Record<string, any> = {
      '#tdGo': { dataset: {} }, '#tdMsg': {},
    };
    const ch = { key: 'base', dec: 18 };
    const market = { chain: 'base', tokenAddr: 'token' };
    const context: any = {
      td: { m: market, busy: false, side: 'buy', amt: 1, slip: 1, revision: 0 }, walletRevision: 0,
      $: (id: string) => ({ ...elements[id], addEventListener: (_: string, fn: typeof click) => { click = fn; } }),
      tdRender: () => {}, CHAINS: { base: ch }, clearTimeout: () => {},
      planBuyEvm: () => new Promise(resolve => { finish = resolve; }),
      ethCallOn: async () => '0x12', hexToBig: BigInt, SEL: { decimals: 'decimals' },
    };
    runInNewContext(section('function tdDisarm()', '/* Two presses:') +
      section("$('#tdGo').addEventListener('click',async()=>{", 'function renderFills()'), context);
    const pending = click();
    if (change === 'ticket') context.tdDisarm(); else context.walletRevision++;
    finish({ ch, m: market, side: 'buy' });
    await pending;
    expect(context.td.plan).toBeNull();
    expect(context.td.busy).toBe(false);
  });
});
