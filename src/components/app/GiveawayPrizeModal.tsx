import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Trophy, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getGiveawayPrizeFor } from '@/lib/worldCupGiveaway';
import dehubCoin from '@/assets/dehub-coin.png';

const seenKey = (address: string) => `wc-giveaway-seen:${address.toLowerCase()}`;

/**
 * One-time congratulations popup for Twitter World Cup giveaway winners.
 * Fires on the winner's next login and never again (per-address localStorage
 * flag). Self-gates: renders nothing for non-winners or logged-out visitors.
 * The CTA opens the wallet, where the prize shows as a pending credit.
 */
export function GiveawayPrizeModal() {
  const { isAuthenticated, walletAddress } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const prize = getGiveawayPrizeFor(walletAddress);

  useEffect(() => {
    if (!isAuthenticated || !walletAddress || !getGiveawayPrizeFor(walletAddress)) {
      setOpen(false);
      return;
    }
    try {
      if (!localStorage.getItem(seenKey(walletAddress))) {
        setOpen(true);
      }
    } catch {
      // localStorage unavailable (private mode) — show once for this session.
      setOpen(true);
    }
  }, [isAuthenticated, walletAddress]);

  const markSeen = () => {
    if (walletAddress) {
      try {
        localStorage.setItem(seenKey(walletAddress), '1');
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
  };

  const handleView = () => {
    markSeen();
    navigate('/app/wallet', { state: { from: 'command-centre' } });
  };

  if (!open || !prize) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={markSeen} />

      {/* Card — liquid glass */}
      <div
        className="relative mx-4 max-w-sm w-full rounded-3xl p-7 border border-white/10 shadow-2xl overflow-hidden"
        style={{
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        }}
      >
        {/* Celebratory glow */}
        <div
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full blur-3xl opacity-40"
          style={{ background: 'radial-gradient(circle, rgba(250,204,21,0.55), transparent 70%)' }}
        />

        <button
          onClick={markSeen}
          className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors z-10"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative text-center">
          {/* Coin with trophy badge */}
          <div className="relative inline-flex items-center justify-center mb-4">
            <div className="absolute inset-0 rounded-full bg-amber-400/20 blur-xl" />
            <img src={dehubCoin} alt="DHB" className="relative w-20 h-20 drop-shadow-[0_0_16px_rgba(250,204,21,0.6)]" />
            <span className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center shadow-lg">
              <Trophy className="w-4 h-4 text-black" />
            </span>
          </div>

          <p className="text-amber-400 text-xs font-semibold tracking-widest uppercase mb-1">
            World Cup Giveaway
          </p>
          <h2 className="text-white text-2xl font-bold mb-3">Congratulations! 🏆</h2>

          <div className="my-4 flex items-center justify-center gap-1.5">
            <span className="text-5xl font-extrabold text-white">$200</span>
            <span className="text-base font-bold text-amber-400 self-end mb-2">prize</span>
          </div>

          <p className="text-white/75 text-sm leading-relaxed mb-6">
            You won a <span className="text-white font-medium">$200 prize</span> from our World Cup giveaway on Twitter. Your tokens have been credited to your account, set for transfer when the contract is live.
          </p>

          <button
            onClick={handleView}
            className="w-full py-3 rounded-2xl bg-white text-black font-semibold flex items-center justify-center gap-2 hover:bg-white/90 transition-colors"
          >
            View in wallet
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={markSeen}
            className="block w-full py-3 mt-1 text-sm text-white/40 hover:text-white transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
