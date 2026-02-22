import { useState, useMemo, useCallback } from 'react';
import { ArrowLeft, Copy, Check, Send, QrCode, Plus, ArrowDownToLine, Loader2, Trash2, ExternalLink, Search, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/app/AuthGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useWalletTokens, useAllChainsTokens } from '@/hooks/use-wallet-tokens';
import { useTokenPrices } from '@/hooks/use-token-prices';
import { sendNativeToken, sendERC20Token } from '@/lib/wallet/send';
import { getERC20Metadata, saveCustomToken, removeCustomToken, formatBalance, type WalletToken } from '@/lib/wallet/tokens';
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

export default function FullWalletPage() {
  const { isAuthenticated, walletAddress } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [selectedChain, setSelectedChain] = useState<ChainId>(BASE_CHAIN_ID);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<WalletToken | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { tokens, isLoading, refetch, isFetching } = useWalletTokens(selectedChain);
  const { allTokens } = useAllChainsTokens();
  const { data: prices = {} } = useTokenPrices();

  // Compute total USD across all chains
  const totalUsd = useMemo(() => {
    return allTokens.reduce((sum, token) => {
      const price = prices[token.symbol] ?? 0;
      const value = parseFloat(token.formattedBalance) * price;
      return sum + (isNaN(value) ? 0 : value);
    }, 0);
  }, [allTokens, prices]);

  const filteredTokens = useMemo(() => {
    if (!searchQuery.trim()) return tokens;
    const q = searchQuery.toLowerCase();
    return tokens.filter(t => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
  }, [tokens, searchQuery]);

  // Separate tokens with balance vs zero balance
  const { withBalance, zeroBalance } = useMemo(() => {
    const withBalance = filteredTokens.filter(t => t.balance > BigInt(0));
    const zeroBalance = filteredTokens.filter(t => t.balance === BigInt(0));
    return { withBalance, zeroBalance };
  }, [filteredTokens]);

  const [copied, setCopied] = useState(false);

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

  const chainConfig = CHAIN_CONFIGS[selectedChain];

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
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Button variant="glass" className="flex-col h-auto py-3 gap-1.5 rounded-xl" onClick={() => setReceiveDialogOpen(true)}>
          <ArrowDownToLine className="w-5 h-5" />
          <span className="text-xs">Receive</span>
        </Button>
        <Button variant="glass" className="flex-col h-auto py-3 gap-1.5 rounded-xl" onClick={() => {
          if (withBalance.length > 0) handleSend(withBalance[0]);
          else toast.info('No tokens with balance to send');
        }}>
          <Send className="w-5 h-5" />
          <span className="text-xs">Send</span>
        </Button>
        <Button variant="glass" className="flex-col h-auto py-3 gap-1.5 rounded-xl" onClick={() => setImportDialogOpen(true)}>
          <Plus className="w-5 h-5" />
          <span className="text-xs">Import Token</span>
        </Button>
      </div>

      {/* Chain selector */}
      <div className="relative flex gap-1 p-1 rounded-2xl bg-black/60 backdrop-blur-[24px] border border-white/10 mb-4">
        {CHAIN_OPTIONS.map(chain => (
          <button
            key={chain.id}
            onClick={() => setSelectedChain(chain.id)}
            className="relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors z-10 flex-1 justify-center"
          >
            {selectedChain === chain.id && (
              <motion.div
                layoutId="wallet-chain-indicator"
                className="absolute inset-0 rounded-xl bg-white/[0.12] backdrop-blur-xl border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <img src={chain.icon} alt={chain.name} className="w-5 h-5 rounded-md relative z-10" />
            <span className={`relative z-10 ${selectedChain === chain.id ? 'text-white' : 'text-zinc-500'}`}>{chain.name}</span>
          </button>
        ))}
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
      <div className={`space-y-1 transition-opacity duration-150 ${isFetching && !isLoading ? 'opacity-60' : 'opacity-100'}`}>
        {isLoading && tokens.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : (
          <>
            {withBalance.map(token => (
              <TokenRow key={`${token.chainId}-${token.address}`} token={token} onSend={handleSend} onReceive={() => setReceiveDialogOpen(true)} chainConfig={chainConfig} walletAddress={walletAddress} />
            ))}
            {zeroBalance.length > 0 && withBalance.length > 0 && (
              <div className="pt-3 pb-1">
                <span className="text-xs text-zinc-600 uppercase tracking-wider font-medium">Zero balance</span>
              </div>
            )}
            {zeroBalance.map(token => (
              <TokenRow key={`${token.chainId}-${token.address}`} token={token} onSend={handleSend} onReceive={() => setReceiveDialogOpen(true)} chainConfig={chainConfig} walletAddress={walletAddress} />
            ))}
          </>
        )}
      </div>

      {/* Send Dialog */}
      <SendDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        token={selectedToken}
        chainId={selectedChain}
        onSuccess={() => { refetch(); setSendDialogOpen(false); }}
        allTokens={withBalance}
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
            <p className="text-xs text-zinc-500 text-center">Send tokens to your wallet address on the {CHAIN_CONFIGS[selectedChain]?.name} network</p>
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
        chainId={selectedChain}
        onImported={() => { refetch(); setImportDialogOpen(false); }}
      />
    </div>
  );
}

/* ─── Token Row ─── */
function TokenRow({ token, onSend, onReceive, chainConfig, walletAddress }: { 
  token: WalletToken; 
  onSend: (t: WalletToken) => void; 
  onReceive: () => void;
  chainConfig: any;
  walletAddress?: string;
}) {
  const icon = TOKEN_ICONS[token.symbol] || token.logo;
  const hasBalance = token.balance > BigInt(0);
  const [showActions, setShowActions] = useState(false);

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="flex items-center justify-between p-3 rounded-xl hover:bg-zinc-900/60 transition-colors group cursor-pointer"
        onClick={() => setShowActions(true)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {icon ? (
            <img src={icon} alt={token.symbol} className="w-9 h-9 rounded-full shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-zinc-400">{token.symbol.slice(0, 2)}</span>
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-white">{token.symbol}</span>
              {token.isCustom && <span className="text-[10px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded">CUSTOM</span>}
            </div>
            <span className="text-xs text-zinc-500 truncate block">{token.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <span className={`text-sm font-medium ${hasBalance ? 'text-white' : 'text-zinc-600'}`}>{token.formattedBalance}</span>
          </div>
          {token.isCustom && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-red-400"
              onClick={(e) => {
                e.stopPropagation();
                removeCustomToken(token.chainId, token.address);
                toast.success(`Removed ${token.symbol}`);
                window.dispatchEvent(new Event('custom-token-changed'));
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </motion.div>

      {/* Token action drawer */}
      <TokenActionDrawer
        open={showActions}
        onOpenChange={setShowActions}
        token={token}
        icon={icon}
        hasBalance={hasBalance}
        onSend={() => { setShowActions(false); onSend(token); }}
        onReceive={() => { setShowActions(false); onReceive(); }}
      />
    </>
  );
}

/* ─── Token Action Drawer ─── */
function TokenActionDrawer({ open, onOpenChange, token, icon, hasBalance, onSend, onReceive }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  token: WalletToken;
  icon: string | undefined;
  hasBalance: boolean;
  onSend: () => void;
  onReceive: () => void;
}) {
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
              <span className="text-xs text-zinc-500 font-normal">{token.formattedBalance} {token.symbol}</span>
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
function ImportTokenDialog({ open, onOpenChange, chainId, onImported }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  chainId: ChainId;
  onImported: () => void;
}) {
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
