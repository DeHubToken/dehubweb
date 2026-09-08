import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Interface } from 'ethers';

const mocks = vi.hoisted(() => ({
  smart: true,
  unlock: vi.fn(async () => {}),
  base: vi.fn(), chain: vi.fn(),
  account: { address: '0x1111111111111111111111111111111111111111', isConnected: true, chainId: 56 },
  switch: vi.fn(), send: vi.fn(),
}));
vi.mock('@/lib/connection-source', () => ({ isSmartWalletSession: () => mocks.smart }));
vi.mock('@/lib/smart-wallet', () => ({ ensureWalletUnlocked: mocks.unlock }));
vi.mock('@/lib/web3auth', () => ({
  setupAAProvider: mocks.base, setupAAProviderForChain: mocks.chain,
  getAAProvider: vi.fn(), getOrInitWeb3Auth: vi.fn(),
}));
vi.mock('@/lib/wagmi', () => ({ wagmiConfig: {} }));
vi.mock('@wagmi/core', () => ({
  getAccount: () => mocks.account, switchChain: mocks.switch,
  sendTransaction: mocks.send, waitForTransactionReceipt: vi.fn(),
}));
vi.mock('./dhb-token', () => ({
  BASE_CHAIN_ID: 8453, initChainRpcUrls: vi.fn(async () => {}),
  CHAIN_CONFIGS: { 8453: { rpcUrl: 'https://base.invalid' }, 56: { rpcUrl: 'https://bnb.invalid' } },
}));
import { getActiveProvider, getWalletAddress, switchChain, writeContractAA, writeBatchAA } from './aa-utils';
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
  mocks.smart = true;
  mocks.account.chainId = 56;
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

  it('reads public balances while locked without trying to unlock', async () => {
    localStorage.setItem('dehub_wallet', safe);
    expect(await getWalletAddress({ silent: true })).toBe(safe);
    expect(mocks.unlock).not.toHaveBeenCalled();
    expect(mocks.base).not.toHaveBeenCalled();
  });
});
