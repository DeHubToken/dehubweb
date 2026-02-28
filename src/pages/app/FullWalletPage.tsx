import { useState, useMemo, useCallback } from 'react';
import { useSidebarCollapse } from '@/contexts/SidebarCollapseContext';
import { cn } from '@/lib/utils';
import { ArrowLeft, Copy, Check, Send, QrCode, Plus, ArrowDownToLine, Loader2, Search, ShoppingCart, User, Lock, Minus } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/app/AuthGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useAllChainsTokens } from '@/hooks/use-wallet-tokens';
import { useTokenPrices } from '@/hooks/use-token-prices';
import { sendNativeToken, sendERC20Token } from '@/lib/wallet/send';
import { createOnrampSession } from '@/lib/api/dpay';
import { showWeb3AuthCheckout, isWeb3AuthConnected } from '@/lib/web3auth';
import { getDexBuyLink } from '@/lib/wallet/buy-links';
import { getERC20Metadata, saveCustomToken, formatBalance, type WalletToken } from '@/lib/wallet/tokens';
import { BASE_CHAIN_ID, BNB_CHAIN_ID, ETH_CHAIN_ID, CHAIN_CONFIGS } from '@/lib/contracts/dhb-token';
import { switchChain } from '@/lib/contracts/aa-utils';
import type { ChainId } from '@/components/app/ChainSelector';
import { toast } from 'sonner';
import dehubCoin from '@/assets/dehub-coin.png';
import bnbLogo from '@/assets/bnb-logo.png';
import ethLogo from '@/assets/eth-logo.png';
import usdtLogo from '@/assets/usdt-logo.png';
import baseLogo from '@/assets/icons/base-logo.png';

const CHAIN_OPTIONS: { id: ChainId; name: string; icon: string }[] = [
  { id: BASE_CHAIN_ID, name: 'Base', icon: baseLogo },
  { id: BNB_CHAIN_ID, name: 'BNB Chain', icon: bnbLogo },
  { id: ETH_CHAIN_ID, name: 'Ethereum', icon: ethLogo },
];

const TOKEN_ICONS: Record<string, string> = {
  DHB: dehubCoin,
  ETH: ethLogo,
  BNB: bnbLogo,
  USDT: usdtLogo,
  WETH: ethLogo,
  WBNB: bnbLogo,
};

// Grouped token: combines balances across chains
interface GroupedToken {
  symbol: string;
  name: string;
  totalBalance: bigint;
  totalFormattedBalance: string;
  decimals: number;
  logo?: string;
  isCustom?: boolean;
  chains: WalletToken[]; // individual per-chain entries
}

