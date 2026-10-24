import { translateCopy as _translateCopy } from '@/i18n/copy';
import { useTranslation as _useCopy } from 'react-i18next';
import { MobileStatusBar } from '../MobileStatusBar';
import { MobileTopBar } from '../MobileTopBar';
import { MobileBottomBar } from '../MobileBottomBar';
import { Tv } from "lucide-react";
import Play from "@/components/ui/cut-icons/play";
import Search from "@/components/ui/cut-icons/search";
import ChevronRight from "@/components/ui/cut-icons/next";


const MOCK_CHANNELS = [
  { name: 'CryptoTV Live', get category() { return _translateCopy("copy.df12b8f89b61", { defaultValue: "Crypto" }); }, country: '🇺🇸', viewers: '12.4K' },
  { name: 'DeFi Daily', get category() { return _translateCopy("copy.b696d75511dc", { defaultValue: "Finance" }); }, country: '🇬🇧', viewers: '8.2K' },
  { name: 'Web3 News', get category() { return _translateCopy("copy.69752f2313b2", { defaultValue: "News" }); }, country: '🇩🇪', viewers: '5.1K' },
  { name: 'NFT Showcase', get category() { return _translateCopy("copy.75df3579c730", { defaultValue: "Art" }); }, country: '🇯🇵', viewers: '3.7K' },
  { name: 'Blockchain 101', get category() { return _translateCopy("copy.512ab3c6b986", { defaultValue: "Education" }); }, country: '🇫🇷', viewers: '2.9K' },
  { name: 'DAO Radio', get category() { return _translateCopy("copy.6eb00b4b2614", { defaultValue: "Music" }); }, country: '🇧🇷', viewers: '1.5K' },
];

const CATEGORIES = [
  { id: 'all', get label() { return _translateCopy("copy.a52ace420f21", { defaultValue: "All" }); } },
  { id: 'crypto', get label() { return _translateCopy("copy.df12b8f89b61", { defaultValue: "Crypto" }); } },
  { id: 'news', get label() { return _translateCopy("copy.69752f2313b2", { defaultValue: "News" }); } },
  { id: 'finance', get label() { return _translateCopy("copy.b696d75511dc", { defaultValue: "Finance" }); } },
  { id: 'music', get label() { return _translateCopy("copy.6eb00b4b2614", { defaultValue: "Music" }); } },
  { id: 'education', get label() { return _translateCopy("copy.512ab3c6b986", { defaultValue: "Education" }); } },
];

export function TVScreen() {
  const { t: _copy } = _useCopy();
  return (
    <div className="min-h-full bg-black flex flex-col">
      <MobileStatusBar />
      <MobileTopBar title={_copy("copy.ca62d5e073f5", { defaultValue: "TV" })} />

      {/* Categories */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
        {CATEGORIES.map((cat, i) => (
          <button
            key={cat.id}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0 ${
              i === 0 ? 'bg-white/10 text-white border border-white/20' : 'text-zinc-500'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Featured */}
      <div className="mx-4 mb-4 rounded-xl overflow-hidden border border-white/[0.08]">
        <div className="aspect-video bg-zinc-900 flex items-center justify-center relative">
          <div className="w-14 h-14 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
            <Play className="w-6 h-6 text-white ml-1" />
          </div>
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded px-2 py-1">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span className="text-[10px] text-white font-medium">{_copy("copy.35e0d0360a0a", { defaultValue: "LIVE" })}</span>
            <span className="text-[10px] text-zinc-400">{_copy("copy.9a65602c6c31", { defaultValue: "12.4K watching" })}</span>
          </div>
        </div>
        <div className="p-3 bg-white/[0.02]">
          <h3 className="text-white text-sm font-semibold">{_copy("copy.194952e5d71d", { defaultValue: "CryptoTV Live — Market Analysis" })}</h3>
          <p className="text-zinc-500 text-xs mt-0.5">{_copy("copy.35d28d22dfa5", { defaultValue: "Live stream • Crypto" })}</p>
        </div>
      </div>

      {/* Channel list */}
      <div className="px-4 flex-1">
        <h3 className="text-white text-sm font-semibold mb-3">{_copy("copy.8a422ea5d758", { defaultValue: "All Channels" })}</h3>
        <div className="space-y-1">
          {MOCK_CHANNELS.map((channel) => (
            <div key={channel.name} className="flex items-center gap-3 py-2.5 rounded-lg">
              <div className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center border border-white/[0.06]">
                <Tv className="w-5 h-5 text-zinc-600" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-white text-sm font-medium block truncate">{channel.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-600 text-xs">{channel.country}</span>
                  <span className="text-zinc-600 text-xs">{channel.category}</span>
                  <span className="text-zinc-600 text-xs">• {channel.viewers}</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-700" />
            </div>
          ))}
        </div>
      </div>

      <MobileBottomBar />
    </div>
  );
}
