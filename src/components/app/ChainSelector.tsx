import { useState } from 'react';
import { Check } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import baseLogo from '@/assets/icons/base-logo.png';
import bnbLogo from '@/assets/icons/bnb-logo.png';
import ethLogo from '@/assets/eth-logo.png';
import solLogo from '@/assets/icons/solana-logo.png';
import { SOLANA_MAINNET_CHAIN_ID } from '@/lib/chains/constants';

/** EVM chains used for tips, wallet, etc. */
export type ChainId = 8453 | 56 | 1;

/** Includes Solana for post minting */
export type PostChainId = ChainId | typeof SOLANA_MAINNET_CHAIN_ID;

export interface Chain {
  id: PostChainId;
  name: string;
  symbol: string;
  icon: string;
  explorerUrl: string;
}

export const SUPPORTED_CHAINS: Chain[] = [
  {
    id: 8453,
    name: 'Base',
    symbol: 'BASE',
    icon: baseLogo,
    explorerUrl: 'https://basescan.org',
  },
  {
    id: 56,
    name: 'BNB',
    symbol: 'BNB',
    icon: bnbLogo,
    explorerUrl: 'https://bscscan.com',
  },
  {
    id: 1,
    name: 'Ethereum',
    symbol: 'ETH',
    icon: ethLogo,
    explorerUrl: 'https://etherscan.io',
  },
  {
    id: SOLANA_MAINNET_CHAIN_ID,
    name: 'Solana',
    symbol: 'SOL',
    icon: solLogo,
    explorerUrl: 'https://solscan.io',
  },
];

export const TIP_CHAINS = SUPPORTED_CHAINS.filter((c) => c.id !== SOLANA_MAINNET_CHAIN_ID);

export function getChainById(chainId: PostChainId): Chain | undefined {
  return SUPPORTED_CHAINS.find((c) => c.id === chainId);
}

interface ChainSelectorProps {
  selectedChainId: PostChainId;
  onChainChange: (chainId: PostChainId) => void;
  variant?: 'icon' | 'compact' | 'full';
  className?: string;
  /** Hide Solana (e.g. tip modal) */
  evmOnly?: boolean;
}

export function ChainSelector({
  selectedChainId,
  onChainChange,
  variant = 'icon',
  className = '',
  evmOnly = false,
}: ChainSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const chains = evmOnly ? TIP_CHAINS : SUPPORTED_CHAINS;
  const selectedChain = getChainById(selectedChainId) || chains[0];

  const handleSelect = (chainId: PostChainId) => {
    onChainChange(chainId);
    setIsOpen(false);
  };

  const triggerButton = (
    <button
      type="button"
      className={cn(
        'flex items-center justify-center transition-all',
        variant === 'icon'
          ? 'w-7 h-7 hover:opacity-80'
          : 'gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10',
        className,
      )}
    >
      <img
        src={selectedChain.icon}
        alt={selectedChain.name}
        className="w-5 h-5 rounded-md object-cover"
      />
      {variant === 'full' && (
        <span className="text-white text-sm font-medium">{selectedChain.name}</span>
      )}
    </button>
  );

  return (
    <Drawer open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
        </TooltipTrigger>
        <TooltipContent>{selectedChain.name}</TooltipContent>
      </Tooltip>
      <DrawerContent glass className="border-t border-white/10" hideHandle>
        <DrawerHeader className="border-b border-white/10">
          <DrawerTitle className="text-white">Choose Decentralized Database</DrawerTitle>
        </DrawerHeader>
        <div className="p-4 space-y-2">
          {chains.map((chain) => (
            <button
              key={chain.id}
              type="button"
              onClick={() => handleSelect(chain.id)}
              className={cn(
                'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-colors',
                chain.id === selectedChainId
                  ? 'bg-white/10 border border-white/20'
                  : 'bg-white/5 border border-white/10 hover:bg-white/10',
              )}
            >
              <div className="flex items-center gap-3">
                <img
                  src={chain.icon}
                  alt={chain.name}
                  className="w-8 h-8 rounded-lg object-cover"
                />
                <p className="text-white font-medium">{chain.name}</p>
              </div>
              {chain.id === selectedChainId && <Check className="w-5 h-5 text-white" />}
            </button>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
