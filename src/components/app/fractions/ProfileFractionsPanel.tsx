/**
 * Profile Fractions Panel
 * =======================
 * The Fractions tab on a profile.
 *
 * The tab has always existed and has always rendered a hardcoded "Fraction
 * holdings will appear here" — a promise with nothing behind it. It now shows
 * the real positions, read off the collection contract, and on your own
 * profile each one is a shortcut into selling it.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Tag, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cdnImage } from '@/lib/media-url';
import { useAuth } from '@/contexts/AuthContext';
import { useFractionPortfolio, type PortfolioPosition } from '@/hooks/use-fraction-portfolio';
import { TOTAL_FRACTIONS } from '@/hooks/use-fraction-marketplace';
import { SellFractionsDrawer } from './SellFractionsDrawer';
import fractions3dIcon from '@/assets/icons/fractions-3d-icon.png';

interface ProfileFractionsPanelProps {
  profileAddress: string | undefined;
}

export function ProfileFractionsPanel({ profileAddress }: ProfileFractionsPanelProps) {
  const { walletAddress } = useAuth();
  const navigate = useNavigate();
  const [selling, setSelling] = useState<PortfolioPosition | null>(null);

  const { data: positions = [], isLoading } = useFractionPortfolio(profileAddress);
  const isOwnProfile =
    !!profileAddress && profileAddress.toLowerCase() === walletAddress?.toLowerCase();

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="text-center py-16 px-4">
        <img src={fractions3dIcon} alt="Fractions" className="w-16 h-16 mx-auto mb-3 opacity-60" />
        <p className="text-white/60 text-sm font-medium">No fractions yet</p>
        <p className="text-white/35 text-xs mt-1 max-w-xs mx-auto">
          Every upload is minted as 1000 fractions. {isOwnProfile ? 'Post something, or buy' : 'This profile holds none of'}{' '}
          {isOwnProfile ? 'into a post you believe in.' : 'any post right now.'}
        </p>
        {isOwnProfile && (
          <Button
            onClick={() => navigate('/app/fractions')}
            className="mt-4 bg-white/10 hover:bg-white/20 text-white border border-white/20"
          >
            Browse the market
          </Button>
        )}
      </div>
    );
  }

  const totalHeld = positions.reduce((sum, p) => sum + p.balance, 0);

  return (
    <div className="p-3 space-y-3">
      {selling && (
        <SellFractionsDrawer
          tokenId={selling.tokenId}
          chainId={selling.chainId}
          post={{
            title: selling.title || undefined,
            imageUrl: selling.imageUrl || undefined,
            type: selling.postType || undefined,
          }}
          open
          onOpenChange={(v) => { if (!v) setSelling(null); }}
        />
      )}

      <p className="text-xs text-white/40">
        {totalHeld.toLocaleString()} fraction{totalHeld === 1 ? '' : 's'} across {positions.length}{' '}
        post{positions.length === 1 ? '' : 's'}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {positions.map((position) => {
          const thumb = position.imageUrl ? cdnImage(position.imageUrl, { width: 300 }) : '';
          return (
            <div
              key={`${position.chainId}-${position.tokenId}`}
              className="rounded-xl border border-white/10 bg-white/5 overflow-hidden"
            >
              <button
                onClick={() => navigate(`/app/post/${position.tokenId}/info`)}
                className="w-full text-left"
              >
                <div className="aspect-square bg-white/5 relative overflow-hidden">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={position.title || `Post #${position.tokenId}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20">
                      <ImageIcon className="w-7 h-7" />
                    </div>
                  )}
                  <span className="absolute top-2 left-2 text-[10px] font-semibold bg-black/70 text-white/90 px-1.5 py-0.5 rounded backdrop-blur-sm">
                    {position.balance} / {TOTAL_FRACTIONS}
                  </span>
                </div>
                <div className="p-2.5 pb-1.5">
                  <h3 className="text-xs font-medium text-white truncate">
                    {position.title || `Post #${position.tokenId}`}
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    {position.percentage.toFixed(1)}% of the post
                  </p>
                </div>
              </button>
              {isOwnProfile && (
                <div className="px-2.5 pb-2.5">
                  <Button
                    size="sm"
                    onClick={() => setSelling(position)}
                    className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20 text-[11px] h-7"
                  >
                    <Tag className="w-3 h-3 mr-1" />
                    Sell
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
