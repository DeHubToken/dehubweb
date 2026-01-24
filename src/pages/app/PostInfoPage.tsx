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

import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowLeft, Copy, ExternalLink, ThumbsUp, ThumbsDown, Eye, MessageCircle, User, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getNFTInfo, DeHubNFT, getMediaUrl } from '@/lib/api/dehub';

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
  
  const [nftInfo, setNftInfo] = useState<DeHubNFT | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (postId) {
      setIsLoading(true);
      setError(null);
      getNFTInfo(postId)
        .then(setNftInfo)
        .catch(err => setError(err.message || 'Failed to load post info'))
        .finally(() => setIsLoading(false));
    }
  }, [postId]);
  
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };
  
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
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
        <div className="sticky top-0 z-10 bg-black/80 backdrop-blur-md border-b border-white/10">
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
          <p className="text-white/60 mb-4">{error || 'Post not found'}</p>
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
  const likeRatio = likes + dislikes > 0 ? Math.round((likes / (likes + dislikes)) * 100) : 100;
  
  // Get creator info
  const creatorName = nftInfo.minterDisplayName || nftInfo.mintername || truncateAddress(nftInfo.minter);
  const creatorAvatar = getMediaUrl(nftInfo.minterAvatarUrl);

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black/80 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center gap-4 p-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 text-white hover:text-white/70 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-white">Post Info</h1>
          <span className="ml-auto px-2.5 py-1 text-xs font-medium bg-white/10 rounded-full text-white/80">
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
                <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
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

          {/* Creator Info */}
          <section className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h2 className="text-sm font-medium text-white/60 mb-3">Creator</h2>
            <div className="flex items-center gap-3">
              {creatorAvatar ? (
                <img 
                  src={creatorAvatar} 
                  alt={creatorName}
                  className="w-12 h-12 rounded-full object-cover bg-white/10"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="w-6 h-6 text-white/60" />
                </div>
              )}
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
            </div>
          </section>

          {/* Content Info */}
          {(nftInfo.name || nftInfo.description) && (
            <section className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h2 className="text-sm font-medium text-white/60 mb-3">Content</h2>
              {nftInfo.name && (
                <p className="text-white font-medium mb-2">{nftInfo.name}</p>
              )}
              {nftInfo.description && (
                <p className="text-sm text-white/70">{nftInfo.description}</p>
              )}
              {nftInfo.category && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(Array.isArray(nftInfo.category) ? nftInfo.category : [nftInfo.category]).map((cat, i) => (
                    <span key={i} className="px-2 py-1 text-xs bg-white/10 rounded-full text-white/70">
                      {cat}
                    </span>
                  ))}
                </div>
              )}
              {nftInfo.tags && nftInfo.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {nftInfo.tags.map((tag, i) => (
                    <span key={i} className="text-xs text-primary">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}
          
          {/* NFT Status Banner */}
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 text-center">
            <p className="text-sm text-primary">
              This post is minted as an NFT on {chainInfo.name}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
