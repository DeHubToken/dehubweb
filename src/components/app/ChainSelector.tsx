import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';

export type ChainId = 8453 | 56;

export interface Chain {
  id: ChainId;
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
    icon: '🔵',
    explorerUrl: 'https://basescan.org',
  },
  {
    id: 56,
    name: 'BNB Chain',
    symbol: 'BNB',
    icon: '🟡',
    explorerUrl: 'https://bscscan.com',
  },
];

export function getChainById(chainId: ChainId): Chain | undefined {
  return SUPPORTED_CHAINS.find(c => c.id === chainId);
}

interface ChainSelectorProps {
  selectedChainId: ChainId;
  onChainChange: (chainId: ChainId) => void;
  variant?: 'compact' | 'full';
  className?: string;
}

export function ChainSelector({ 
  selectedChainId, 
  onChainChange, 
  variant = 'compact',
  className = '' 
}: ChainSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedChain = getChainById(selectedChainId) || SUPPORTED_CHAINS[0];

  const handleSelect = (chainId: ChainId) => {
    onChainChange(chainId);
    setIsOpen(false);
  };

  return (
    <Drawer open={isOpen} onOpenChange={setIsOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors ${className}`}
        >
          <span className="text-base">{selectedChain.icon}</span>
          {variant === 'full' && (
            <span className="text-white text-sm font-medium">{selectedChain.name}</span>
          )}
          <ChevronDown className="w-4 h-4 text-zinc-400" />
        </button>
      </DrawerTrigger>
      <DrawerContent glass className="border-t border-white/10">
        <DrawerHeader className="border-b border-white/10">
          <DrawerTitle className="text-white">Select Network</DrawerTitle>
        </DrawerHeader>
        <div className="p-4 space-y-2">
          {SUPPORTED_CHAINS.map((chain) => (
            <button
              key={chain.id}
              onClick={() => handleSelect(chain.id)}
              className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-colors ${
                chain.id === selectedChainId 
                  ? 'bg-white/10 border border-white/20' 
                  : 'bg-white/5 border border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{chain.icon}</span>
                <div className="text-left">
                  <p className="text-white font-medium">{chain.name}</p>
                  <p className="text-xs text-zinc-400">Chain ID: {chain.id}</p>
                </div>
              </div>
              {chain.id === selectedChainId && (
                <Check className="w-5 h-5 text-white" />
              )}
            </button>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
