/**
 * Which wagmi connector belongs to which button in the login sheet.
 *
 * Each wallet gets several ids because it can reach us more than one way:
 * RainbowKit's own connector id, the EIP-6963 rdns the extension announces,
 * and MetaMask's SDK connector. A button matches on any of them.
 *
 * Shared because two callers have to agree on the answer. `connectWithWallet`
 * uses it to pick the connector to open; the sheet uses it to decide whether a
 * live connection already IS the wallet that was tapped. While only the first
 * one knew the mapping, a tap on a second wallet reused the first wallet's
 * connection and asked it to sign again — so the wallet the user was trying to
 * leave kept popping up and there was no way to switch.
 */
export type WalletConnectorKey = 'metamask' | 'phantom' | 'trust';

export const WALLET_CONNECTOR_IDS: Record<WalletConnectorKey, string[]> = {
  metamask: ['metaMaskSDK', 'io.metamask', 'metaMask'],
  phantom: ['app.phantom', 'phantom'],
  trust: ['trust', 'trustWallet'],
};

interface ConnectorLike {
  id: string;
  name: string;
}

export function connectorMatchesWallet(
  connector: ConnectorLike | null | undefined,
  wallet: string,
): boolean {
  const ids = WALLET_CONNECTOR_IDS[wallet as WalletConnectorKey];
  if (!connector || !ids) return false;
  const name = (connector.name || '').toLowerCase();
  return ids.some(id => connector.id === id || name.includes(id.toLowerCase()));
}
