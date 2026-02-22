import { useState, useMemo } from 'react';
import { ArrowLeft, Copy, Check, Send, QrCode, Plus, ArrowDownToLine, Loader2, Search, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importChainId, setImportChainId] = useState<ChainId>(BASE_CHAIN_ID);
  const [selectedToken, setSelectedToken] = useState<WalletToken | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [chainPickerToken, setChainPickerToken] = useState<GroupedToken | null>(null);
  const [actionToken, setActionToken] = useState<WalletToken | null>(null);

  const { allTokens, isLoading } = useAllChainsTokens();

  // Collect auto-detected tokens (not in TOKEN_ICONS) for dynamic price lookups
  const extraTokensForPricing = useMemo(() => {
    const known = new Set(Object.keys(TOKEN_ICONS));
    const seen = new Set<string>();
    const extras: { address: string; symbol: string }[] = [];
    for (const t of allTokens) {
      if (!known.has(t.symbol) && t.address !== '0x0' && !seen.has(t.address.toLowerCase())) {
        seen.add(t.address.toLowerCase());
        extras.push({ address: t.address, symbol: t.symbol });
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
    return Array.from(map.values());
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
  const allWithBalance = useMemo(() => allTokens.filter(t => t.balance > BigInt(0)), [allTokens]);

  if (!isAuthenticated) {
    return <AuthGate description="Log in to access your wallet." />;
  }

  const handleCopy = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    toast.success('Address copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = (token: WalletToken) => {
    setSelectedToken(token);
    setSendDialogOpen(true);
  };

  // Smart click handler: if token is on 1 chain, open actions directly. If multiple, show chain picker.
  const handleGroupedTokenClick = (grouped: GroupedToken) => {
    if (grouped.chains.length === 1) {
      setActionToken(grouped.chains[0]);
    } else {
      setChainPickerToken(grouped);
    }
  };

  return (
    <div className="p-2 sm:p-3 pt-2 lg:pt-3 min-h-screen max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white h-8 w-8" onClick={() => navigate('/app/command-centre')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-bold text-white">Wallet</h1>
      </div>

      {/* Wallet balance bar */}
      <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 mb-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-zinc-500 text-xs uppercase tracking-wider font-medium">Total Balance</span>
            <p className="text-white text-2xl font-bold mt-0.5">
              ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 text-zinc-400 hover:text-white" onClick={handleCopy} title={walletAddress || ''}>
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <Button variant="glass" className="flex-col h-auto py-3 gap-1.5 rounded-xl" onClick={() => setReceiveDialogOpen(true)}>
          <ArrowDownToLine className="w-5 h-5" />
          <span className="text-xs">Receive</span>
        </Button>
        <Button variant="glass" className="flex-col h-auto py-3 gap-1.5 rounded-xl" onClick={() => {
          if (allWithBalance.length > 0) handleSend(allWithBalance[0]);
          else toast.info('No tokens with balance to send');
        }}>
          <Send className="w-5 h-5" />
          <span className="text-xs">Send</span>
        </Button>
        <Button variant="glass" className="flex-col h-auto py-3 gap-1.5 rounded-xl" onClick={async () => {
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
              toast.error('Unable to open payment gateway');
            }
          } catch {
            toast.error('Failed to start purchase session');
          }
        }}>
          <ShoppingCart className="w-5 h-5" />
          <span className="text-xs">Buy</span>
        </Button>
        <Button variant="glass" className="flex-col h-auto py-3 gap-1.5 rounded-xl" onClick={() => setImportDialogOpen(true)}>
          <Plus className="w-5 h-5" />
          <span className="text-xs">Import</span>
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input
          placeholder="Search tokens..."
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
                <span className="text-xs text-zinc-600 uppercase tracking-wider font-medium">Zero balance</span>
              </div>
            )}
            {zeroBalance.map(grouped => (
              <GroupedTokenRow key={grouped.symbol} grouped={grouped} onClick={() => handleGroupedTokenClick(grouped)} />
            ))}
          </>
        )}
      </div>

      {/* Chain Picker Drawer - shown when token exists on multiple chains */}
      <Drawer open={!!chainPickerToken} onOpenChange={v => { if (!v) setChainPickerToken(null); }}>
        <DrawerContent glass>
          <DrawerHeader>
            <DrawerTitle className="text-white">
              {chainPickerToken?.symbol} — Select Chain
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-2">
            {chainPickerToken?.chains.map(token => {
              const chainInfo = CHAIN_OPTIONS.find(c => c.id === token.chainId);
              const hasBalance = token.balance > BigInt(0);
              return (
                <button
                  key={token.chainId}
                  onClick={() => {
                    setChainPickerToken(null);
                    setTimeout(() => setActionToken(token), 200);
                  }}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] backdrop-blur-sm border border-white/10 transition-colors"
                >
                  {chainInfo && <img src={chainInfo.icon} alt={chainInfo.name} className="w-6 h-6 rounded-md" />}
                  <div className="text-left flex-1 min-w-0">
                    <span className="text-sm font-medium text-white">{chainInfo?.name || `Chain ${token.chainId}`}</span>
                    <p className={`text-xs ${hasBalance ? 'text-zinc-400' : 'text-zinc-600'}`}>{token.formattedBalance} {token.symbol}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Token Action Drawer - shown for a specific chain token */}
      <TokenActionDrawer
        open={!!actionToken}
        onOpenChange={v => { if (!v) setActionToken(null); }}
        token={actionToken}
        icon={actionToken ? (TOKEN_ICONS[actionToken.symbol] || actionToken.logo) : undefined}
        hasBalance={actionToken ? actionToken.balance > BigInt(0) : false}
        onSend={() => { const t = actionToken; setActionToken(null); if (t) handleSend(t); }}
        onReceive={() => { setActionToken(null); setReceiveDialogOpen(true); }}
      />

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
            <DialogTitle className="text-white">Receive Tokens</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="bg-white rounded-2xl p-4">
              <div className="w-48 h-48 flex items-center justify-center">
                <QrCode className="w-32 h-32 text-zinc-900" />
              </div>
            </div>
            <p className="text-xs text-zinc-500 text-center">Send tokens to your wallet address (available on all supported chains)</p>
            <div className="w-full bg-zinc-800 rounded-xl p-3">
              <p className="text-xs text-zinc-400 font-mono break-all text-center">{walletAddress}</p>
            </div>
            <Button variant="glass" className="w-full rounded-xl" onClick={handleCopy}>
              {copied ? <Check className="w-4 h-4 mr-2 text-emerald-400" /> : <Copy className="w-4 h-4 mr-2" />}
              Copy Address
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
  const icon = TOKEN_ICONS[grouped.symbol] || grouped.logo;
  const hasBalance = grouped.totalBalance > BigInt(0);
  const chainCount = grouped.chains.length;

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
          <div className="relative shrink-0">
            <img src={icon} alt={grouped.symbol} className="w-9 h-9 rounded-full" />
            {chainCount > 1 && (
              <span className="absolute -bottom-1 -right-1 bg-zinc-700 text-[9px] text-zinc-300 font-bold rounded-full w-4 h-4 flex items-center justify-center border border-zinc-900">
                {chainCount}
              </span>
            )}
          </div>
        ) : (
          <div className="relative shrink-0">
            <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center">
              <span className="text-xs font-bold text-zinc-400">{grouped.symbol.slice(0, 2)}</span>
            </div>
            {chainCount > 1 && (
              <span className="absolute -bottom-1 -right-1 bg-zinc-700 text-[9px] text-zinc-300 font-bold rounded-full w-4 h-4 flex items-center justify-center border border-zinc-900">
                {chainCount}
              </span>
            )}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-white">{grouped.symbol}</span>
            {grouped.isCustom && <span className="text-[10px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded">CUSTOM</span>}
          </div>
          <span className="text-xs text-zinc-500 truncate block">
            {grouped.name}
            {chainCount > 1 && <span className="text-zinc-600"> · {chainCount} chains</span>}
          </span>
        </div>
      </div>
      <div className="text-right">
        <span className={`text-sm font-medium ${hasBalance ? 'text-white' : 'text-zinc-600'}`}>{grouped.totalFormattedBalance}</span>
      </div>
    </motion.div>
  );
}