export default function FullWalletPage() {
  const { isAuthenticated, walletAddress } = useAuth();
  const { isCollapsed } = useSidebarCollapse();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importChainId, setImportChainId] = useState<ChainId>(BASE_CHAIN_ID);
  const [selectedToken, setSelectedToken] = useState<WalletToken | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionGrouped, setActionGrouped] = useState<GroupedToken | null>(null);
  const [sendChainPickerGrouped, setSendChainPickerGrouped] = useState<GroupedToken | null>(null);

  const { allTokens, isLoading } = useAllChainsTokens();

  // Collect auto-detected tokens (not in TOKEN_ICONS) for dynamic price lookups
  const extraTokensForPricing = useMemo(() => {
    const known = new Set(Object.keys(TOKEN_ICONS));
    const seen = new Set<string>();
    const extras: { address: string; symbol: string }[] = [];
    for (const tk of allTokens) {
      if (!known.has(tk.symbol) && tk.address !== '0x0' && !seen.has(tk.address.toLowerCase())) {
        seen.add(tk.address.toLowerCase());
        extras.push({ address: tk.address, symbol: tk.symbol });
      }
    }
    return extras;
  }, [allTokens]);

  const { data: prices = {} } = useTokenPrices(extraTokensForPricing.length > 0 ? extraTokensForPricing : undefined);

  // Compute total USD across all chains
  const totalUsd = useMemo(() => {
    return allTokens.reduce((sum, token) => {
      const price = prices[token.symbol] ?? 0;
      const value = parseFloat(token.formattedBalance) * price;
      return sum + (isNaN(value) ? 0 : value);
    }, 0);
  }, [allTokens, prices]);

  // Group tokens by symbol across chains
  const groupedTokens = useMemo(() => {
    const map = new Map<string, GroupedToken>();
    for (const token of allTokens) {
      const existing = map.get(token.symbol);
      if (existing) {
        existing.totalBalance = existing.totalBalance + token.balance;
        existing.totalFormattedBalance = formatBalance(existing.totalBalance, existing.decimals, 8);
        existing.chains.push(token);
        if (token.isCustom) existing.isCustom = true;
      } else {
        map.set(token.symbol, {
          symbol: token.symbol,
          name: token.name,
          totalBalance: token.balance,
          totalFormattedBalance: token.formattedBalance,
          decimals: token.decimals,
          logo: token.logo,
          isCustom: token.isCustom,
          chains: [token],
        });
      }
    }
    const ORDER: Record<string, number> = { DHB: 0, ETH: 1, BNB: 2, USDT: 3 };
    return Array.from(map.values()).sort((a, b) => (ORDER[a.symbol] ?? 99) - (ORDER[b.symbol] ?? 99));
  }, [allTokens]);

  const filteredGrouped = useMemo(() => {
    if (!searchQuery.trim()) return groupedTokens;
    const q = searchQuery.toLowerCase();
    return groupedTokens.filter(g => g.symbol.toLowerCase().includes(q) || g.name.toLowerCase().includes(q));
  }, [groupedTokens, searchQuery]);

  // Separate tokens with balance vs zero balance
  const { withBalance, zeroBalance } = useMemo(() => {
    const withBalance = filteredGrouped.filter(g => g.totalBalance > BigInt(0));
    const zeroBalance = filteredGrouped.filter(g => g.totalBalance === BigInt(0));
    return { withBalance, zeroBalance };
  }, [filteredGrouped]);

  const [copied, setCopied] = useState(false);

  // All tokens with balance across all chains (for send dialog)
  const allWithBalance = useMemo(() => allTokens.filter(tk => tk.balance > BigInt(0)), [allTokens]);

  if (!isAuthenticated) {
    return <AuthGate description={t('wallet.loginRequired')} />;
  }

  const handleCopy = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    toast.success(t('wallet.addressCopied'));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = (token: WalletToken) => {
    setSelectedToken(token);
    setSendDialogOpen(true);
  };

  // Always open action drawer directly
  const handleGroupedTokenClick = (grouped: GroupedToken) => {
    setActionGrouped(grouped);
  };

  // Smart send: if multiple chains have balance, show chain picker. Otherwise send directly.
  const handleSmartSend = (grouped: GroupedToken) => {
    const chainsWithBalance = grouped.chains.filter(tk => tk.balance > BigInt(0));
    if (chainsWithBalance.length === 0) return;
    if (chainsWithBalance.length === 1) {
      handleSend(chainsWithBalance[0]);
    } else {
      setSendChainPickerGrouped(grouped);
    }
  };

  return (
    <div className={cn("px-2 pt-1 pb-2 sm:px-3 sm:pt-1 sm:pb-3 lg:pt-2 min-h-screen", isCollapsed ? "" : "max-w-2xl mx-auto")}>
      {/* Header - only show back button and title when navigated from command centre */}
      {location.state?.from === 'command-centre' && (
        <div className="flex items-center gap-3 mb-5">
          <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white h-8 w-8" onClick={() => navigate('/app/command-centre')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold text-white">{t('wallet.title')}</h1>
        </div>
      )}

      {/* Wallet balance bar */}
      <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 mb-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-zinc-500 text-xs uppercase tracking-wider font-medium">{t('wallet.totalWalletValue')}</span>
            <p className="text-white text-2xl font-bold mt-0.5">
              ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 text-zinc-400 hover:text-white" onClick={handleCopy} title={walletAddress || ''}>
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Action buttons — horizontally scrollable */}
      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide pb-1">
        <Button variant="glass" className="flex-col h-auto py-3 gap-1.5 rounded-xl min-w-[72px] flex-shrink-0" onClick={() => setReceiveDialogOpen(true)}>
          <ArrowDownToLine className="w-5 h-5" />
          <span className="text-xs whitespace-nowrap">{t('wallet.receive')}</span>
        </Button>
        <Button variant="glass" className="flex-col h-auto py-3 gap-1.5 rounded-xl min-w-[72px] flex-shrink-0" onClick={() => {
          if (allWithBalance.length > 0) handleSend(allWithBalance[0]);
          else toast.info(t('wallet.noTokensToSend'));
        }}>
          <Send className="w-5 h-5" />
          <span className="text-xs whitespace-nowrap">{t('wallet.send')}</span>
        </Button>
        <Button variant="glass" className="flex-col h-auto py-3 gap-1.5 rounded-xl min-w-[72px] flex-shrink-0" onClick={async () => {
          try {
            const res = await createOnrampSession({
              walletAddress: walletAddress || '',
              currency: 'USD',
              amount: 50,
              tokenSymbol: 'DHB',
            });
            const url = (res as any)?.url || (res as any)?.redirectUrl;
            if (url) {
              window.open(url, '_blank');
            } else {
              toast.error(t('wallet.unableOpenGateway'));
            }
          } catch {
            toast.error(t('wallet.failedPurchaseSession'));
          }
        }}>
          <ShoppingCart className="w-5 h-5" />
          <span className="text-xs whitespace-nowrap">{t('wallet.buy')}</span>
        </Button>
        <Button variant="glass" className="flex-col h-auto py-3 gap-1.5 rounded-xl min-w-[72px] flex-shrink-0" onClick={() => toast.info(t('wallet.stakeComingSoon'))}>
          <Lock className="w-5 h-5" />
          <span className="text-xs whitespace-nowrap">{t('wallet.stake')}</span>
        </Button>
        <Button variant="glass" className="flex-col h-auto py-3 gap-1.5 rounded-xl min-w-[72px] flex-shrink-0" onClick={() => toast.info(t('wallet.cashOutComingSoon'))}>
          <Minus className="w-5 h-5" />
          <span className="text-xs whitespace-nowrap">{t('wallet.cashOut')}</span>
        </Button>
        <Button variant="glass" className="flex-col h-auto py-3 gap-1.5 rounded-xl min-w-[72px] flex-shrink-0" onClick={() => setImportDialogOpen(true)}>
          <Plus className="w-5 h-5" />
          <span className="text-xs whitespace-nowrap">{t('wallet.import')}</span>
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input
          placeholder={t('wallet.searchTokens')}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9 bg-zinc-900 border-zinc-800 text-white rounded-xl h-10"
        />
      </div>

      {/* Token list */}
      <div className="space-y-1">
        {isLoading && allTokens.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : (
          <>
            {withBalance.map(grouped => (
              <GroupedTokenRow key={grouped.symbol} grouped={grouped} onClick={() => handleGroupedTokenClick(grouped)} />
            ))}
            {zeroBalance.length > 0 && withBalance.length > 0 && (
              <div className="pt-3 pb-1">
                <span className="text-xs text-zinc-600 uppercase tracking-wider font-medium">{t('wallet.zeroBalance')}</span>
              </div>
            )}
            {zeroBalance.map(grouped => (
              <GroupedTokenRow key={grouped.symbol} grouped={grouped} onClick={() => handleGroupedTokenClick(grouped)} />
            ))}
          </>
        )}
      </div>

      {/* Import Token button */}
      <button
        onClick={() => setImportDialogOpen(true)}
        className="w-full mt-3 py-2 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-sm text-zinc-400 hover:text-zinc-200 transition-colors flex items-center justify-center"
      >
        <Plus className="w-4 h-4" />
      </button>

      {/* Token Action Drawer - shows actions for grouped token */}
      <GroupedActionDrawer
        open={!!actionGrouped}
        onOpenChange={v => { if (!v) setActionGrouped(null); }}
        grouped={actionGrouped}
        onSend={() => {
          const g = actionGrouped;
          setActionGrouped(null);
          if (g) handleSmartSend(g);
        }}
        onReceive={() => { setActionGrouped(null); setReceiveDialogOpen(true); }}
        walletAddress={walletAddress}
      />

      {/* Send Chain Picker - only shown when sending and multiple chains have balance */}
      <Drawer open={!!sendChainPickerGrouped} onOpenChange={v => { if (!v) setSendChainPickerGrouped(null); }}>
        <DrawerContent glass>
          <DrawerHeader>
            <DrawerTitle className="text-white">
              {t('wallet.selectChain', { symbol: sendChainPickerGrouped?.symbol })}
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-2">
            {sendChainPickerGrouped?.chains
              .filter(tk => tk.balance > BigInt(0))
              .map(token => {
                const chainInfo = CHAIN_OPTIONS.find(c => c.id === token.chainId);
                return (
                  <button
                    key={token.chainId}
                    onClick={() => {
                      setSendChainPickerGrouped(null);
                      setTimeout(() => handleSend(token), 200);
                    }}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] backdrop-blur-sm border border-white/10 transition-colors"
                  >
                    {chainInfo && <img src={chainInfo.icon} alt={chainInfo.name} className="w-6 h-6 rounded-md" />}
                    <div className="text-left flex-1 min-w-0">
                      <span className="text-sm font-medium text-white">{chainInfo?.name || `Chain ${token.chainId}`}</span>
                      <p className="text-xs text-zinc-400">{token.formattedBalance} {token.symbol}</p>
                    </div>
                  </button>
                );
              })}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Send Dialog */}
      <SendDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        token={selectedToken}
        chainId={selectedToken?.chainId ?? BASE_CHAIN_ID}
        onSuccess={() => { setSendDialogOpen(false); }}
        allTokens={allWithBalance}
        onTokenChange={setSelectedToken}
      />

      {/* Receive Dialog */}
      <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">{t('wallet.receiveTokens')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="bg-white rounded-2xl p-4">
              <div className="w-48 h-48 flex items-center justify-center">
                <QrCode className="w-32 h-32 text-zinc-900" />
              </div>
            </div>
            <p className="text-xs text-zinc-500 text-center">{t('wallet.receiveDescription')}</p>
            <div className="w-full bg-zinc-800 rounded-xl p-3">
              <p className="text-xs text-zinc-400 font-mono break-all text-center">{walletAddress}</p>
            </div>
            <Button variant="glass" className="w-full rounded-xl" onClick={handleCopy}>
              {copied ? <Check className="w-4 h-4 mr-2 text-emerald-400" /> : <Copy className="w-4 h-4 mr-2" />}
              {t('wallet.copyAddress')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Token Dialog */}
      <ImportTokenDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        chainId={importChainId}
        onImported={() => { setImportDialogOpen(false); }}
      />
    </div>
  );
}

