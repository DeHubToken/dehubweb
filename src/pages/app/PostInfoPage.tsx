/**
 * Post Info Page
 * ==============
 * Displays NFT-related information for a post including:
 * - Transaction hash of the mint
 * - Exact timestamp
 * - Blockchain chain info (Base or BSC/BNB)
 * - Creator/minter wallet
 * - Engagement stats
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, ExternalLink, ThumbsUp, ThumbsDown, Eye, MessageCircle, User, Loader2, Users, Tag, HandCoins, Plus, Globe, Lock, EyeOff, Pencil, Radio, Ticket, Coins } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getNFTInfo, DeHubNFT, updateTokenVisibility, TokenVisibility } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { getTokenHolders, TOTAL_FRACTIONS, truncateAddress as truncateAddr } from '@/lib/api/token-holders';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import medal1 from '@/assets/medal-1.png';
import medal2 from '@/assets/medal-2.png';
import dehubCoin from '@/assets/dehub-coin.png';
import medal3 from '@/assets/medal-3.png';
import { EditPostModal } from '@/components/app/modals/EditPostModal';
import { usePPVPurchaseCount } from '@/hooks/use-ppv-purchase-count';

// Visibility options configuration
const VISIBILITY_OPTIONS: { value: TokenVisibility; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'public', label: 'Public', icon: <Globe className="w-4 h-4" />, description: 'Anyone can see this post' },
  { value: 'unlisted', label: 'Unlisted', icon: <EyeOff className="w-4 h-4" />, description: 'Only people with the link can see' },
  { value: 'private', label: 'Private', icon: <Lock className="w-4 h-4" />, description: 'Only you can see this post' },
];

// Types for listings and offers (data will come from API)
interface Listing {
  id: string;
  seller: string;
  amount: number;
  pricePerFraction: number;
  totalPrice: number;
  createdAt: string;
}

interface Offer {
  id: string;
  buyer: string;
  amount: number;
  pricePerFraction: number;
  totalPrice: number;
  createdAt: string;
  status: 'pending' | 'accepted' | 'rejected';
}

// FractionMarketplace Component
interface FractionMarketplaceProps {
  holders: { address: string; balance: number; percentage: number }[];
  nftInfo: DeHubNFT;
  truncateAddr: (address: string) => string;
}

function ListFractionsDrawer({ 
  availableBalance, 
  open, 
  onOpenChange 
}: { 
  availableBalance: number; 
  open: boolean; 
  onOpenChange: (v: boolean) => void;
}) {
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');

  const qty = parseInt(quantity) || 0;
  const prc = parseFloat(price) || 0;
  const total = qty * prc;
  const isValid = qty > 0 && qty <= availableBalance && prc > 0;

  const handleSubmit = () => {
    if (!isValid) return;
    toast.info(`Listing ${qty} fraction${qty > 1 ? 's' : ''} at ${prc} DHB each — on-chain listing coming soon`);
    onOpenChange(false);
    setQuantity('');
    setPrice('');
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass className="px-4 pb-8">
        <DrawerHeader className="px-0">
          <DrawerTitle className="text-white text-lg">List Your Fractions</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-4">
          {/* Quantity */}
          <div>
            <label className="text-sm text-white/60 mb-1.5 block">
              Quantity <span className="text-white/40">({availableBalance} available)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={availableBalance}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 outline-none focus:border-white/30 transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <Button
                variant="ghost"
                size="sm"
                className="text-white/60 hover:text-white shrink-0"
                onClick={() => setQuantity(String(availableBalance))}
              >
                Max
              </Button>
            </div>
          </div>

          {/* Price per fraction */}
          <div>
            <label className="text-sm text-white/60 mb-1.5 block">Price per Fraction (DHB)</label>
            <div className="relative">
              <input
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-16 text-white placeholder:text-white/30 outline-none focus:border-white/30 transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 text-sm">DHB</span>
            </div>
          </div>

          {/* Summary */}
          {qty > 0 && prc > 0 && (
            <div className="bg-white/5 rounded-xl p-3 border border-white/10">
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Total listing value</span>
                <span className="text-white font-medium">{total.toLocaleString(undefined, { maximumFractionDigits: 2 })} DHB</span>
              </div>
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!isValid}
            className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20 disabled:opacity-40"
          >
            <Tag className="w-4 h-4 mr-2" />
            List {qty > 0 ? `${qty} Fraction${qty > 1 ? 's' : ''}` : 'Fractions'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function FractionMarketplace({ holders, nftInfo, truncateAddr }: FractionMarketplaceProps) {
  const { user, walletAddress } = useAuth();
  const [listDrawerOpen, setListDrawerOpen] = useState(false);
  
  // Check if current user owns any fractions
  const userHolding = walletAddress 
    ? holders.find(h => h.address.toLowerCase() === walletAddress.toLowerCase())
    : null;
  const userOwnsFractions = !!userHolding && userHolding.balance > 0;

  const handleMakeOffer = () => {
    toast.info('Make offer feature coming soon');
  };

  return (
    <section className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      {userOwnsFractions && (
        <ListFractionsDrawer 
          availableBalance={userHolding!.balance} 
          open={listDrawerOpen} 
          onOpenChange={setListDrawerOpen} 
        />
      )}
      <Tabs defaultValue="listings" className="w-full">
        <TabsList className="w-full bg-transparent border-b border-white/10 rounded-none h-auto p-0">
          <TabsTrigger 
            value="listings" 
            className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent bg-transparent py-3 text-white/60 data-[state=active]:text-white"
          >
            <Tag className="w-4 h-4 mr-2" />
            Listings
          </TabsTrigger>
          <TabsTrigger 
            value="offers" 
            className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent bg-transparent py-3 text-white/60 data-[state=active]:text-white"
          >
            <HandCoins className="w-4 h-4 mr-2" />
            Offers
          </TabsTrigger>
        </TabsList>
        
        {/* Listings Tab */}
        <TabsContent value="listings" className="p-4 mt-0">
          <div className="text-center py-8">
            <Tag className="w-8 h-8 text-white/20 mx-auto mb-2" />
            <p className="text-white/40 text-sm">No listings yet</p>
          </div>
          
          <div className="space-y-3">
            {userOwnsFractions && (
              <Button 
                onClick={() => setListDrawerOpen(true)}
                className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20"
              >
                <Plus className="w-4 h-4 mr-2" />
                List Your Fractions ({userHolding.balance} available)
              </Button>
            )}
            {!userOwnsFractions && (
              <Button 
                onClick={handleMakeOffer}
                className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20"
              >
                <Plus className="w-4 h-4 mr-2" />
                Make an Offer
              </Button>
            )}
          </div>
        </TabsContent>
        
        {/* Offers Tab */}
        <TabsContent value="offers" className="p-4 mt-0">
          <div className="text-center py-8">
            <HandCoins className="w-8 h-8 text-white/20 mx-auto mb-2" />
            <p className="text-white/40 text-sm">No offers yet</p>
          </div>
          
          <div className="space-y-3">
            {userOwnsFractions && (
              <Button 
                onClick={() => setListDrawerOpen(true)}
                className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20"
              >
                <Plus className="w-4 h-4 mr-2" />
                List Your Fractions ({userHolding.balance} available)
              </Button>
            )}
            {!userOwnsFractions && (
              <Button 
                onClick={handleMakeOffer}
                className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20"
              >
                <Plus className="w-4 h-4 mr-2" />
                Make an Offer
              </Button>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

// Chain configuration
const CHAIN_CONFIG: Record<number, { name: string; explorerUrl: string; explorerName: string }> = {
  8453: {
    name: 'Base',
    explorerUrl: 'https://basescan.org/tx/',
    explorerName: 'BaseScan',
  },
  56: {
    name: 'BNB Chain',
    explorerUrl: 'https://bscscan.com/tx/',
    explorerName: 'BscScan',
  },
};

const getChainInfo = (chainId: number) => {
  return CHAIN_CONFIG[chainId] || CHAIN_CONFIG[8453]; // Default to Base
};

export default function PostInfoPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { walletAddress } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  
  // Fetch NFT info with React Query
  const { 
    data: nftInfo, 
    isLoading, 
    error 
  } = useQuery({
    queryKey: ['nft-info', postId],
    queryFn: () => getNFTInfo(postId!),
    enabled: !!postId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes in cache
  });
  
  // Fetch token holders with React Query (cached for 5 minutes)
  const { 
    data: holders = [], 
    isLoading: isLoadingHolders 
  } = useQuery({
    queryKey: ['token-holders', nftInfo?.tokenId, nftInfo?.chainId],
    queryFn: () => getTokenHolders(nftInfo!.tokenId, nftInfo!.chainId),
    enabled: !!nftInfo?.tokenId && !!nftInfo?.chainId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes in cache
  });
  
  // Check if current user is the owner/minter
  const isOwner = walletAddress && nftInfo?.minter?.toLowerCase() === walletAddress.toLowerCase();
  const [showEditModal, setShowEditModal] = useState(false);
  
  // PPV status and purchase count
  const isPPV = nftInfo?.is_ppv || nftInfo?.streamInfo?.isPayPerView || false;
  const ppvPrice = nftInfo?.ppv_price || nftInfo?.streamInfo?.payPerViewAmount;
  const ppvCurrency = nftInfo?.ppv_currency || 'DHB';
  const { data: ppvPurchaseCount } = usePPVPurchaseCount(isPPV ? postId : undefined);

  // Current visibility state (default to 'public' if not set)
  const currentVisibility: TokenVisibility = (nftInfo as any)?.visibility || 'public';
  
  // Visibility mutation
  const visibilityMutation = useMutation({
    mutationFn: (newVisibility: TokenVisibility) => 
      updateTokenVisibility(nftInfo!.tokenId, newVisibility),
    onSuccess: (_, newVisibility) => {
      toast.success(`Visibility updated to ${newVisibility}`);
      // Invalidate the NFT info query to refetch
      queryClient.invalidateQueries({ queryKey: ['nft-info', postId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update visibility');
    },
  });
  
  const handleVisibilityChange = (newVisibility: TokenVisibility) => {
    if (!nftInfo?.tokenId) return;
    visibilityMutation.mutate(newVisibility);
  };
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };
  
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });
  };
  
  const truncateAddress = (address: string) => {
    if (!address) return 'Unknown';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };
  
  // Show processing state for posts that the API returns with signed/pending status
  const isProcessing = nftInfo?.status === 'signed' || nftInfo?.status === 'pending';
  
  if (isProcessing) {
    return (
      <div className="min-h-screen bg-black">
        <div className="sticky top-0 z-50 bg-black border-b border-white/10">
          <div className="flex items-center gap-4 p-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 text-white hover:text-white/70 transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold text-white">{t('postInfo.title')}</h1>
          </div>
        </div>
        
        <div className="flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto mt-16">
          {/* Animated processing indicator */}
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
            <div className="absolute inset-0 rounded-xl bg-primary/10 animate-ping" />
          </div>
          
          <h2 className="text-xl font-semibold text-white mb-3">
            {t('postInfo.uploadProcessing')}
          </h2>
          
          <p className="text-white/60 text-sm leading-relaxed mb-4">
            {t('postInfo.processingDesc')}
          </p>
          
          <p className="text-white/40 text-xs leading-relaxed">
            {t('postInfo.processingNote')}
          </p>
          
          <button
            onClick={() => navigate(-1)}
            className="mt-8 px-6 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl text-sm font-medium transition-colors"
          >
            {t('postInfo.goBack')}
          </button>
        </div>
      </div>
    );
  }
  
  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }
  
  // Error state
  if (error || !nftInfo) {
    return (
      <div className="min-h-screen bg-black">
        <div className="sticky top-0 z-50 bg-black border-b border-white/10">
          <div className="flex items-center gap-4 p-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 text-white hover:text-white/70 transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold text-white">Post Info</h1>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <p className="text-white/60 mb-4">{error?.message || 'Post not found'}</p>
          <button
            onClick={() => navigate(-1)}
            className="text-primary hover:underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }
  
  // Get chain info
  const chainId = nftInfo.chainId || 8453;
  const chainInfo = getChainInfo(chainId);
  
  // Get stats with fallbacks
  const likes = nftInfo.totalVotes?.for ?? nftInfo.like_count ?? 0;
  const dislikes = nftInfo.totalVotes?.against ?? nftInfo.dislike_count ?? 0;
  const views = nftInfo.views ?? nftInfo.view_count ?? 0;
  const comments = nftInfo.commentCount ?? nftInfo.comment_count ?? 0;
  const totalTips = nftInfo.minterUser?.receivedTips ?? 0;
  const likeRatio = likes + dislikes > 0 ? Math.round((likes / (likes + dislikes)) * 100) : 100;
  
  // Get creator info
  const creatorName = nftInfo.minterDisplayName || nftInfo.mintername || truncateAddress(nftInfo.minter);
  const creatorAvatar = buildAvatarUrl(nftInfo.minter, nftInfo.minterAvatarUrl);

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-black border-b border-white/10">
        <div className="flex items-center gap-4 p-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 text-white hover:text-white/70 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-white">Post Info</h1>
          {isOwner && (
            <button
              onClick={() => setShowEditModal(true)}
              className="ml-auto p-2 text-white/60 hover:text-white transition-colors"
              aria-label="Edit post"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          <span className={`${isOwner ? '' : 'ml-auto '}px-2.5 py-1 text-xs font-medium bg-white/10 rounded-lg text-white/80`}>
            {chainInfo.name}
          </span>
        </div>
      </div>
      
      <div className="h-[calc(100vh-65px)] overflow-y-auto scrollbar-none">
        <div className="p-4 space-y-6">
          {/* Transaction & Mint Info */}
          <section className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium text-white/60 mb-2">Token ID</h2>
                <p className="text-xl font-bold text-white">#{nftInfo.tokenId}</p>
              </div>
              {nftInfo.status && (
                <span className={`px-2.5 py-1 text-xs font-medium rounded-lg ${
                  nftInfo.status === 'minted' 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {nftInfo.status}
                </span>
              )}
            </div>
            
            <div className="border-t border-white/10 pt-4">
              <h2 className="text-sm font-medium text-white/60 mb-2">Minted On</h2>
              <div className="space-y-1">
                <p className="text-white font-medium">{formatDate(nftInfo.createdAt)}</p>
                <p className="text-sm text-white/60">{formatTime(nftInfo.createdAt)}</p>
              </div>
            </div>
            
            {nftInfo.mintTxHash && (
              <div className="border-t border-white/10 pt-4">
                <h2 className="text-sm font-medium text-white/60 mb-2">Transaction Hash</h2>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm text-white bg-white/5 p-3 rounded-lg font-mono break-all">
                    {nftInfo.mintTxHash}
                  </code>
                  <button
                    onClick={() => copyToClipboard(nftInfo.mintTxHash!, 'Transaction hash')}
                    className="p-2 text-white/60 hover:text-white transition-colors shrink-0"
                    aria-label="Copy transaction hash"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <a
                    href={`${chainInfo.explorerUrl}${nftInfo.mintTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-white/60 hover:text-white transition-colors shrink-0"
                    aria-label={`View on ${chainInfo.explorerName}`}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
                <p className="text-xs text-white/40 mt-2">
                  View on {chainInfo.explorerName}
                </p>
              </div>
            )}
          </section>

          {/* Live Stream Info - shown for live content */}
          {((nftInfo as any).postType === 'live' || (nftInfo as any).isLive !== undefined) && (
            <section className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h2 className="text-sm font-medium text-white/60 mb-3">Stream Info</h2>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${(nftInfo as any).isLive ? 'bg-red-500/20' : 'bg-white/5'}`}>
                  <Radio className={`w-5 h-5 ${(nftInfo as any).isLive ? 'text-red-400' : 'text-zinc-500'}`} />
                </div>
                <div>
                  <p className="text-white font-medium">
                    {(nftInfo as any).isLive ? 'Currently Live' : 'Stream Offline'}
                  </p>
                  <p className="text-xs text-white/60">
                    {(nftInfo as any).totalViews ?? nftInfo.views ?? 0} total views
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Creator Info */}
          <section className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h2 className="text-sm font-medium text-white/60 mb-3">Creator</h2>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
                {creatorAvatar && creatorAvatar !== '/placeholder.svg' ? (
                  <img 
                    src={creatorAvatar} 
                    alt={creatorName}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <span className="text-white font-medium">{(creatorName || '?').charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{creatorName}</p>
                <p className="text-sm font-mono text-white/60 truncate">
                  {truncateAddress(nftInfo.minter)}
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(nftInfo.minter, 'Creator wallet')}
                className="p-2 text-white/60 hover:text-white transition-colors shrink-0"
                aria-label="Copy creator wallet"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </section>

          {/* Visibility Settings - Only shown to owner */}
          {isOwner && (
            <section className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h2 className="text-sm font-medium text-white/60 mb-3">Visibility</h2>
              <Select 
                value={currentVisibility} 
                onValueChange={(value: TokenVisibility) => handleVisibilityChange(value)}
                disabled={visibilityMutation.isPending}
              >
                <SelectTrigger className="w-full bg-white/5 border-white/10 text-white">
                  <SelectValue>
                    <div className="flex items-center gap-2">
                      {VISIBILITY_OPTIONS.find(opt => opt.value === currentVisibility)?.icon}
                      <span>{VISIBILITY_OPTIONS.find(opt => opt.value === currentVisibility)?.label}</span>
                      {visibilityMutation.isPending && <Loader2 className="w-4 h-4 animate-spin ml-auto" />}
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10">
                  {VISIBILITY_OPTIONS.map((option) => (
                    <SelectItem 
                      key={option.value} 
                      value={option.value}
                      className="text-white hover:bg-white/10 focus:bg-white/10"
                    >
                      <div className="flex items-center gap-3">
                        {option.icon}
                        <div>
                          <p className="font-medium">{option.label}</p>
                          <p className="text-xs text-white/60">{option.description}</p>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>
          )}

          {/* Listings & Offers Tabs */}
          <FractionMarketplace 
            holders={holders} 
            nftInfo={nftInfo} 
            truncateAddr={truncateAddr}
          />

          {/* Fraction Ownership */}
          <section className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-white/60">Fraction Ownership</h2>
              <span className="text-xs font-mono text-white/40">{TOTAL_FRACTIONS} total</span>
            </div>
            
            {/* Distribution Progress */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-white/60">Distribution</span>
                <span className="text-xs font-medium text-white">
                  {isLoadingHolders 
                    ? 'Loading...'
                    : holders.length > 0 
                      ? `${holders.length} owner${holders.length > 1 ? 's' : ''}`
                      : '1 owner'
                  }
                </span>
              </div>
              <Progress 
                value={holders.length > 0 ? 100 : 0} 
                className="h-2 bg-white/10"
              />
            </div>
            
            {/* Owners List */}
            <div className="space-y-3">
              {isLoadingHolders ? (
                // Loading skeletons
                <>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="w-10 h-10 rounded-md" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </div>
                  ))}
                </>
              ) : holders.length > 0 ? (
                // Real holders from on-chain data
                holders.map((holder, index) => {
                  const rank = index + 1;
                  return (
                    <div key={holder.address} className="flex items-center gap-3">
                      {rank <= 3 ? (
                        <div className="medal-shine-container w-10 h-10 shrink-0">
                          <img 
                            src={rank === 1 ? medal1 : rank === 2 ? medal2 : medal3} 
                            alt={`Rank ${rank}`} 
                            className="w-10 h-10 object-contain"
                          />
                          <div 
                            className="medal-shine-overlay"
                            style={{ '--medal-mask': `url(${rank === 1 ? medal1 : rank === 2 ? medal2 : medal3})` } as React.CSSProperties}
                          />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-zinc-700 flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-white">{rank}</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate font-mono text-sm">
                          {truncateAddr(holder.address)}
                        </p>
                        <p className="text-xs text-white/60">
                          {holder.balance}/{TOTAL_FRACTIONS} fractions ({holder.percentage}%)
                        </p>
                      </div>
                      <button
                        onClick={() => copyToClipboard(holder.address, 'Wallet address')}
                        className="p-2 text-white/60 hover:text-white transition-colors shrink-0"
                        aria-label="Copy wallet address"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })
              ) : (
                // Fallback: Show creator as 100% owner
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5 text-white/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate font-mono text-sm">
                      {truncateAddr(nftInfo.minter)}
                    </p>
                    <p className="text-xs text-white/60">
                      {TOTAL_FRACTIONS}/{TOTAL_FRACTIONS} fractions (100%)
                    </p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(nftInfo.minter, 'Owner wallet')}
                    className="p-2 text-white/60 hover:text-white transition-colors shrink-0"
                    aria-label="Copy owner wallet"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Engagement Stats */}
          <section className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h2 className="text-sm font-medium text-white/60 mb-3">Engagement</h2>
            <div className="grid grid-cols-2 gap-3">
              {/* Like/Dislike Ratio */}
              <div className="col-span-2 bg-white/5 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-white/60">Like Ratio</span>
                  <span className="text-lg font-bold text-white">{likeRatio}%</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-white rounded-full"
                    style={{ width: `${likeRatio}%` }}
                  />
                </div>
              </div>
              
              {/* Likes */}
              <div className="bg-white/5 rounded-lg p-3 flex items-center gap-3">
                <ThumbsUp className="w-5 h-5 text-white" />
                <div>
                  <p className="text-lg font-bold text-white">{likes.toLocaleString()}</p>
                  <p className="text-xs text-white/60">Likes</p>
                </div>
              </div>
              
              {/* Dislikes */}
              <div className="bg-white/5 rounded-lg p-3 flex items-center gap-3">
                <ThumbsDown className="w-5 h-5 text-white" />
                <div>
                  <p className="text-lg font-bold text-white">{dislikes.toLocaleString()}</p>
                  <p className="text-xs text-white/60">Dislikes</p>
                </div>
              </div>
              
              {/* Views */}
              <div className="bg-white/5 rounded-lg p-3 flex items-center gap-3">
                <Eye className="w-5 h-5 text-white" />
                <div>
                  <p className="text-lg font-bold text-white">{views.toLocaleString()}</p>
                  <p className="text-xs text-white/60">Views</p>
                </div>
              </div>
              
              {/* Comments */}
              <div className="bg-white/5 rounded-lg p-3 flex items-center gap-3">
                <MessageCircle className="w-5 h-5 text-white" />
                <div>
                  <p className="text-lg font-bold text-white">{comments.toLocaleString()}</p>
                  <p className="text-xs text-white/60">Comments</p>
                </div>
              </div>

              {/* Total Tips */}
              <div className="col-span-2 bg-white/5 rounded-lg p-3 flex items-center gap-3">
                <Coins className="w-5 h-5 text-white" />
                <div>
                  <p className="text-lg font-bold text-white">{totalTips.toLocaleString()} DHB</p>
                  <p className="text-xs text-white/60">Total Tips Received (Creator)</p>
                </div>
              </div>
            </div>
          </section>

          {/* PPV Sales Info - shown for PPV content */}
          {isPPV && (
            <section className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h2 className="text-sm font-medium text-white/60 mb-3">Pay-Per-View</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 rounded-lg p-3 flex items-center gap-3">
                  <Ticket className="w-5 h-5 text-white" />
                  <div>
                    <p className="text-lg font-bold text-white">{ppvPurchaseCount ?? 0}</p>
                    <p className="text-xs text-white/60">PPV Sales</p>
                  </div>
                </div>
                {ppvPrice && (
                  <div className="bg-white/5 rounded-lg p-3 flex items-center gap-3">
                    <Lock className="w-5 h-5 text-white" />
                    <div>
                      <p className="text-lg font-bold text-white">{ppvPrice} {ppvCurrency}</p>
                      <p className="text-xs text-white/60">Price</p>
                    </div>
                  </div>
                )}
                {ppvPrice && (
                  <div className="col-span-2 bg-primary/10 rounded-lg p-3 flex items-center gap-3 border border-primary/20">
                    <img src={dehubCoin} alt="DHB" className="w-6 h-6" />
                    <div>
                      <p className="text-lg font-bold text-white">
                        {((ppvPurchaseCount ?? 0) * Number(ppvPrice)).toLocaleString()} {ppvCurrency}
                      </p>
                      <p className="text-xs text-white/60">Total Revenue</p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {(nftInfo.name || nftInfo.description) && (
            <section className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h2 className="text-sm font-medium text-white/60 mb-3">Content</h2>
              {nftInfo.name && (
                <p className="text-white font-medium mb-2">{nftInfo.name}</p>
              )}
              {nftInfo.description && (
                <p className="text-sm text-white/70">{nftInfo.description}</p>
              )}
            </section>
          )}
          
        </div>
      </div>

      {/* Edit Post Modal */}
      {isOwner && nftInfo && (
        <EditPostModal
          open={showEditModal}
          onOpenChange={setShowEditModal}
          tokenId={nftInfo.tokenId}
          currentTitle={nftInfo.title || nftInfo.name || ''}
          currentDescription={nftInfo.description || ''}
          currentCategories={Array.isArray(nftInfo.category) ? nftInfo.category : nftInfo.category ? [nftInfo.category] : []}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['nft-info', postId] })}
        />
      )}
    </div>
  );
}
