import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Interface } from 'ethers';

const mocks = vi.hoisted(() => ({
  smart: true,
  unlock: vi.fn(async () => {}),
  base: vi.fn(), chain: vi.fn(),
  account: { address: '0x1111111111111111111111111111111111111111', isConnected: true, chainId: 56 },
  status: 'connected',
  connector: { getChainId: vi.fn(), getProvider: vi.fn() },
  watch: vi.fn(),
  switch: vi.fn(), send: vi.fn(), receipt: vi.fn(),
}));
vi.mock('viem', async (importOriginal) => ({
  ...await importOriginal<typeof import('viem')>(),
  createPublicClient: vi.fn(() => ({ waitForTransactionReceipt: mocks.receipt })),
}));
vi.mock('@/lib/connection-source', () => ({ isSmartWalletSession: () => mocks.smart }));
vi.mock('@/lib/smart-wallet', () => ({ ensureWalletUnlocked: mocks.unlock }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: vi.fn() }) }));
vi.mock('@/lib/web3auth', () => ({
  setupAAProvider: mocks.base, setupAAProviderForChain: mocks.chain,
  getAAProvider: vi.fn(), getOrInitWeb3Auth: vi.fn(),
}));
vi.mock('@/lib/wagmi', () => ({ wagmiConfig: {} }));
vi.mock('@wagmi/core', () => ({
  getAccount: () => ({ ...mocks.account, status: mocks.status, connector: mocks.connector }),
  watchAccount: mocks.watch, switchChain: mocks.switch,
  sendTransaction: mocks.send, waitForTransactionReceipt: vi.fn(),
}));
vi.mock('./dhb-token', () => ({
  BASE_CHAIN_ID: 8453, initChainRpcUrls: vi.fn(async () => {}),
  CHAIN_CONFIGS: { 8453: { rpcUrl: 'https://base.invalid' }, 56: { rpcUrl: 'https://bnb.invalid' } },
}));
import { getActiveProvider, getWalletAddress, SELF_FUNDED_GAS_INSUFFICIENT, switchChain, writeContractAA, writeBatchAA } from './aa-utils';
import { sendNativeToken } from '../wallet/send';
import { WalletActionCancelledError } from '../wallet-unlock-flow';

const recipient = '0x2222222222222222222222222222222222222222';
const safe = '0x3333333333333333333333333333333333333333';
const abi = new Interface(['function transfer(address to, uint256 amount) returns (bool)']);
const provider = (chain: number) => ({ request: vi.fn(async ({ method }: { method: string }) => {
  if (method === 'eth_chainId') return `0x${chain.toString(16)}`;
  if (method === 'eth_accounts') return [safe];
  if (method === 'eth_estimateGas') return '0x5208';
  if (method === 'eth_sendTransaction') return '0xhash';
}) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mocks.smart = true;
  mocks.status = 'connected';
  mocks.account.isConnected = true;
  mocks.account.chainId = 56;
  mocks.connector.getChainId.mockResolvedValue(56);
  mocks.connector.getProvider.mockResolvedValue({});
  mocks.watch.mockReturnValue(vi.fn());
  mocks.unlock.mockResolvedValue(undefined);
  mocks.base.mockResolvedValue(provider(8453));
  mocks.chain.mockResolvedValue(provider(56));
  localStorage.clear();
});