/* ─── Grouped Token Row ─── */
function GroupedTokenRow({ grouped, onClick }: { grouped: GroupedToken; onClick: () => void }) {
  const { t } = useTranslation();
  const icon = TOKEN_ICONS[grouped.symbol] || grouped.logo;
  const hasBalance = grouped.totalBalance > BigInt(0);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="flex items-center justify-between p-3 rounded-xl hover:bg-zinc-900/60 transition-colors group cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-center gap-3 min-w-0">
        {icon ? (
          <img src={icon} alt={grouped.symbol} className="w-9 h-9 rounded-full shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-zinc-400">{grouped.symbol.slice(0, 2)}</span>
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-white">{grouped.symbol}</span>
            {grouped.isCustom && <span className="text-[10px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded">{t('wallet.custom')}</span>}
          </div>
          <span className="text-xs text-zinc-500 truncate block">{grouped.name}</span>
        </div>
      </div>
      <div className="text-right">
        <span className={`text-sm font-medium ${hasBalance ? 'text-white' : 'text-zinc-600'}`}>{grouped.totalFormattedBalance}</span>
      </div>
    </motion.div>
  );
}

/* ─── Grouped Action Drawer ─── */
function GroupedActionDrawer({ open, onOpenChange, grouped, onSend, onReceive, walletAddress }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  grouped: GroupedToken | null;
  onSend: () => void;
  onReceive: () => void;
  walletAddress?: string;
}) {
  const { t } = useTranslation();
  if (!grouped) return null;
  const icon = TOKEN_ICONS[grouped.symbol] || grouped.logo;
  const hasBalance = grouped.totalBalance > BigInt(0);
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-3 text-white">
            {icon ? (
              <img src={icon} alt={grouped.symbol} className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                <span className="text-xs font-bold text-zinc-400">{grouped.symbol.slice(0, 2)}</span>
              </div>
            )}
            <div>
              <span className="block">{grouped.symbol}</span>
              <span className="text-xs text-zinc-500 font-normal">
                {grouped.totalFormattedBalance} {grouped.symbol}
              </span>
            </div>
          </DrawerTitle>
        </DrawerHeader>
        <div className="grid grid-cols-3 gap-2 px-4 pb-6">
          <Button
            variant="glass"
            className="flex-col h-auto py-4 gap-2 rounded-xl"
            onClick={onSend}
            disabled={!hasBalance}
          >
            <Send className="w-5 h-5" />
            <span className="text-xs">{t('wallet.send')}</span>
          </Button>
          <Button
            variant="glass"
            className="flex-col h-auto py-4 gap-2 rounded-xl"
            onClick={onReceive}
          >
            <ArrowDownToLine className="w-5 h-5" />
            <span className="text-xs">{t('wallet.receive')}</span>
          </Button>
          <Button
            variant="glass"
            className="flex-col h-auto py-4 gap-2 rounded-xl"
            onClick={async () => {
              onOpenChange(false);

              // DHB → existing DHub fiat gateway
              if (grouped.symbol === 'DHB') {
                try {
                  const res = await createOnrampSession({
                    walletAddress: walletAddress || '',
                    currency: 'USD',
                    amount: 50,
                    tokenSymbol: 'DHB',
                  });
                  const url = (res as any)?.url || (res as any)?.redirectUrl;
                  if (url) {
                    window.open(url, '_blank');
                  } else {
                    toast.error(t('wallet.unableOpenGateway'));
                  }
                } catch {
                  toast.error(t('wallet.failedPurchaseSession'));
                }
                return;
              }

              // Non-DHB + Web3Auth session → built-in checkout aggregator
              if (isWeb3AuthConnected()) {
                try {
                  toast.info(t('wallet.openingCheckout', { symbol: grouped.symbol }));
                  await showWeb3AuthCheckout();
                } catch (err) {
                  console.error('[Buy] Web3Auth checkout failed:', err);
                  // Fallback to DEX
                  const dexUrl = getDexBuyLink(grouped.symbol);
                  if (dexUrl) {
                    toast.info(t('wallet.openingDex', { symbol: grouped.symbol }));
                    window.open(dexUrl, '_blank');
                  } else {
                    toast.error(t('wallet.checkoutUnavailable'));
                  }
                }
                return;
              }

              // Non-DHB + External wallet → DEX deeplink
              const dexUrl = getDexBuyLink(grouped.symbol);
              if (dexUrl) {
                toast.info(t('wallet.openingDex', { symbol: grouped.symbol }));
                window.open(dexUrl, '_blank');
              } else {
                toast.error(t('wallet.noBuyOption'));
              }
            }}
          >
            <ShoppingCart className="w-5 h-5" />
            <span className="text-xs">{t('wallet.buy')}</span>
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/* ─── Send Dialog ─── */
function SendDialog({ open, onOpenChange, token, chainId, onSuccess, allTokens, onTokenChange }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  token: WalletToken | null;
  chainId: ChainId;
  onSuccess: () => void;
  allTokens: WalletToken[];
  onTokenChange: (t: WalletToken) => void;
}) {
  const { t } = useTranslation();
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [usernameQuery, setUsernameQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolvedUser, setResolvedUser] = useState<{ username: string; avatar?: string; address: string } | null>(null);

  const handleUsernameSearch = useCallback(async (query: string) => {
    setUsernameQuery(query);
    setResolvedUser(null);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const { searchUsers } = await import('@/lib/api/dehub/users');
      const res = await searchUsers({ q: query, limit: 5 });
      const items = res?.data || (Array.isArray(res) ? res : []);
      setSearchResults(items.filter((u: any) => u.address || u.wallet_address));
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const selectUser = (user: any) => {
    const addr = user.address || user.wallet_address || '';
    const name = user.username || user.displayName || user.display_name || '';
    const avatar = user.avatarImageUrl || user.avatarUrl || user.avatar_url || '';
    setToAddress(addr);
    setResolvedUser({ username: name, avatar, address: addr });
    setUsernameQuery('');
    setSearchResults([]);
  };

  const clearResolvedUser = () => {
    setResolvedUser(null);
    setToAddress('');
  };

  const handleSend = async () => {
    if (!token || !toAddress.trim() || !amount.trim()) return;
    const trimmedTo = toAddress.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmedTo)) {
      toast.error(t('wallet.invalidAddress'));
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error(t('wallet.invalidAmount'));
      return;
    }
    const maxBal = parseFloat(formatBalance(token.balance, token.decimals, 18));
    if (numAmount > maxBal) {
      toast.error(t('wallet.insufficientBalance', { symbol: token.symbol }));
      return;
    }

    setSending(true);
    try {
      await switchChain(chainId);
      
      let result;
      if (token.isNative) {
        result = await sendNativeToken(trimmedTo, amount, token.decimals, chainId);
      } else {
        result = await sendERC20Token(token.address, trimmedTo, amount, token.decimals, chainId);
      }

      toast.success(t('wallet.sent', { amount, symbol: token.symbol }), {
        description: `TX: ${result.hash.slice(0, 10)}...`,
        action: {
          label: t('wallet.view'),
          onClick: () => {
            const explorer = CHAIN_CONFIGS[chainId]?.explorerUrl;
            if (explorer) window.open(`${explorer}/tx/${result.hash}`, '_blank');
          },
        },
      });
      setToAddress('');
      setAmount('');
      setResolvedUser(null);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || t('wallet.transactionFailed'));
    } finally {
      setSending(false);
    }
  };

  const handleMax = () => {
    if (!token) return;
    setAmount(formatBalance(token.balance, token.decimals, 18));
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!sending) onOpenChange(v); }}>
      <DialogContent className="bg-black/60 backdrop-blur-[24px] backdrop-saturate-[180%] border-white/10 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{t('wallet.sendToken', { symbol: token?.symbol || 'Token' })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Token selector */}
          {allTokens.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {allTokens.map(tk => {
                const icon = TOKEN_ICONS[tk.symbol] || tk.logo;
                return (
                  <button
                    key={tk.address}
                    onClick={() => onTokenChange(tk)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                      token?.address === tk.address ? 'bg-white/15 text-white' : 'bg-white/5 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {icon ? <img src={icon} alt={tk.symbol} className="w-4 h-4 rounded-full" /> : null}
                    {tk.symbol}
                  </button>
                );
              })}
            </div>
          )}

          {/* Recipient: username search OR direct address */}
          <div className="space-y-2">
            <label className="text-sm text-zinc-400">{t('wallet.recipientAddress')}</label>
            
            {resolvedUser ? (
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                {resolvedUser.avatar ? (
                  <img src={resolvedUser.avatar} alt="" className="w-6 h-6 rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
                    <User className="w-3 h-3 text-zinc-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">@{resolvedUser.username}</p>
                  <p className="text-zinc-500 text-xs font-mono truncate">{resolvedUser.address.slice(0, 10)}...{resolvedUser.address.slice(-6)}</p>
                </div>
                <button onClick={clearResolvedUser} className="text-zinc-500 hover:text-white text-xs">✕</button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  placeholder={`@username or 0x...`}
                  value={usernameQuery || toAddress}
                  onChange={e => {
                    const val = e.target.value;
                    if (val.startsWith('0x')) {
                      setToAddress(val);
                      setUsernameQuery('');
                      setSearchResults([]);
                    } else {
                      setToAddress('');
                      handleUsernameSearch(val);
                    }
                  }}
                  className="bg-white/5 border-white/10 text-white font-mono text-sm"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-zinc-500" />
                )}
                {searchResults.length > 0 && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-zinc-900 border border-white/10 rounded-lg overflow-hidden shadow-xl">
                    {searchResults.map((user: any, i: number) => {
                      const avatar = user.avatarImageUrl || user.avatarUrl || user.avatar_url;
                      const name = user.username || user.displayName || user.display_name;
                      const addr = user.address || user.wallet_address || '';
                      return (
                        <button
                          key={addr || i}
                          onClick={() => selectUser(user)}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/10 transition-colors text-left"
                        >
                          {avatar ? (
                            <img src={avatar} alt="" className="w-7 h-7 rounded-full" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
                              <User className="w-3.5 h-3.5 text-zinc-400" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-white text-sm truncate">@{name}</p>
                            <p className="text-zinc-500 text-xs font-mono truncate">{addr.slice(0, 8)}...{addr.slice(-4)}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-zinc-400">{t('wallet.amount')}</label>
              {token && (
                <button onClick={handleMax} className="text-xs text-white/60 hover:text-white transition-colors">
                  Max: {token.formattedBalance}
                </button>
              )}
            </div>
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="bg-white/5 border-white/10 text-white"
              step="any"
            />
          </div>

          <Button
            variant="glass"
            className="w-full rounded-xl"
            disabled={!toAddress.trim() || !amount.trim() || sending}
            onClick={handleSend}
          >
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            {sending ? t('wallet.sending') : t('wallet.sendToken', { symbol: token?.symbol || '' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Import Token Dialog ─── */
function ImportTokenDialog({ open, onOpenChange, chainId: initialChainId, onImported }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  chainId: ChainId;
  onImported: () => void;
}) {
  const { t } = useTranslation();
  const [chainId, setChainId] = useState<ChainId>(initialChainId);
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<{ name: string; symbol: string; decimals: number } | null>(null);

  const handleLookup = async () => {
    const trimmed = address.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      toast.error(t('wallet.invalidContractAddress'));
      return;
    }
    setLoading(true);
    try {
      const info = await getERC20Metadata(trimmed, chainId);
      setTokenInfo(info);
    } catch {
      toast.error(t('wallet.cannotReadContract'));
    } finally {
      setLoading(false);
    }
  };

  const handleImport = () => {
    if (!tokenInfo) return;
    saveCustomToken(chainId, { address: address.trim(), ...tokenInfo });
    toast.success(t('wallet.imported', { symbol: tokenInfo.symbol }));
    setAddress('');
    setTokenInfo(null);
    onImported();
  };

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) { setAddress(''); setTokenInfo(null); } }}>
      <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{t('wallet.importCustomToken')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Chain selector for import */}
          <div className="flex gap-1.5">
            {CHAIN_OPTIONS.map(chain => (
              <button
                key={chain.id}
                onClick={() => { setChainId(chain.id); setTokenInfo(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  chainId === chain.id ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <img src={chain.icon} alt={chain.name} className="w-4 h-4 rounded-sm" />
                {chain.name}
              </button>
            ))}
          </div>

          <p className="text-xs text-zinc-500">{t('wallet.importDescription', { network: CHAIN_CONFIGS[chainId]?.name || 'this network' })}</p>
          <div className="space-y-2">
            <label className="text-sm text-zinc-400">{t('wallet.tokenContractAddress')}</label>
            <Input
              placeholder="0x..."
              value={address}
              onChange={e => { setAddress(e.target.value); setTokenInfo(null); }}
              className="bg-zinc-800 border-zinc-700 text-white font-mono text-sm"
            />
          </div>

          {!tokenInfo ? (
            <Button variant="glass" className="w-full rounded-xl" onClick={handleLookup} disabled={loading || !address.trim()}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
              {loading ? t('wallet.lookingUp') : t('wallet.lookUpToken')}
            </Button>
          ) : (
            <>
              <div className="bg-zinc-800/60 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">{t('wallet.name')}</span>
                  <span className="text-sm text-white font-medium">{tokenInfo.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">{t('wallet.symbol')}</span>
                  <span className="text-sm text-white font-medium">{tokenInfo.symbol}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">{t('wallet.decimals')}</span>
                  <span className="text-sm text-white font-medium">{tokenInfo.decimals}</span>
                </div>
              </div>
              <Button variant="glass" className="w-full rounded-xl" onClick={handleImport}>
                <Plus className="w-4 h-4 mr-2" />
                {t('wallet.importToken', { symbol: tokenInfo.symbol })}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
