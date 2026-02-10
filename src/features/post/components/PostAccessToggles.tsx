import { useState, useEffect, useMemo } from 'react';
import { Lock, CreditCard, Gift, Shield, Eye, MessageCircle, Check, Info, Tag, Search, X, Plus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getCategories, type DeHubCategory } from '@/lib/api/dehub';
import type { Currency } from '../types';

// DHB is the only supported token
const DHB_INFO = {
  symbol: 'DHB',
  chainId: 8453,
  address: '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c',
};

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
  selectedCategory: string;
  setSelectedCategory: (value: string) => void;
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
  setW2eCurrency,
  isTokenGated,
  setIsTokenGated,
  setTokenContract,
  tokenAmount,
  setTokenAmount,
  selectedCategory,
  setSelectedCategory,
}: PostAccessTogglesProps) {
  // Mobile drawer states
  const [ppvDrawerOpen, setPpvDrawerOpen] = useState(false);
  const [bountyDrawerOpen, setBountyDrawerOpen] = useState(false);
  const [tokenDrawerOpen, setTokenDrawerOpen] = useState(false);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);

  // Temp states for drawer inputs
  const [tempPpvAmount, setTempPpvAmount] = useState(ppvAmount);
  const [tempPpvCurrency, setTempPpvCurrency] = useState<Currency>(ppvCurrency);
  const [tempW2eViews, setTempW2eViews] = useState(w2eViews);
  const [tempW2eComments, setTempW2eComments] = useState(w2eComments);
  const [tempW2eTotal, setTempW2eTotal] = useState(w2eTotal);
  const [tempTokenAmount, setTempTokenAmount] = useState(tokenAmount);

  // Category state
  const [categories, setCategories] = useState<DeHubCategory[]>([]);
  const [categorySearch, setCategorySearch] = useState('');
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Fetch categories when drawer opens
  useEffect(() => {
    if (categoryDrawerOpen && categories.length === 0) {
      setLoadingCategories(true);
      getCategories()
        .then(setCategories)
        .catch(console.error)
        .finally(() => setLoadingCategories(false));
    }
  }, [categoryDrawerOpen, categories.length]);

  const selectedCategoriesArray = useMemo(() => 
    selectedCategory ? selectedCategory.split('|||').filter(Boolean) : [],
    [selectedCategory]
  );

  const MAX_CATEGORIES = 5;

  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    const q = categorySearch.toLowerCase();
    return categories.filter(c => c.name.toLowerCase().includes(q));
  }, [categories, categorySearch]);

  const handleCategoryToggle = (checked: boolean) => {
    if (checked) {
      setCategorySearch('');
      setCategoryDrawerOpen(true);
    } else {
      setSelectedCategory('');
    }
  };

  const toggleCategory = (name: string) => {
    const current = selectedCategoriesArray;
    if (current.includes(name)) {
      const next = current.filter(c => c !== name);
      setSelectedCategory(next.join('|||'));
    } else if (current.length < MAX_CATEGORIES) {
      setSelectedCategory([...current, name].join('|||'));
    }
  };

  const removeCategory = (name: string) => {
    const next = selectedCategoriesArray.filter(c => c !== name);
    setSelectedCategory(next.join('|||'));
  };

  const handlePpvToggle = (checked: boolean) => {
    if (checked) {
      setTempPpvAmount(ppvAmount);
      setTempPpvCurrency(ppvCurrency);
      setPpvDrawerOpen(true);
    } else {
      setIsPPV(false);
    }
  };

  const handleBountyToggle = (checked: boolean) => {
    if (checked) {
      setTempW2eViews(w2eViews);
      setTempW2eComments(w2eComments);
      setTempW2eTotal(w2eTotal);
      setBountyDrawerOpen(true);
    } else {
      setIsWatch2Earn(false);
    }
  };

  const handleTokenToggle = (checked: boolean) => {
    if (checked) {
      setTempTokenAmount(tokenAmount);
      setTokenDrawerOpen(true);
    } else {
      setIsTokenGated(false);
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
    setW2eCurrency('DHB'); // Always DHB
    setIsWatch2Earn(true);
    setBountyDrawerOpen(false);
  };

  const cancelBounty = () => {
    setBountyDrawerOpen(false);
  };

  const confirmToken = () => {
    setTokenContract(DHB_INFO.address); // Always DHB contract
    setTokenAmount(tempTokenAmount);
    setIsTokenGated(true);
    setTokenDrawerOpen(false);
  };

  const cancelToken = () => {
    setTokenDrawerOpen(false);
  };

  // Calculate total bounty for preview
  const totalBounty = tempW2eTotal && tempW2eViews 
    ? parseFloat(tempW2eTotal) * (parseInt(tempW2eViews) + parseInt(tempW2eComments || '0'))
    : 0;

  const inputClass = "w-full h-12 px-4 text-base bg-zinc-800/50 border border-white/20 rounded-xl text-white placeholder:text-zinc-500 outline-none focus:border-white/50";

  return (
    <>
      <div className="px-4 py-2 border-t border-white/10 space-y-1">
        {/* Category */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between py-0.5">
            <div className="flex items-center gap-2 shrink-0">
              <Tag className="w-4 h-4 text-white" />
              <span className="text-sm text-white">Category</span>
            </div>
            <div className="flex items-center gap-2">
              {selectedCategoriesArray.length < MAX_CATEGORIES && (
                <button type="button" onClick={() => { setCategorySearch(''); setCategoryDrawerOpen(true); }} className="text-xs text-white/50 hover:text-white">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
              <Switch checked={selectedCategoriesArray.length > 0} onCheckedChange={handleCategoryToggle} className="data-[state=checked]:bg-white scale-75" />
            </div>
          </div>
          {selectedCategoriesArray.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pl-6">
              {selectedCategoriesArray.map((cat) => (
                <span key={cat} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-white/10 text-white/80 border border-white/10">
                  {cat}
                  <button type="button" onClick={() => removeCategory(cat)} className="hover:text-red-400 transition-colors">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Subscribers */}
        <div className="flex items-center justify-between py-0.5">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-white" />
            <span className="text-sm text-white">Subscribers</span>
          </div>
          <Switch checked={isSubscribersOnly} onCheckedChange={setIsSubscribersOnly} className="data-[state=checked]:bg-white scale-75" />
        </div>

        {/* PPV */}
        <div className="flex items-center justify-between py-0.5">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-white" />
            <span className="text-sm text-white">PPV</span>
            {isPPV && ppvAmount && (
              <span className="text-xs text-white/50">({ppvAmount} {ppvCurrency})</span>
            )}
          </div>
          <Switch checked={isPPV} onCheckedChange={handlePpvToggle} className="data-[state=checked]:bg-white scale-75" />
        </div>

        {/* Bounty */}
        <div className="flex items-center justify-between py-0.5">
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-white" />
            <span className="text-sm text-white">Bounty</span>
            {isWatch2Earn && w2eTotal && (
              <span className="text-xs text-white/50">({w2eTotal} DHB)</span>
            )}
          </div>
          <Switch checked={isWatch2Earn} onCheckedChange={handleBountyToggle} className="data-[state=checked]:bg-white scale-75" />
        </div>

        {/* Token Gated */}
        <div className="flex items-center justify-between py-0.5">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-white" />
            <span className="text-sm text-white">Token Gated</span>
            {isTokenGated && tokenAmount && (
              <span className="text-xs text-white/50">({tokenAmount} DHB)</span>
            )}
          </div>
          <Switch checked={isTokenGated} onCheckedChange={handleTokenToggle} className="data-[state=checked]:bg-white scale-75" />
        </div>
      </div>

      {/* Category Drawer */}
      <Drawer open={categoryDrawerOpen} onOpenChange={setCategoryDrawerOpen}>
        <DrawerContent glass>
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5" />
                Select Categories
              </div>
              <span className="text-xs font-normal text-zinc-400">{selectedCategoriesArray.length}/{MAX_CATEGORIES}</span>
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4 space-y-3">
            {/* Selected chips */}
            {selectedCategoriesArray.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedCategoriesArray.map((cat) => (
                  <span key={cat} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-white/15 text-white border border-white/20">
                    {cat}
                    <button type="button" onClick={() => removeCategory(cat)} className="hover:text-red-400 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder="Search categories..."
                className={cn(inputClass, "pl-10")}
                autoFocus
              />
              {categorySearch && (
                <button
                  type="button"
                  onClick={() => setCategorySearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Category list */}
            <div className="max-h-[40vh] overflow-y-auto space-y-1 scrollbar-hide">
              {loadingCategories ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
              ) : (
                <>
                {/* Custom category option when search doesn't exactly match */}
                {categorySearch.trim() && !categories.some(c => c.name.toLowerCase() === categorySearch.trim().toLowerCase()) && selectedCategoriesArray.length < MAX_CATEGORIES && (
                  <button
                    type="button"
                    onClick={() => { toggleCategory(categorySearch.trim()); setCategorySearch(''); }}
                    className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm transition-colors text-white bg-white/10 hover:bg-white/15 border border-dashed border-white/20 mb-1"
                  >
                    <Plus className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Create "<span className="font-medium">{categorySearch.trim()}</span>"</span>
                  </button>
                )}
                {filteredCategories.length === 0 && !categorySearch.trim() ? (
                  <p className="text-center text-sm text-zinc-500 py-8">No categories found</p>
                ) : (
                filteredCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleCategory(cat.name)}
                    disabled={!selectedCategoriesArray.includes(cat.name) && selectedCategoriesArray.length >= MAX_CATEGORIES}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-colors",
                      selectedCategoriesArray.includes(cat.name)
                        ? "bg-white/15 text-white border border-white/20"
                        : selectedCategoriesArray.length >= MAX_CATEGORIES
                          ? "text-zinc-600 border border-transparent cursor-not-allowed"
                          : "text-zinc-300 hover:bg-white/5 border border-transparent"
                    )}
                  >
                    <span>{cat.name}</span>
                    {selectedCategoriesArray.includes(cat.name) && (
                      <Check className="w-4 h-4 text-white" />
                    )}
                  </button>
                ))
                )}
                </>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* PPV Drawer */}
      <Drawer open={ppvDrawerOpen} onOpenChange={setPpvDrawerOpen}>
        <DrawerContent glass>
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2 text-white">
              <CreditCard className="w-5 h-5" />
              Set PPV Price
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4 space-y-4">
            {/* Currency selector */}
            <div className="space-y-2">
              <label className="text-sm text-white/70">Currency</label>
              <div className="flex gap-2">
                {(['USD', 'DHB'] as Currency[]).map((cur) => (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => setTempPpvCurrency(cur)}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors border",
                      tempPpvCurrency === cur
                        ? "bg-white/15 text-white border-white/20"
                        : "bg-transparent text-zinc-400 border-white/10 hover:bg-white/5"
                    )}
                  >
                    {cur}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/70">Price ({tempPpvCurrency})</label>
              <input
                type="number"
                value={tempPpvAmount}
                onChange={(e) => setTempPpvAmount(e.target.value)}
                placeholder="0.00"
                className={cn(inputClass, "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none")}
              />
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800/30 border border-white/10">
              <Info className="w-4 h-4 text-white/50 shrink-0" />
              <span className="text-xs text-white/50">
                {tempPpvCurrency === 'DHB' ? 'Payments are in DHB on Base chain' : 'Payments are in USD'}
              </span>
            </div>
          </div>
          <DrawerFooter className="flex-row gap-2">
            <Button variant="outline" onClick={cancelPpv} className="flex-1 rounded-xl border-white/20 bg-white text-black hover:bg-white/90">
              Cancel
            </Button>
            <Button 
              onClick={confirmPpv} 
              disabled={!tempPpvAmount.trim()}
              className="flex-1 rounded-xl bg-white text-black hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4 mr-2" />
              Confirm
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Bounty Drawer */}
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
              <label className="text-sm text-white/70">Reward per person (DHB)</label>
              <input
                type="number"
                value={tempW2eTotal}
                onChange={(e) => setTempW2eTotal(e.target.value)}
                placeholder="Amount per person"
                className={cn(inputClass, "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none")}
              />
            </div>
            {totalBounty > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800/30 border border-white/10">
                <Info className="w-4 h-4 text-white/50 shrink-0" />
                <span className="text-xs text-white/50">
                  Total: {totalBounty.toFixed(2)} DHB will be locked for rewards
                </span>
              </div>
            )}
          </div>
          <DrawerFooter className="flex-row gap-2">
            <Button variant="outline" onClick={cancelBounty} className="flex-1 rounded-xl border-white/20 bg-white text-black hover:bg-white/90">
              Cancel
            </Button>
            <Button 
              onClick={confirmBounty} 
              disabled={!tempW2eViews.trim() || !tempW2eTotal.trim()}
              className="flex-1 rounded-xl bg-white text-black hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4 mr-2" />
              Confirm
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Token Gated Drawer */}
      <Drawer open={tokenDrawerOpen} onOpenChange={setTokenDrawerOpen}>
        <DrawerContent glass>
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2 text-white">
              <Shield className="w-5 h-5" />
              Token Gate Settings
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4 space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800/30 border border-white/10">
              <Info className="w-4 h-4 text-white/50 shrink-0" />
              <span className="text-xs text-white/50">
                Requires DHB tokens on Base chain ({DHB_INFO.address.slice(0, 8)}...)
              </span>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-white/70">Minimum DHB Required</label>
              <input
                type="number"
                value={tempTokenAmount}
                onChange={(e) => setTempTokenAmount(e.target.value)}
                placeholder="Minimum amount"
                className={cn(inputClass, "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none")}
              />
            </div>
          </div>
          <DrawerFooter className="flex-row gap-2">
            <Button variant="outline" onClick={cancelToken} className="flex-1 rounded-xl border-white/20 bg-white text-black hover:bg-white/90">
              Cancel
            </Button>
            <Button 
              onClick={confirmToken} 
              disabled={!tempTokenAmount.trim()}
              className="flex-1 rounded-xl bg-white text-black hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4 mr-2" />
              Confirm
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
