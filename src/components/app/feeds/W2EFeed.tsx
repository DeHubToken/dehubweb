import { Gift, Eye, MessageCircle, Coins } from 'lucide-react';

export function W2EFeed() {
  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-xl bg-white/10 flex items-center justify-center mb-4">
          <Gift className="w-8 h-8 text-white" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Bounty</h3>
        <p className="text-zinc-400 max-w-md">
          Earn rewards by watching content and engaging with creators.
        </p>
      </div>
      
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-zinc-900 rounded-2xl overflow-hidden group cursor-pointer hover:ring-2 hover:ring-white/30 transition-all">
            <div className="aspect-video bg-zinc-800 relative">
              <div className="absolute top-2 right-2 bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)] text-xs font-bold px-2 py-1 rounded-xl flex items-center gap-1">
                <Coins className="w-3 h-3" />
                +{(i * 0.5).toFixed(2)} DHB
              </div>
              <div className="absolute bottom-2 left-2 flex gap-2">
                <span className="bg-black/70 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                  <Eye className="w-3 h-3" /> {i * 100}
                </span>
                <span className="bg-black/70 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                  <MessageCircle className="w-3 h-3" /> {i * 10}
                </span>
              </div>
            </div>
            <div className="p-3">
              <h4 className="text-white font-medium truncate">Earn by Watching #{i}</h4>
              <p className="text-zinc-400 text-sm">Watch to earn rewards</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
