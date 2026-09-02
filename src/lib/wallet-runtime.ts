/**
 * The wagmi runtime, seen from code that must not load wagmi.
 *
 * Why this exists: AuthProvider wraps the whole app and used to call wagmi's
 * hooks directly, which put wagmi + viem (and their WagmiProvider host) on the
 * boot path of every visitor, signed out or not. Now WagmiProvider and the
 * hooks live in a lazily loaded runtime (components/app/WagmiRuntime.tsx) that
 * publishes into this store, and AuthProvider reads the store. The runtime is
 * mounted only when it can matter: a returning wagmi session at boot, or the
 * first wallet surface that asks for it (WagmiScope).
 *
 * Contract for consumers:
 * - `address` / `isConnected` / `connector` / `connectors` are wagmi's own
 *   values, or their signed-out defaults until the runtime is up. That is
 *   exactly what wagmi itself reports before its reconnect settles, so nothing
 *   downstream has to learn a new state.
 * - `connectAsync` and `signMessageAsync` load the runtime first: they are the
 *   two calls that only make sense with a wallet, and they are always awaited.
 * - `disconnect` / `disconnectAsync` never load it: with no runtime there is
 *   nothing to disconnect, and pulling wagmi in to do nothing would defeat the
 *   point on every sign-out.
 *
 * Nothing in this file may import wagmi at runtime — types only.
 */
import { useSyncExternalStore } from 'react';
import type {
  Connector,
  UseConnectReturnType,
  UseDisconnectReturnType,
  UseSignMessageReturnType,
} from 'wagmi';

export interface WalletRuntimeState {
  address: `0x${string}` | undefined;
  isConnected: boolean;
  connector: Connector | undefined;
  connectors: readonly Connector[];
  /** True once the runtime has mounted and published its first wagmi snapshot. */
  ready: boolean;
}

export interface WalletRuntimeActions {
  connectAsync: UseConnectReturnType['connectAsync'];
  disconnect: UseDisconnectReturnType['disconnect'];
  disconnectAsync: UseDisconnectReturnType['disconnectAsync'];
  signMessageAsync: UseSignMessageReturnType['signMessageAsync'];
}

const SIGNED_OUT: WalletRuntimeState = {
  address: undefined,
  isConnected: false,
  connector: undefined,
  connectors: [],
  ready: false,
};

let state: WalletRuntimeState = SIGNED_OUT;
let actions: WalletRuntimeActions | null = null;
let requested = false;
const listeners = new Set<() => void>();
const requestListeners = new Set<() => void>();
let readyResolvers: Array<() => void> = [];

function emit() {
  for (const l of listeners) l();
}

/** Called by the runtime bridge on every wagmi change. */
export function publishWalletRuntime(
  next: Omit<WalletRuntimeState, 'ready'>,
  nextActions: WalletRuntimeActions,
): void {
  actions = nextActions;
  state = { ...next, ready: true };
  emit();
  const resolvers = readyResolvers;
  readyResolvers = [];
  for (const r of resolvers) r();
}

/** Called if the runtime ever unmounts. */
export function retractWalletRuntime(): void {
  actions = null;
  state = SIGNED_OUT;
  emit();
}

/** Ask WalletProviders to mount the runtime. Idempotent. */
export function requestWalletRuntime(): void {
  if (requested) return;
  requested = true;
  for (const l of requestListeners) l();
}

/** Resolves once the runtime is mounted and has published; mounts it if needed. */
export function ensureWalletRuntime(): Promise<void> {
  if (state.ready && actions) return Promise.resolve();
  requestWalletRuntime();
  return new Promise<void>((resolve) => {
    readyResolvers.push(resolve);
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function subscribeRequested(l: () => void) {
  requestListeners.add(l);
  return () => {
    requestListeners.delete(l);
  };
}

const getState = () => state;
const getRequested = () => requested;

/** WalletProviders uses this to know when to render the runtime. */
export function useWalletRuntimeRequested(): boolean {
  return useSyncExternalStore(subscribeRequested, getRequested, getRequested);
}

type ConnectArgs = Parameters<WalletRuntimeActions['connectAsync']>;
type DisconnectArgs = Parameters<WalletRuntimeActions['disconnect']>;
type DisconnectAsyncArgs = Parameters<WalletRuntimeActions['disconnectAsync']>;
type SignArgs = Parameters<WalletRuntimeActions['signMessageAsync']>;

const wrappedActions: WalletRuntimeActions = {
  connectAsync: (async (...args: ConnectArgs) => {
    await ensureWalletRuntime();
    return actions!.connectAsync(...args);
  }) as WalletRuntimeActions['connectAsync'],
  disconnect: ((...args: DisconnectArgs) => {
    actions?.disconnect(...args);
  }) as WalletRuntimeActions['disconnect'],
  disconnectAsync: (async (...args: DisconnectAsyncArgs) => {
    if (!actions) return;
    return actions.disconnectAsync(...args);
  }) as WalletRuntimeActions['disconnectAsync'],
  signMessageAsync: (async (...args: SignArgs) => {
    await ensureWalletRuntime();
    return actions!.signMessageAsync(...args);
  }) as WalletRuntimeActions['signMessageAsync'],
};

/** Drop-in for the useAccount / useConnect / useDisconnect / useSignMessage quartet. */
export function useWalletRuntime(): WalletRuntimeState & WalletRuntimeActions {
  const snapshot = useSyncExternalStore(subscribe, getState, getState);
  return { ...snapshot, ...wrappedActions };
}
