import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  smart: true, address: vi.fn(), sign: vi.fn(), phantom: vi.fn(), connect: vi.fn(),
  build: vi.fn(), confirm: vi.fn(), broadcast: vi.fn(),
  transaction: { serialize: () => new Uint8Array([1]) },
}));
vi.mock('@/lib/connection-source', () => ({ isSmartWalletSession: () => mocks.smart }));
vi.mock('@/lib/smart-wallet', () => ({ getDerivedSolanaAddress: mocks.address, signDerivedSolanaTransaction: mocks.sign }));
vi.mock('../wallet', () => ({ getSolanaProvider: mocks.phantom, connectSolanaWallet: mocks.connect }));
vi.mock('@/lib/api/dehub/solana', () => ({ buildSolanaPayment: mocks.build, confirmSolanaPayment: mocks.confirm }));
vi.mock('@solana/web3.js', () => ({
  Transaction: { from: () => mocks.transaction },
  Connection: class { sendRawTransaction = mocks.broadcast; confirmTransaction = vi.fn(); },
}));
import { sendSolanaPayment } from '../payment';
import { WalletActionCancelledError } from '@/lib/wallet-unlock-flow';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.smart = true;
  mocks.address.mockResolvedValue('derived-solana-address');
  mocks.sign.mockResolvedValue(mocks.transaction);
  mocks.build.mockResolvedValue({ transaction: btoa('tx'), recipient: 'recipient', amount: 1, decimals: 9 });
  mocks.broadcast.mockResolvedValue('signature');
});
describe('Solana payment wallet selection', () => {
  it('unlocks the built-in wallet before building the payment, without requiring Phantom', async () => {
    let unlock!: (address: string) => void;
    mocks.address.mockReturnValueOnce(new Promise<string>(resolve => { unlock = resolve; }));
    const action = sendSolanaPayment({ tokenId: 42, kind: 'ppv' });
    await vi.waitFor(() => expect(mocks.address).toHaveBeenCalledOnce());
    expect(mocks.build).not.toHaveBeenCalled();
    unlock('derived-solana-address');
    await action;
    expect(mocks.build).toHaveBeenCalledWith(expect.objectContaining({ payerWallet: 'derived-solana-address' }));
    expect(mocks.sign).toHaveBeenCalledWith(mocks.transaction);
    expect(mocks.broadcast).toHaveBeenCalledOnce();
    expect(mocks.phantom).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it('does not build or broadcast after unlock cancellation', async () => {
    mocks.address.mockRejectedValueOnce(new WalletActionCancelledError());
    await expect(sendSolanaPayment({ tokenId: 42, kind: 'ppv' })).rejects.toBeInstanceOf(WalletActionCancelledError);
    expect(mocks.build).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });
  it('keeps external-wallet users on their connected Phantom signer', async () => {
    mocks.smart = false;
    const signTransaction = vi.fn().mockResolvedValue(mocks.transaction);
    mocks.phantom.mockReturnValue({ signTransaction });
    mocks.connect.mockResolvedValue('phantom-address');
    await sendSolanaPayment({ tokenId: 42, kind: 'ppv' });
    expect(mocks.build).toHaveBeenCalledWith(expect.objectContaining({ payerWallet: 'phantom-address' }));
    expect(signTransaction).toHaveBeenCalledOnce();
    expect(mocks.address).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});