describe('chain-aware wallet actions', () => {
  it('prepares the requested smart-wallet chain without an external network prompt', async () => {
    await switchChain(56);
    expect(mocks.unlock).toHaveBeenCalled();
    expect(mocks.chain).toHaveBeenCalledWith(56);
    expect(mocks.base).not.toHaveBeenCalled();
    expect(mocks.switch).not.toHaveBeenCalled();
  });

  it('can explicitly use a self-funded smart account instead of a paymaster', async () => {
    const signer = provider(1);
    mocks.chain.mockResolvedValue(signer);
    await expect(getActiveProvider(1, { sponsored: false })).resolves.toMatchObject({ provider: signer });
    expect(mocks.chain).toHaveBeenCalledWith(1, { sponsored: false });
    expect(mocks.base).not.toHaveBeenCalled();
  });

  it('marks only a self-funded prefund failure for sponsorship fallback', async () => {
    const signer = {
      ...provider(1),
      smartAccount: {},
      bundlerClient: { sendUserOperation: vi.fn().mockRejectedValue(new Error("AA21 didn't pay prefund")) },
    };
    mocks.chain.mockResolvedValue(signer);
    const action = writeBatchAA([{ to: recipient, data: '0x' }], { chainId: 1, sponsored: false });
    await expect(action).rejects.toThrow(SELF_FUNDED_GAS_INSUFFICIENT);
  });

  it('does not retry with sponsorship after an operation was already submitted', async () => {
    mocks.chain.mockResolvedValue({ ...provider(1), smartAccount: {}, bundlerClient: {
      sendUserOperation: vi.fn().mockResolvedValue('0xoperation'),
      waitForUserOperationReceipt: vi.fn().mockRejectedValue(new Error('prefund receipt lookup failed')),
    } });
    await expect(writeBatchAA([{ to: recipient, data: '0x' }], { chainId: 1, sponsored: false }))
      .rejects.not.toThrow(SELF_FUNDED_GAS_INSUFFICIENT);
  });

  it('never substitutes Base when the requested chain is unavailable or mismatched', async () => {
    mocks.chain.mockResolvedValueOnce(null).mockResolvedValueOnce(provider(8453));
    await expect(getActiveProvider(56)).rejects.toThrow('NO_SIGNER_ON_CHAIN:56');
    await expect(getActiveProvider(56)).rejects.toThrow('NO_SIGNER_ON_CHAIN:56');
    expect(mocks.base).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('waits for unlock before sending the original contract call once', async () => {
    let unlock!: () => void;
    mocks.unlock.mockReturnValueOnce(new Promise<void>(resolve => { unlock = resolve; }));
    const signer = provider(56);
    mocks.chain.mockResolvedValue(signer);
    const action = writeContractAA(recipient, abi, 'transfer', [recipient, 12n], { chainId: 56 });
    await vi.waitFor(() => expect(mocks.unlock).toHaveBeenCalled());
    expect(signer.request).not.toHaveBeenCalled();
    unlock();
    await action;
    const sends = signer.request.mock.calls.filter(([request]) => request.method === 'eth_sendTransaction');
    expect(sends).toHaveLength(1);
    expect(sends[0][0]).toMatchObject({ params: [{ from: safe, to: recipient, data: abi.encodeFunctionData('transfer', [recipient, 12n]) }] });
  });

  it('sends through the smart-account bundler without calling the owner gas estimator', async () => {
    const signer = provider(8453);
    signer.request.mockImplementation(async ({ method }) => {
      if (method === 'eth_estimateGas') return new Promise<string>(() => {});
      if (method === 'eth_chainId') return '0x2105';
      if (method === 'eth_accounts') return [safe];
      if (method === 'eth_sendTransaction') return '0xhash';
    });
    mocks.base.mockResolvedValue(signer);
    const result = await writeContractAA(recipient, abi, 'transfer', [recipient, 12n]);
    expect(result.hash).toBe('0xhash');
    expect(signer.request.mock.calls.some(([request]) => request.method === 'eth_estimateGas')).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('confirms a mined smart-wallet approval without reading through its owner RPC', async () => {
    const signer = { ...provider(8453), publicClient: {
      waitForTransactionReceipt: vi.fn(async () => ({ status: 'success', transactionHash: '0xhash' })),
    } };
    mocks.base.mockResolvedValue(signer);
    mocks.receipt.mockImplementation(signer.publicClient.waitForTransactionReceipt);
    const tx = await writeContractAA(recipient, abi, 'transfer', [recipient, 12n]);
    expect(await tx.wait()).toEqual({ status: 1, hash: '0xhash' });
    expect(mocks.receipt).toHaveBeenCalledWith(expect.objectContaining({ hash: '0xhash', confirmations: 1, timeout: 60000 }));
    expect(signer.request.mock.calls.some(([request]) => request.method === 'eth_getTransactionReceipt')).toBe(false);
  });

  it('preserves a reverted receipt and never reports it as success', async () => {
    const signer = { ...provider(8453), publicClient: {
      waitForTransactionReceipt: vi.fn(async () => ({ status: 'reverted', transactionHash: '0xhash' })),
    } };
    mocks.base.mockResolvedValue(signer);
    mocks.receipt.mockImplementation(signer.publicClient.waitForTransactionReceipt);
    const tx = await writeContractAA(recipient, abi, 'transfer', [recipient, 12n]);
    expect(await tx.wait()).toEqual({ status: 0, hash: '0xhash' });
  });

  it('cancellation prevents contract, native and batch sends', async () => {
    mocks.unlock.mockRejectedValue(new WalletActionCancelledError());
    await expect(writeContractAA(recipient, abi, 'transfer', [recipient, 12n])).rejects.toBeInstanceOf(WalletActionCancelledError);
    await expect(sendNativeToken(recipient, '1', 18, 56)).rejects.toBeInstanceOf(WalletActionCancelledError);
    await expect(writeBatchAA([{ to: recipient, data: '0x' }])).rejects.toBeInstanceOf(WalletActionCancelledError);
    expect(mocks.base).not.toHaveBeenCalled();
    expect(mocks.chain).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('sends native BNB from the BNB Safe, not the owner or Base', async () => {
    const signer = provider(56);
    mocks.chain.mockResolvedValue(signer);
    await sendNativeToken(recipient, '1', 18, 56);
    expect(signer.request).toHaveBeenCalledWith({ method: 'eth_sendTransaction', params: [{ from: safe, to: recipient, value: '0xde0b6b3a7640000' }] });
    expect(mocks.base).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not swallow an external wallet rejecting a switch to Base', async () => {
    mocks.smart = false;
    const rejection = new Error('User rejected network change');
    mocks.switch.mockRejectedValueOnce(rejection);
    await expect(writeContractAA(recipient, abi, 'transfer', [recipient, 12n])).rejects.toBe(rejection);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('waits for a restored external connection instead of using its persisted address', async () => {
    mocks.smart = false;
    mocks.status = 'reconnecting';
    mocks.account.isConnected = false;
    const unwatch = vi.fn();
    let changed!: () => void;
    mocks.watch.mockImplementation((_config, { onChange }) => { changed = onChange; return unwatch; });
    let ready = false;
    const pending = getActiveProvider(56).then(result => { ready = true; return result; });
    await Promise.resolve();
    expect(ready).toBe(false);
    mocks.status = 'connected';
    mocks.account.isConnected = true;
    changed();
    await expect(pending).resolves.toEqual({ provider: null, isWeb3Auth: false });
    expect(unwatch).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('accepts a completed network switch while the cached account still has the old chain', async () => {
    mocks.smart = false;
    mocks.connector.getChainId.mockResolvedValueOnce(56).mockResolvedValueOnce(8453);
    await expect(switchChain(8453)).resolves.toBeUndefined();
    expect(mocks.account.chainId).toBe(56);
    expect(mocks.switch).toHaveBeenCalledWith({}, { chainId: 8453, connector: mocks.connector });
  });

  it('rejects a wallet that remains on the wrong network', async () => {
    mocks.smart = false;
    await expect(switchChain(8453)).rejects.toThrow('The wallet did not change networks');
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('restores the transaction relay before sending once through the same connector', async () => {
    mocks.smart = false;
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ result: '0x5208' }) })));
    let reopen!: () => void;
    const relay = { connected: false, restartTransport: vi.fn(() => new Promise<void>(resolve => {
      reopen = () => { relay.connected = true; resolve(); };
    })) };
    mocks.connector.getProvider.mockResolvedValue({ signer: { client: { core: { relayer: relay } } } });
    mocks.send.mockResolvedValueOnce('0xhash');
    const action = writeContractAA(recipient, abi, 'transfer', [recipient, 12n], { chainId: 56 });
    await vi.waitFor(() => expect(relay.restartTransport).toHaveBeenCalledTimes(1));
    expect(mocks.send).not.toHaveBeenCalled();
    reopen();
    await expect(action).resolves.toMatchObject({ hash: '0xhash' });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith({}, expect.objectContaining({ connector: mocks.connector, chainId: 56 }));
  });

  it('does not send when the relay cannot reopen', async () => {
    mocks.smart = false;
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ result: '0x5208' }) })));
    mocks.connector.getProvider.mockResolvedValue({ client: { core: { relayer: {
      restartTransport: vi.fn().mockRejectedValue(new Error('Offline')),
    } } } });
    await expect(writeContractAA(recipient, abi, 'transfer', [recipient, 12n], { chainId: 56 })).rejects.toThrow('Offline');
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('reads public balances while locked without trying to unlock', async () => {
    localStorage.setItem('dehub_wallet', safe);
    expect(await getWalletAddress({ silent: true })).toBe(safe);
    expect(mocks.unlock).not.toHaveBeenCalled();
    expect(mocks.base).not.toHaveBeenCalled();
  });
});
