/**
 * Web3Auth Configuration with Smart Accounts
 * ============================================
 * Simplified setup following the official MetaMask/Web3Auth documentation:
 * https://docs.metamask.io/tutorials/sending-gasless-transaction
 */

import { Web3Auth } from "@web3auth/modal";
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from "@web3auth/base";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
import {
  AccountAbstractionProvider,
  SafeSmartAccount,
} from "@web3auth/account-abstraction-provider";
import { supabase } from "@/integrations/supabase/client";

// Base Mainnet chain configuration
const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: "0x2105", // 8453 in hex
  rpcTarget: "https://mainnet.base.org",
  displayName: "Base Mainnet",
  blockExplorerUrl: "https://basescan.org",
  ticker: "ETH",
  tickerName: "Ethereum",
  logo: "https://basescan.org/assets/base/images/svg/logos/chain-light.svg",
};

let web3authInstance: Web3Auth | null = null;
let initPromise: Promise<Web3Auth> | null = null;

async function getWeb3AuthClientId(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("get-web3auth-config");
  if (error || !data?.clientId) {
    throw new Error("Web3Auth client ID not configured");
  }
  return data.clientId;
}

async function getPimlicoApiKey(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("get-pimlico-config");
  if (error || !data?.bundlerUrl) {
    throw new Error("Pimlico API key not configured");
  }
  const match = data.bundlerUrl.match(/apikey=([^&]+)/);
  if (!match) {
    throw new Error("Invalid Pimlico bundler URL");
  }
  return match[1];
}

export async function getWeb3Auth(): Promise<Web3Auth> {
  // Return existing instance if ready
  if (web3authInstance?.status === "connected" || web3authInstance?.status === "ready") {
    return web3authInstance;
  }

  // Return pending initialization
  if (initPromise) {
    return initPromise;
  }

  initPromise = initializeWeb3Auth();
  return initPromise;
}

async function initializeWeb3Auth(): Promise<Web3Auth> {
  try {
    const [clientId, pimlicoApiKey] = await Promise.all([
      getWeb3AuthClientId(),
      getPimlicoApiKey(),
    ]);

    const chainId = 8453; // Base Mainnet
    const pimlicoUrl = `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${pimlicoApiKey}`;

    // Step 1: Configure AccountAbstractionProvider (exactly as in docs)
    const accountAbstractionProvider = new AccountAbstractionProvider({
      config: {
        chainConfig,
        bundlerConfig: {
          url: pimlicoUrl,
        },
        smartAccountInit: new SafeSmartAccount(),
        paymasterConfig: {
          url: pimlicoUrl,
        },
      },
    });

    // Step 2: Configure EthereumPrivateKeyProvider
    const privateKeyProvider = new EthereumPrivateKeyProvider({
      config: { chainConfig },
    });

    // Step 3: Configure Web3Auth (exactly as in docs)
    // Using type assertion to handle minor SDK type mismatches
    // Use dashboard configuration for login methods and UI
    const web3AuthOptions = {
      clientId,
      web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
      privateKeyProvider,
      accountAbstractionProvider,
      // Use EOA for external wallets, Smart Account for embedded wallets
      useAAWithExternalWallet: false,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    web3authInstance = new Web3Auth(web3AuthOptions as any);

    // Step 4: Initialize - v9 uses init(), v10 uses initModal()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = web3authInstance as any;
    if (typeof instance.initModal === "function") {
      await instance.initModal();
    } else {
      await instance.init();
    }

    console.log("[Web3Auth] Initialized, status:", web3authInstance.status);

    if (web3authInstance.status !== "ready" && web3authInstance.status !== "connected") {
      throw new Error(
        `Web3Auth initialization failed (status: ${web3authInstance.status}). ` +
        `Check that your origin is allowed in the Web3Auth dashboard.`
      );
    }

    return web3authInstance;
  } catch (error) {
    // Reset so next call can retry
    initPromise = null;
    web3authInstance = null;
    throw error;
  }
}

export function getWeb3AuthInstance(): Web3Auth | null {
  return web3authInstance;
}

export function getWeb3AuthProvider() {
  return web3authInstance?.provider || null;
}

export async function disconnectWeb3Auth(): Promise<void> {
  if (web3authInstance?.connected) {
    await web3authInstance.logout();
  }
}

export function isWeb3AuthConnected(): boolean {
  return web3authInstance?.connected ?? false;
}
