import { useTranslation as _useCopy } from 'react-i18next';
import { Ticket } from 'lucide-react';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';

export function PPVFeed() {
  const { t: _copy } = _useCopy();
  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ThemedIcon icon="lock" alt="" className="w-16 h-16 object-contain mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">{_copy("copy.48e072480fc5", { defaultValue: "Pay-Per-View Content" })}</h3>
        <p className="text-zinc-400 max-w-md">{_copy("copy.f90c97109509", { defaultValue: "Exclusive premium content from your favorite creators. Unlock to view." })}</p>
      </div>
      
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} data-page-bento className="bg-zinc-900 rounded-2xl overflow-hidden group cursor-pointer">
            <div className="aspect-video bg-zinc-800 relative">
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <div className="text-center">
                  <Ticket className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <span className="text-white font-semibold">$4.99</span>
                </div>
              </div>
            </div>
            <div className="p-3">
              <h4 className="text-white font-medium truncate">{_copy("copy.aa5e4b4c70f5", { defaultValue: "Premium Content #" })}{i}</h4>
              <p className="text-zinc-400 text-sm">{_copy("copy.877db1b57c60", { defaultValue: "@creator" })}{i}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