/* ─── Token Action Drawer ─── */
function TokenActionDrawer({ open, onOpenChange, token, icon, hasBalance, onSend, onReceive }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  token: WalletToken | null;
  icon: string | undefined;
  hasBalance: boolean;
  onSend: () => void;
  onReceive: () => void;
}) {
  if (!token) return null;
  const chainInfo = CHAIN_OPTIONS.find(c => c.id === token.chainId);
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-3 text-white">
            {icon ? (
              <img src={icon} alt={token.symbol} className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                <span className="text-xs font-bold text-zinc-400">{token.symbol.slice(0, 2)}</span>
              </div>
            )}
            <div>
              <span className="block">{token.symbol}</span>
              <span className="text-xs text-zinc-500 font-normal">
                {token.formattedBalance} {token.symbol}
                {chainInfo && <span> · {chainInfo.name}</span>}
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
            <span className="text-xs">Send</span>
          </Button>
          <Button
            variant="glass"
            className="flex-col h-auto py-4 gap-2 rounded-xl"
            onClick={onReceive}
          >
            <ArrowDownToLine className="w-5 h-5" />
            <span className="text-xs">Receive</span>
          </Button>
          <Button
            variant="glass"
            className="flex-col h-auto py-4 gap-2 rounded-xl"
            onClick={() => {
              toast.info('Buy feature coming soon');
              onOpenChange(false);
            }}
          >
            <ShoppingCart className="w-5 h-5" />
            <span className="text-xs">Buy</span>
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
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!token || !toAddress.trim() || !amount.trim()) return;
    const trimmedTo = toAddress.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmedTo)) {
      toast.error('Invalid wallet address');
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Invalid amount');
      return;
    }
    // Check balance
    const maxBal = parseFloat(formatBalance(token.balance, token.decimals, 18));
    if (numAmount > maxBal) {
      toast.error(`Insufficient ${token.symbol} balance`);
      return;
    }

    setSending(true);
    try {
      // Switch chain first
      await switchChain(chainId);
      
      let result;
      if (token.isNative) {
        result = await sendNativeToken(trimmedTo, amount, token.decimals, chainId);
      } else {
        result = await sendERC20Token(token.address, trimmedTo, amount, token.decimals, chainId);
      }

      toast.success(`Sent ${amount} ${token.symbol}`, {
        description: `TX: ${result.hash.slice(0, 10)}...`,
        action: {
          label: 'View',
          onClick: () => {
            const explorer = CHAIN_CONFIGS[chainId]?.explorerUrl;
            if (explorer) window.open(`${explorer}/tx/${result.hash}`, '_blank');
          },
        },
      });
      setToAddress('');
      setAmount('');
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Transaction failed');
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
      <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Send {token?.symbol || 'Token'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Token selector */}
          {allTokens.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {allTokens.map(t => {
                const icon = TOKEN_ICONS[t.symbol] || t.logo;
                return (
                  <button
                    key={t.address}
                    onClick={() => onTokenChange(t)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                      token?.address === t.address ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {icon ? <img src={icon} alt={t.symbol} className="w-4 h-4 rounded-full" /> : null}
                    {t.symbol}
                  </button>
                );
              })}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Recipient address</label>
            <Input
              placeholder="0x..."
              value={toAddress}
              onChange={e => setToAddress(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-white font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-zinc-400">Amount</label>
              {token && (
                <button onClick={handleMax} className="text-xs text-violet-400 hover:text-violet-300">
                  Max: {token.formattedBalance}
                </button>
              )}
            </div>
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-white"
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
            {sending ? 'Sending...' : `Send ${token?.symbol || ''}`}
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
  const [chainId, setChainId] = useState<ChainId>(initialChainId);
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<{ name: string; symbol: string; decimals: number } | null>(null);

  const handleLookup = async () => {
    const trimmed = address.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      toast.error('Invalid contract address');
      return;
    }
    setLoading(true);
    try {
      const info = await getERC20Metadata(trimmed, chainId);
      setTokenInfo(info);
    } catch {
      toast.error('Could not read token contract. Make sure the address is correct.');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = () => {
    if (!tokenInfo) return;
    saveCustomToken(chainId, { address: address.trim(), ...tokenInfo });
    toast.success(`Imported ${tokenInfo.symbol}`);
    setAddress('');
    setTokenInfo(null);
    onImported();
  };

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) { setAddress(''); setTokenInfo(null); } }}>
      <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Import Custom Token</DialogTitle>
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

          <p className="text-xs text-zinc-500">Add any ERC-20 token on {CHAIN_CONFIGS[chainId]?.name || 'this network'} by pasting the contract address.</p>
          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Token contract address</label>
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
              {loading ? 'Looking up...' : 'Look up token'}
            </Button>
          ) : (
            <>
              <div className="bg-zinc-800/60 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Name</span>
                  <span className="text-sm text-white font-medium">{tokenInfo.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Symbol</span>
                  <span className="text-sm text-white font-medium">{tokenInfo.symbol}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Decimals</span>
                  <span className="text-sm text-white font-medium">{tokenInfo.decimals}</span>
                </div>
              </div>
              <Button variant="glass" className="w-full rounded-xl" onClick={handleImport}>
                <Plus className="w-4 h-4 mr-2" />
                Import {tokenInfo.symbol}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
