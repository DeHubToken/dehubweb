import { Lock, CreditCard, Gift, Shield, Eye, MessageCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import type { Currency } from '../types';

interface PostAccessTogglesProps {
  isSubscribersOnly: boolean;
  setIsSubscribersOnly: (value: boolean) => void;
  isPPV: boolean;
  setIsPPV: (value: boolean) => void;
  ppvAmount: string;
  setPpvAmount: (value: string) => void;
  ppvCurrency: Currency;
  setPpvCurrency: (value: Currency) => void;
  isWatch2Earn: boolean;
  setIsWatch2Earn: (value: boolean) => void;
  w2eViews: string;
  setW2eViews: (value: string) => void;
  w2eComments: string;
  setW2eComments: (value: string) => void;
  w2eTotal: string;
  setW2eTotal: (value: string) => void;
  w2eCurrency: Currency;
  setW2eCurrency: (value: Currency) => void;
  isTokenGated: boolean;
  setIsTokenGated: (value: boolean) => void;
  tokenContract: string;
  setTokenContract: (value: string) => void;
  tokenAmount: string;
  setTokenAmount: (value: string) => void;
}

export function PostAccessToggles({
  isSubscribersOnly,
  setIsSubscribersOnly,
  isPPV,
  setIsPPV,
  ppvAmount,
  setPpvAmount,
  ppvCurrency,
  setPpvCurrency,
  isWatch2Earn,
  setIsWatch2Earn,
  w2eViews,
  setW2eViews,
  w2eComments,
  setW2eComments,
  w2eTotal,
  setW2eTotal,
  w2eCurrency,
  setW2eCurrency,
  isTokenGated,
  setIsTokenGated,
  tokenContract,
  setTokenContract,
  tokenAmount,
  setTokenAmount,
}: PostAccessTogglesProps) {
  return (
    <div className="px-4 py-2 border-t border-white/10 space-y-1">
      {/* Subscribers Only */}
      <div className="flex items-center justify-between py-0.5">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-white" />
          <span className="text-sm text-white">Subscribers only</span>
        </div>
        <Switch checked={isSubscribersOnly} onCheckedChange={setIsSubscribersOnly} className="data-[state=checked]:bg-white scale-75" />
      </div>

      {/* PPV */}
      <div className="space-y-1">
        <div className="flex items-center justify-between py-0.5">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-white" />
            <span className="text-sm text-white">PPV</span>
          </div>
          <div className="flex items-center gap-2">
            <AnimatePresence>
              {isPPV && (
                <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} className="flex items-center gap-1 overflow-hidden">
                  <input
                    type="number"
                    value={ppvAmount}
                    onChange={(e) => setPpvAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-16 h-6 px-2 text-xs bg-zinc-800/50 border border-white/20 rounded text-white placeholder:text-zinc-500 outline-none focus:border-white/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <div className="flex h-6 rounded overflow-hidden border border-white/20">
                    <button type="button" onClick={() => setPpvCurrency('USD')} className={cn("px-2 text-xs transition-colors", ppvCurrency === 'USD' ? "bg-white text-black" : "bg-zinc-800/50 text-zinc-400")}>USD</button>
                    <button type="button" onClick={() => setPpvCurrency('DHB')} className={cn("px-2 text-xs transition-colors", ppvCurrency === 'DHB' ? "bg-white text-black" : "bg-zinc-800/50 text-zinc-400")}>DHB</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <Switch checked={isPPV} onCheckedChange={setIsPPV} className="data-[state=checked]:bg-white scale-75" />
          </div>
        </div>
      </div>

      {/* Bounty */}
      <div className="space-y-1 sm:space-y-0">
        <div className="flex items-center justify-between py-0.5">
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-white" />
            <span className="text-sm text-white">Bounty</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Desktop/Tablet: inline options */}
            <AnimatePresence>
              {isWatch2Earn && (
                <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} className="hidden sm:flex items-center gap-1 overflow-hidden">
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center h-6 bg-zinc-800/50 border border-white/20 rounded overflow-hidden cursor-help">
                          <div className="flex items-center justify-center w-6 h-full bg-white/10 border-r border-white/20">
                            <Eye className="w-3 h-3 text-white/70" />
                          </div>
                          <input type="number" value={w2eViews} onChange={(e) => setW2eViews(e.target.value)} placeholder="0" className="w-10 h-full px-1.5 text-xs bg-transparent text-white placeholder:text-zinc-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top">Total number of viewers to reward</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center h-6 bg-zinc-800/50 border border-white/20 rounded overflow-hidden cursor-help">
                          <div className="flex items-center justify-center w-6 h-full bg-white/10 border-r border-white/20">
                            <MessageCircle className="w-3 h-3 text-white/70" />
                          </div>
                          <input type="number" value={w2eComments} onChange={(e) => setW2eComments(e.target.value)} placeholder="0" className="w-10 h-full px-1.5 text-xs bg-transparent text-white placeholder:text-zinc-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top">Total number of commenters to reward</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <input type="number" value={w2eTotal} onChange={(e) => setW2eTotal(e.target.value)} placeholder="Total" className="w-14 h-6 px-2 text-xs bg-zinc-800/50 border border-white/20 rounded text-white placeholder:text-zinc-500 outline-none focus:border-white/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex h-6 rounded overflow-hidden border border-white/20 cursor-help">
                          <button type="button" onClick={() => setW2eCurrency('USD')} className={cn("px-1.5 text-xs transition-colors", w2eCurrency === 'USD' ? "bg-white text-black" : "bg-zinc-800/50 text-zinc-400")}>USD</button>
                          <button type="button" onClick={() => setW2eCurrency('DHB')} className={cn("px-1.5 text-xs transition-colors", w2eCurrency === 'DHB' ? "bg-white text-black" : "bg-zinc-800/50 text-zinc-400")}>DHB</button>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top">Currency for reward</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </motion.div>
              )}
            </AnimatePresence>
            <Switch checked={isWatch2Earn} onCheckedChange={setIsWatch2Earn} className="data-[state=checked]:bg-white scale-75" />
          </div>
        </div>
        {/* Mobile: options on new line */}
        <AnimatePresence>
          {isWatch2Earn && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="sm:hidden overflow-hidden">
              <div className="flex items-center gap-1.5 pl-6 pb-1">
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center h-6 bg-zinc-800/50 border border-white/20 rounded overflow-hidden cursor-help">
                        <div className="flex items-center justify-center w-6 h-full bg-white/10 border-r border-white/20">
                          <Eye className="w-3 h-3 text-white/70" />
                        </div>
                        <input type="number" value={w2eViews} onChange={(e) => setW2eViews(e.target.value)} placeholder="0" className="w-10 h-full px-1.5 text-xs bg-transparent text-white placeholder:text-zinc-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top">Total number of viewers to reward</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center h-6 bg-zinc-800/50 border border-white/20 rounded overflow-hidden cursor-help">
                        <div className="flex items-center justify-center w-6 h-full bg-white/10 border-r border-white/20">
                          <MessageCircle className="w-3 h-3 text-white/70" />
                        </div>
                        <input type="number" value={w2eComments} onChange={(e) => setW2eComments(e.target.value)} placeholder="0" className="w-10 h-full px-1.5 text-xs bg-transparent text-white placeholder:text-zinc-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top">Total number of commenters to reward</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <input type="number" value={w2eTotal} onChange={(e) => setW2eTotal(e.target.value)} placeholder="Total" className="w-14 h-6 px-2 text-xs bg-zinc-800/50 border border-white/20 rounded text-white placeholder:text-zinc-500 outline-none focus:border-white/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex h-6 rounded overflow-hidden border border-white/20 cursor-help">
                        <button type="button" onClick={() => setW2eCurrency('USD')} className={cn("px-1.5 text-xs transition-colors", w2eCurrency === 'USD' ? "bg-white text-black" : "bg-zinc-800/50 text-zinc-400")}>USD</button>
                        <button type="button" onClick={() => setW2eCurrency('DHB')} className={cn("px-1.5 text-xs transition-colors", w2eCurrency === 'DHB' ? "bg-white text-black" : "bg-zinc-800/50 text-zinc-400")}>DHB</button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top">Currency for reward</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Token Gated */}
      <div className="space-y-1 sm:space-y-0">
        <div className="flex items-center justify-between py-0.5">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-white" />
            <span className="text-sm text-white">Token Gated</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Desktop/Tablet: inline options */}
            <AnimatePresence>
              {isTokenGated && (
                <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} className="hidden sm:flex items-center gap-1 overflow-hidden">
                  <input
                    type="text"
                    value={tokenContract}
                    onChange={(e) => setTokenContract(e.target.value)}
                    placeholder="Contract address"
                    className="w-64 lg:w-96 h-6 px-2 text-xs bg-zinc-800/50 border border-white/20 rounded text-white placeholder:text-zinc-500 outline-none focus:border-white/50 font-mono"
                  />
                  <input
                    type="number"
                    value={tokenAmount}
                    onChange={(e) => setTokenAmount(e.target.value)}
                    placeholder="Min"
                    className="w-[19px] lg:w-[21px] h-6 px-2 text-xs bg-zinc-800/50 border border-white/20 rounded text-white placeholder:text-zinc-500 outline-none focus:border-white/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <Switch checked={isTokenGated} onCheckedChange={setIsTokenGated} className="data-[state=checked]:bg-white scale-75" />
          </div>
        </div>
        {/* Mobile: options on new line */}
        <AnimatePresence>
          {isTokenGated && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="sm:hidden overflow-hidden">
              <div className="flex items-center gap-1.5 pl-6 pb-1">
                <input
                  type="text"
                  value={tokenContract}
                  onChange={(e) => setTokenContract(e.target.value)}
                  placeholder="Contract address"
                  className="flex-[0.85] h-6 px-2 text-xs bg-zinc-800/50 border border-white/20 rounded text-white placeholder:text-zinc-500 outline-none focus:border-white/50 font-mono"
                />
                <input
                  type="number"
                  value={tokenAmount}
                  onChange={(e) => setTokenAmount(e.target.value)}
                  placeholder="Min"
                  className="flex-[0.15] min-w-[60px] h-6 px-2 text-xs bg-zinc-800/50 border border-white/20 rounded text-white placeholder:text-zinc-500 outline-none focus:border-white/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
