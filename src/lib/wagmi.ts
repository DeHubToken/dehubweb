import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { base } from '@reown/appkit/networks'
import { http } from 'viem'

// Reuse same WalletConnect project ID
const projectId = '0751965bb69056635999763785664539'

const metadata = {
  name: 'DeHub',
  description: 'DeHub Social App',
  url: 'https://dehub.io',
  icons: ['https://dehub.io/favicon.ico']
}

const networks = [base] as [typeof base]

// Create Wagmi Adapter with custom RPC (mainnet.base.org returns 403)
export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  transports: {
    [base.id]: http('https://base-rpc.publicnode.com'),
  },
})

// Create AppKit modal
export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata,
  features: {
    analytics: false,
    email: false,     // Web3Auth handles email login
    socials: [],      // Web3Auth handles social login
    swaps: false,
    onramp: false,
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#6d28d9',
    '--w3m-border-radius-master': '1px',
    '--w3m-font-family': 'Inter, sans-serif',
  }
})

// Export config for WagmiProvider
export const wagmiConfig = wagmiAdapter.wagmiConfig
