import { useState } from 'react';
import { Lock, CreditCard, Gift, Shield, Eye, MessageCircle, Check } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
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
  // Mobile drawer states
  const [ppvDrawerOpen, setPpvDrawerOpen] = useState(false);
  const [bountyDrawerOpen, setBountyDrawerOpen] = useState(false);
  const [tokenDrawerOpen, setTokenDrawerOpen] = useState(false);

  // Temp states for drawer inputs
  const [tempPpvAmount, setTempPpvAmount] = useState(ppvAmount);
  const [tempPpvCurrency, setTempPpvCurrency] = useState<Currency>(ppvCurrency);
  const [tempW2eViews, setTempW2eViews] = useState(w2eViews);
  const [tempW2eComments, setTempW2eComments] = useState(w2eComments);
  const [tempW2eTotal, setTempW2eTotal] = useState(w2eTotal);
  const [tempW2eCurrency, setTempW2eCurrency] = useState<Currency>(w2eCurrency);
  const [tempTokenContract, setTempTokenContract] = useState(tokenContract);
  const [tempTokenAmount, setTempTokenAmount] = useState(tokenAmount);

  const handlePpvToggle = (checked: boolean) => {
    if (checked && window.innerWidth < 640) {
      setTempPpvAmount(ppvAmount);
      setTempPpvCurrency(ppvCurrency);
      setPpvDrawerOpen(true);
    } else {
      setIsPPV(checked);
    }
  };

  const handleBountyToggle = (checked: boolean) => {
    if (checked && window.innerWidth < 640) {
      setTempW2eViews(w2eViews);
      setTempW2eComments(w2eComments);
      setTempW2eTotal(w2eTotal);
      setTempW2eCurrency(w2eCurrency);
      setBountyDrawerOpen(true);
    } else {
      setIsWatch2Earn(checked);
    }
  };

  const handleTokenToggle = (checked: boolean) => {
    if (checked && window.innerWidth < 640) {
      // Open drawer on mobile
      setTempTokenContract(tokenContract);
      setTempTokenAmount(tokenAmount);
      setTokenDrawerOpen(true);
    } else {
      setIsTokenGated(checked);
    }
  };

  const confirmPpv = () => {
    setPpvAmount(tempPpvAmount);
    setPpvCurrency(tempPpvCurrency);
    setIsPPV(true);
    setPpvDrawerOpen(false);
  };

  const cancelPpv = () => {
    setPpvDrawerOpen(false);
  };

  const confirmBounty = () => {
    setW2eViews(tempW2eViews);
    setW2eComments(tempW2eComments);
    setW2eTotal(tempW2eTotal);
    setW2eCurrency(tempW2eCurrency);
    setIsWatch2Earn(true);
    setBountyDrawerOpen(false);
  };

  const cancelBounty = () => {
    setBountyDrawerOpen(false);
  };

  const confirmToken = () => {
    setTokenContract(tempTokenContract);
    setTokenAmount(tempTokenAmount);
    setIsTokenGated(true);
    setTokenDrawerOpen(false);
  };

  const cancelToken = () => {
    setTokenDrawerOpen(false);
  };

  const inputClass = "w-full h-12 px-4 text-base bg-zinc-800/50 border border-white/20 rounded-xl text-white placeholder:text-zinc-500 outline-none focus:border-white/50";

  return (
    <>
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
        <div className="space-y-1 sm:space-y-0">
          <div className="flex items-center justify-between py-0.5">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-white" />
              <span className="text-sm text-white">PPV</span>
            </div>
            <div className="flex items-center gap-2">
              {/* Desktop/Tablet: inline options */}
              <AnimatePresence>
                {isPPV && (
                  <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} className="hidden sm:flex items-center gap-1 overflow-hidden">
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
              <Switch checked={isPPV} onCheckedChange={handlePpvToggle} className="data-[state=checked]:bg-white scale-75" />
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
              <Switch checked={isWatch2Earn} onCheckedChange={handleBountyToggle} className="data-[state=checked]:bg-white scale-75" />
            </div>
          </div>
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
                      className="w-32 h-6 px-2 text-xs bg-zinc-800/50 border border-white/20 rounded text-white placeholder:text-zinc-500 outline-none focus:border-white/50 font-mono"
                    />
                    <input
                      type="number"
                      value={tokenAmount}
                      onChange={(e) => setTokenAmount(e.target.value)}
                      placeholder="Min"
                      className="w-14 h-6 px-2 text-xs bg-zinc-800/50 border border-white/20 rounded text-white placeholder:text-zinc-500 outline-none focus:border-white/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
              <Switch checked={isTokenGated} onCheckedChange={handleTokenToggle} className="data-[state=checked]:bg-white scale-75" />
            </div>
          </div>
        </div>
      </div>

      {/* PPV Drawer for Mobile */}
      <Drawer open={ppvDrawerOpen} onOpenChange={setPpvDrawerOpen}>
        <DrawerContent glass>
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2 text-white">
              <CreditCard className="w-5 h-5" />
              Set PPV Price
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-white/70">Price</label>
              <input
                type="number"
                value={tempPpvAmount}
                onChange={(e) => setTempPpvAmount(e.target.value)}
                placeholder="0.00"
                className={cn(inputClass, "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none")}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/70">Currency</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTempPpvCurrency('USD')}
                  className={cn(
                    "flex-1 h-12 rounded-xl text-base font-medium transition-colors",
                    tempPpvCurrency === 'USD' 
                      ? "bg-white text-black" 
                      : "bg-zinc-800/50 text-white border border-white/20"
                  )}
                >
                  USD
                </button>
                <button
                  type="button"
                  onClick={() => setTempPpvCurrency('DHB')}
                  className={cn(
                    "flex-1 h-12 rounded-xl text-base font-medium transition-colors",
                    tempPpvCurrency === 'DHB' 
                      ? "bg-white text-black" 
                      : "bg-zinc-800/50 text-white border border-white/20"
                  )}
                >
                  DHB
                </button>
              </div>
            </div>
          </div>
          <DrawerFooter className="flex-row gap-2">
            <Button variant="outline" onClick={cancelPpv} className="flex-1 rounded-xl border-white/20 bg-white text-black hover:bg-white/90">
              Cancel
            </Button>
            <Button onClick={confirmPpv} className="flex-1 rounded-xl bg-white text-black hover:bg-white/90">
              <Check className="w-4 h-4 mr-2" />
              Confirm
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Bounty Drawer for Mobile */}
      <Drawer open={bountyDrawerOpen} onOpenChange={setBountyDrawerOpen}>
        <DrawerContent glass>
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2 text-white">
              <Gift className="w-5 h-5" />
              Set Up Bounty
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4 space-y-4">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-white/70">
                <Eye className="w-4 h-4" />
                Viewers to reward
              </label>
              <input
                type="number"
                value={tempW2eViews}
                onChange={(e) => setTempW2eViews(e.target.value)}
                placeholder="Number of viewers"
                className={cn(inputClass, "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none")}
              />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-white/70">
                <MessageCircle className="w-4 h-4" />
                Commenters to reward
              </label>
              <input
                type="number"
                value={tempW2eComments}
                onChange={(e) => setTempW2eComments(e.target.value)}
                placeholder="Number of commenters"
                className={cn(inputClass, "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none")}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/70">Total reward amount</label>
              <input
                type="number"
                value={tempW2eTotal}
                onChange={(e) => setTempW2eTotal(e.target.value)}
                placeholder="Total amount"
                className={cn(inputClass, "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none")}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/70">Currency</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTempW2eCurrency('USD')}
                  className={cn(
                    "flex-1 h-12 rounded-xl text-base font-medium transition-colors",
                    tempW2eCurrency === 'USD' 
                      ? "bg-white text-black" 
                      : "bg-zinc-800/50 text-white border border-white/20"
                  )}
                >
                  USD
                </button>
                <button
                  type="button"
                  onClick={() => setTempW2eCurrency('DHB')}
                  className={cn(
                    "flex-1 h-12 rounded-xl text-base font-medium transition-colors",
                    tempW2eCurrency === 'DHB' 
                      ? "bg-white text-black" 
                      : "bg-zinc-800/50 text-white border border-white/20"
                  )}
                >
                  DHB
                </button>
              </div>
            </div>
          </div>
          <DrawerFooter className="flex-row gap-2">
            <Button variant="outline" onClick={cancelBounty} className="flex-1 rounded-xl border-white/20 bg-white text-black hover:bg-white/90">
              Cancel
            </Button>
            <Button onClick={confirmBounty} className="flex-1 rounded-xl bg-white text-black hover:bg-white/90">
              <Check className="w-4 h-4 mr-2" />
              Confirm
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Token Gated Drawer for Mobile */}
      <Drawer open={tokenDrawerOpen} onOpenChange={setTokenDrawerOpen}>
        <DrawerContent glass>
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2 text-white">
              <Shield className="w-5 h-5" />
              Token Gate Settings
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-white/70">Contract Address</label>
              <input
                type="text"
                value={tempTokenContract}
                onChange={(e) => setTempTokenContract(e.target.value)}
                placeholder="0x..."
                className={cn(inputClass, "font-mono")}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/70">Minimum Token Amount</label>
              <input
                type="number"
                value={tempTokenAmount}
                onChange={(e) => setTempTokenAmount(e.target.value)}
                placeholder="Minimum required"
                className={cn(inputClass, "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none")}
              />
            </div>
          </div>
          <DrawerFooter className="flex-row gap-2">
            <Button variant="outline" onClick={cancelToken} className="flex-1 rounded-xl border-white/20 bg-white text-black hover:bg-white/90">
              Cancel
            </Button>
            <Button onClick={confirmToken} className="flex-1 rounded-xl bg-white text-black hover:bg-white/90">
              <Check className="w-4 h-4 mr-2" />
              Confirm
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
