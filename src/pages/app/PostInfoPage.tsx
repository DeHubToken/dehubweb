/**
 * Post Info Page
 * ==============
 * Displays NFT-related information for a post including:
 * - Transaction hash of the mint
 * - Exact timestamp
 * - List of wallet owners (fractional NFT holders)
 */

import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';

// Mock data - will be replaced with real blockchain data in production
const generateMockPostInfo = (postId: string) => {
  // Generate deterministic mock data based on postId
  const hash = postId.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
  const absHash = Math.abs(hash);
  
  const txHash = `0x${absHash.toString(16).padStart(64, 'a').slice(0, 64)}`;
  
  // Generate a timestamp within the last 30 days
  const timestamp = new Date(Date.now() - (absHash % 30) * 24 * 60 * 60 * 1000);
  
  // Generate mock wallet addresses
  const ownerCount = (absHash % 5) + 1;
  const owners = Array.from({ length: ownerCount }, (_, i) => ({
    address: `0x${((absHash + i * 12345) >>> 0).toString(16).padStart(40, 'f').slice(0, 40)}`,
    percentage: i === 0 ? 100 - (ownerCount - 1) * 10 : 10,
  }));
  
  return {
    txHash,
    timestamp,
    owners,
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-4 p-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 text-foreground hover:text-muted-foreground transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-foreground">Post Info</h1>
        </div>
      </div>
      
      <ScrollArea className="h-[calc(100vh-65px)]">
        <div className="p-4 space-y-6">
          {/* Transaction Hash */}
          <section className="bg-card rounded-xl p-4 border border-border">
            <h2 className="text-sm font-medium text-muted-foreground mb-2">Transaction Hash</h2>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm text-foreground bg-muted/50 p-3 rounded-lg font-mono break-all">
                {postInfo.txHash}
              </code>
              <button
                onClick={() => copyToClipboard(postInfo.txHash, 'Transaction hash')}
                className="p-2 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                aria-label="Copy transaction hash"
              >
                <Copy className="w-4 h-4" />
              </button>
              <a
                href={`https://etherscan.io/tx/${postInfo.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                aria-label="View on Etherscan"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </section>
          
          {/* Timestamp */}
          <section className="bg-card rounded-xl p-4 border border-border">
            <h2 className="text-sm font-medium text-muted-foreground mb-2">Minted On</h2>
            <div className="space-y-1">
              <p className="text-foreground font-medium">{formatDate(postInfo.timestamp)}</p>
              <p className="text-sm text-muted-foreground">{formatTime(postInfo.timestamp)}</p>
            </div>
          </section>
          
          {/* Owners */}
          <section className="bg-card rounded-xl p-4 border border-border">
            <h2 className="text-sm font-medium text-muted-foreground mb-3">
              Owners ({postInfo.owners.length})
            </h2>
            <div className="space-y-3">
              {postInfo.owners.map((owner, index) => (
                <div 
                  key={owner.address}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-medium">
                      {index + 1}
                    </div>
                    <div>
                      <p className="text-sm font-mono text-foreground">
                        {truncateAddress(owner.address)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {owner.percentage}% ownership
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(owner.address, 'Wallet address')}
                    className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Copy wallet address"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
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
