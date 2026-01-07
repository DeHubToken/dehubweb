/**
 * Post Info Page
 * ==============
 * Displays NFT-related information for a post including:
 * - Transaction hash of the mint
 * - Exact timestamp
 * - List of wallet owners (fractional NFT holders)
 */

import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, ExternalLink, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';

interface Owner {
  address: string;
  percentage: number;
}

interface Listing {
  address: string;
  percentage: number;
  price: number;
  currency: string;
}

// Mock data - will be replaced with real blockchain data in production
const generateMockPostInfo = (postId: string) => {
  // Generate deterministic mock data based on postId
  const hash = postId.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
  const absHash = Math.abs(hash);
  
  const txHash = `0x${absHash.toString(16).padStart(64, 'a').slice(0, 64)}`;
  
  // Generate a timestamp within the last 30 days
  const timestamp = new Date(Date.now() - (absHash % 30) * 24 * 60 * 60 * 1000);
  
  // Generate mock owners and listings that total 100%
  const ownerCount = (absHash % 3) + 2; // 2-4 owners
  const listingCount = (absHash % 3); // 0-2 listings
  const totalHolders = ownerCount + listingCount;
  
  // Distribute 100% among all holders
  const basePercentage = Math.floor(100 / totalHolders);
  const remainder = 100 - (basePercentage * totalHolders);
  
  const owners: Owner[] = Array.from({ length: ownerCount }, (_, i) => ({
    address: `0x${((absHash + i * 12345) >>> 0).toString(16).padStart(40, 'f').slice(0, 40)}`,
    percentage: basePercentage + (i === 0 ? remainder : 0), // Give remainder to first owner
  }));
  
  // Generate mock listings (fractions for sale)
  const listings: Listing[] = Array.from({ length: listingCount }, (_, i) => ({
    address: `0x${((absHash + (i + 10) * 54321) >>> 0).toString(16).padStart(40, 'f').slice(0, 40)}`,
    percentage: basePercentage,
    price: ((absHash % 100) + 10 + i * 25) / 10,
    currency: 'ETH',
  }));
  
  return {
    txHash,
    timestamp,
    owners,
    listings,
  };
};

export default function PostInfoPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  
  const postInfo = generateMockPostInfo(postId || 'default');
  
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };
  
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });
  };
  
  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

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
        </div>
      </div>
      
      <ScrollArea className="h-[calc(100vh-65px)]">
        <div className="p-4 space-y-6">
          {/* Transaction Hash */}
          <section className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h2 className="text-sm font-medium text-white/60 mb-2">Transaction Hash</h2>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm text-white bg-white/5 p-3 rounded-lg font-mono break-all">
                {postInfo.txHash}
              </code>
              <button
                onClick={() => copyToClipboard(postInfo.txHash, 'Transaction hash')}
                className="p-2 text-white/60 hover:text-white transition-colors shrink-0"
                aria-label="Copy transaction hash"
              >
                <Copy className="w-4 h-4" />
              </button>
              <a
                href={`https://etherscan.io/tx/${postInfo.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-white/60 hover:text-white transition-colors shrink-0"
                aria-label="View on Etherscan"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </section>
          
          {/* Timestamp */}
          <section className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h2 className="text-sm font-medium text-white/60 mb-2">Minted On</h2>
            <div className="space-y-1">
              <p className="text-white font-medium">{formatDate(postInfo.timestamp)}</p>
              <p className="text-sm text-white/60">{formatTime(postInfo.timestamp)}</p>
            </div>
          </section>
          
          {/* Owners */}
          <section className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h2 className="text-sm font-medium text-white/60 mb-3">
              Owners ({postInfo.owners.length})
            </h2>
            <div className="space-y-3">
              {postInfo.owners.map((owner, index) => (
                <div 
                  key={owner.address}
                  className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-medium">
                      {index + 1}
                    </div>
                    <div>
                      <p className="text-sm font-mono text-white">
                        {truncateAddress(owner.address)}
                      </p>
                      <p className="text-xs text-white/60">
                        {owner.percentage}% ownership
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(owner.address, 'Wallet address')}
                    className="p-2 text-white/60 hover:text-white transition-colors"
                    aria-label="Copy wallet address"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
          
          {/* Listings */}
          <section className="bg-white/5 rounded-xl p-4 border border-white/10">
            <h2 className="text-sm font-medium text-white/60 mb-3">
              Listings ({postInfo.listings.length})
            </h2>
            {postInfo.listings.length > 0 ? (
              <div className="space-y-3">
                {postInfo.listings.map((listing, index) => (
                  <div 
                    key={listing.address}
                    className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-xs font-medium">
                        <ShoppingCart className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-mono text-white">
                          {truncateAddress(listing.address)}
                        </p>
                        <p className="text-xs text-white/60">
                          {listing.percentage}% • {listing.price} {listing.currency}
                        </p>
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      className="bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30"
                      onClick={() => toast.success('Purchase flow coming soon!')}
                    >
                      Buy
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-white/40 text-center py-4">
                No fractions currently listed for sale
              </p>
            )}
          </section>
          
          {/* NFT Status Banner */}
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 text-center">
            <p className="text-sm text-primary">
              This post has been minted as a fractional NFT on the blockchain
            </p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
