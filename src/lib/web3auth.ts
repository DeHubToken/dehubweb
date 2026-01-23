/**
 * Web3Auth Configuration with Smart Accounts
 * ============================================
 * Initializes Web3Auth with Pimlico-powered smart accounts for gasless transactions.
 */

import { Web3Auth } from "@web3auth/modal";
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK, type IProvider } from "@web3auth/base";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
import { supabase } from "@/integrations/supabase/client";
import { createPublicClient, http, createWalletClient, custom, type LocalAccount } from "viem";
import { base } from "viem/chains";
import { createSmartAccountClient } from "permissionless";
import { toSafeSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { entryPoint07Address } from "viem/account-abstraction";

const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: "0x2105",
  rpcTarget: "https://mainnet.base.org",
  displayName: "Base Mainnet",
  blockExplorerUrl: "https://basescan.org",
  ticker: "ETH",
  tickerName: "Ethereum",
  logo: "https://basescan.org/assets/base/images/svg/logos/chain-light.svg?v=25.1.2.0",
};

let web3authInstance: Web3Auth | null = null;
let isInitializing = false;
let initPromise: Promise<Web3Auth> | null = null;
let cachedClientId: string | null = null;
let cachedPimlicoConfig: { bundlerUrl: string; paymasterUrl: string } | null = null;
let smartAccountClientInstance: unknown = null;

async function getWeb3AuthClientId(): Promise<string> {
  if (cachedClientId) return cachedClientId;
  const { data, error } = await supabase.functions.invoke("get-web3auth-config");
  if (!error && data?.clientId) {
    cachedClientId = data.clientId;
    return cachedClientId;
  }
  throw new Error("Web3Auth client ID not configured");
}

async function getPimlicoConfig(): Promise<{ bundlerUrl: string; paymasterUrl: string }> {
  if (cachedPimlicoConfig) return cachedPimlicoConfig;
  const { data, error } = await supabase.functions.invoke("get-pimlico-config");
  if (!error && data?.bundlerUrl && data?.paymasterUrl) {
    cachedPimlicoConfig = data;
    return cachedPimlicoConfig;
  }
  throw new Error("Pimlico API key not configured");
}

export async function getWeb3Auth(): Promise<Web3Auth> {
  if (web3authInstance?.status === "connected" || web3authInstance?.status === "ready") {
    return web3authInstance;
  }
  if (isInitializing && initPromise) return initPromise;

  isInitializing = true;
  initPromise = (async () => {
    const clientId = await getWeb3AuthClientId();
    const privateKeyProvider = new EthereumPrivateKeyProvider({ config: { chainConfig } });

    web3authInstance = new Web3Auth({
      clientId,
      web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
      privateKeyProvider: privateKeyProvider as never,
      uiConfig: {
        appName: "DeHub",
        mode: "dark",
        loginMethodsOrder: ["email_passwordless", "google", "twitter", "discord", "apple"],
        logoLight: "https://dehub.io/default-icon.png",
        logoDark: "https://dehub.io/default-icon-dark.png",
        defaultLanguage: "en",
        primaryButton: "socialLogin",
      },
    });

    await web3authInstance.init();
    isInitializing = false;
    return web3authInstance;
  })();

  return initPromise;
}

export interface SmartAccountResult {
  smartAccountClient: unknown;
  smartAccountAddress: string;
  eoaAddress: string;
}

async function createOwnerFromProvider(provider: IProvider): Promise<LocalAccount> {
  const walletClient = createWalletClient({ chain: base, transport: custom(provider) });
  const [address] = await walletClient.getAddresses();

  return {
    address,
    type: "local",
    publicKey: "0x" as `0x${string}`,
    source: "custom",
    signMessage: async ({ message }) => walletClient.signMessage({ account: address, message }),
    signTransaction: async (tx) => walletClient.signTransaction({ account: address, ...tx } as never),
    signTypedData: async (data) => walletClient.signTypedData({ account: address, ...data } as never),
  } as LocalAccount;
}

export async function createSmartAccount(web3authProvider: IProvider): Promise<SmartAccountResult> {
  console.log("[Smart Account] Creating smart account with Pimlico paymaster...");
  
  const pimlicoConfig = await getPimlicoConfig();
  const publicClient = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
  const walletClient = createWalletClient({ chain: base, transport: custom(web3authProvider) });
  const [eoaAddress] = await walletClient.getAddresses();
  console.log("[Smart Account] EOA Address:", eoaAddress);

  const owner = await createOwnerFromProvider(web3authProvider);
  const pimlicoClient = createPimlicoClient({
    transport: http(pimlicoConfig.bundlerUrl),
    entryPoint: { address: entryPoint07Address, version: "0.7" },
  });

  const safeAccount = await toSafeSmartAccount({
    client: publicClient as never,
    owners: [owner],
    version: "1.4.1",
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    safe4337ModuleAddress: "0x3Fdb5BC686e861480ef99A6E3FaAe03c0b9F32e2",
    erc7579LaunchpadAddress: "0xEBe001b3D534B9B6E2500FB78E67a1A137f561CE",
  });

  console.log("[Smart Account] Safe Account Address:", safeAccount.address);

  smartAccountClientInstance = createSmartAccountClient({
    account: safeAccount,
    chain: base,
    bundlerTransport: http(pimlicoConfig.bundlerUrl),
    paymaster: pimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
    },
  });

  console.log("[Smart Account] Smart account client created successfully");

  return {
    smartAccountClient: smartAccountClientInstance,
    smartAccountAddress: safeAccount.address,
    eoaAddress: eoaAddress.toLowerCase(),
  };
}

export function getSmartAccountClient(): unknown { return smartAccountClientInstance; }
export function getWeb3AuthInstance(): Web3Auth | null { return web3authInstance; }
export function getWeb3AuthProvider(): IProvider | null { return web3authInstance?.provider || null; }
export async function disconnectWeb3Auth(): Promise<void> {
  if (web3authInstance?.connected) await web3authInstance.logout();
  smartAccountClientInstance = null;
}
export function isWeb3AuthConnected(): boolean { return web3authInstance?.connected ?? false; }
