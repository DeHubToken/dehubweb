import { describe, expect, it } from 'vitest';

import { connectorMatchesWallet } from '../wallet-connectors';

const connector = (id: string, name: string) => ({ id, name });

describe('connectorMatchesWallet', () => {
  it('matches MetaMask through every id it can arrive with', () => {
    expect(connectorMatchesWallet(connector('metaMaskSDK', 'MetaMask'), 'metamask')).toBe(true);
    expect(connectorMatchesWallet(connector('io.metamask', 'MetaMask'), 'metamask')).toBe(true);
  });

  it('matches Phantom through both the curated connector and its announcement', () => {
    expect(connectorMatchesWallet(connector('phantom', 'Phantom'), 'phantom')).toBe(true);
    expect(connectorMatchesWallet(connector('app.phantom', 'Phantom'), 'phantom')).toBe(true);
  });

  /*
    The case this whole mapping exists for. A second extension that has the
    site trusted gets reattached by wagmi with no prompt, so a tap on MetaMask
    can find Phantom sitting there as the live connection — and answering "yes,
    close enough" is how the MetaMask button produced a Phantom signature.
  */
  it('does not let one wallet stand in for another', () => {
    expect(connectorMatchesWallet(connector('app.phantom', 'Phantom'), 'metamask')).toBe(false);
    expect(connectorMatchesWallet(connector('org.tronlink.www', 'TronLink'), 'metamask')).toBe(false);
    expect(connectorMatchesWallet(connector('metaMaskSDK', 'MetaMask'), 'phantom')).toBe(false);
    expect(connectorMatchesWallet(null, 'metamask')).toBe(false);
  });

  it("matches WalletConnect, whose connector id is not the sheet's row id", () => {
    expect(connectorMatchesWallet(connector('walletConnect', 'WalletConnect'), 'walletconnect')).toBe(true);
  });

  it('falls back to an exact id match for a wallet discovered over EIP-6963', () => {
    expect(connectorMatchesWallet(connector('io.rabby', 'Rabby Wallet'), 'io.rabby')).toBe(true);
    expect(connectorMatchesWallet(connector('io.rabby', 'Rabby Wallet'), 'com.okex.wallet')).toBe(false);
  });
});
