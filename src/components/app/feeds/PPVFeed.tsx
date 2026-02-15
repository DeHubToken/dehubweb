import ppvIcon from '@/assets/icons/ppv-icon.png';

export function PPVFeed() {
  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4">
          <img src={ppvIcon} alt="PPV" className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Pay-Per-View Content</h3>
        <p className="text-zinc-400 max-w-md">
          Exclusive premium content from your favorite creators. Unlock to view.
        </p>
      </div>
      
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-zinc-900 rounded-2xl overflow-hidden group cursor-pointer">
            <div className="aspect-video bg-zinc-800 relative">
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <div className="text-center">
                  <img src={ppvIcon} alt="PPV" className="w-8 h-8 mx-auto mb-2" />
                  <span className="text-white font-semibold">$4.99</span>
                </div>
              </div>
            </div>
            <div className="p-3">
              <h4 className="text-white font-medium truncate">Premium Content #{i}</h4>
              <p className="text-zinc-400 text-sm">@creator{i}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
