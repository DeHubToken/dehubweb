import { translateCopy as _translateCopy } from '@/i18n/copy';
import { useTranslation as _useCopy } from 'react-i18next';
import { MobileStatusBar } from '../MobileStatusBar';
import { MobileTopBar } from '../MobileTopBar';
import { MobileBottomBar } from '../MobileBottomBar';
import { Play, SkipBack, SkipForward, Shuffle, Repeat, Heart, ListMusic, Radio } from 'lucide-react';

const MOCK_TRACKS = [
  { get title() { return _translateCopy("copy.b29ae9358c04", { defaultValue: "Digital Dreams" }); }, artist: 'CryptoBeats', duration: '3:42' },
  { get title() { return _translateCopy("copy.e0c10c2dbafd", { defaultValue: "Decentralized" }); }, artist: 'Web3 Sound', duration: '4:15' },
  { get title() { return _translateCopy("copy.fee822a775ca", { defaultValue: "Chain Reaction" }); }, artist: 'BlockTune', duration: '2:58' },
  { get title() { return _translateCopy("copy.3d7523adae5e", { defaultValue: "Token Flow" }); }, artist: 'DAOrhythm', duration: '5:01' },
  { get title() { return _translateCopy("copy.4adda863ca49", { defaultValue: "Smart Contract" }); }, artist: 'EthWave', duration: '3:33' },
];

export function MusicScreen() {
  const { t: _copy } = _useCopy();
  return (
    <div className="min-h-full bg-black flex flex-col">
      <MobileStatusBar />
      <MobileTopBar title={_copy("copy.6eb00b4b2614", { defaultValue: "Music" })} />

      {/* Category pills */}
      <div className="flex gap-2 px-4 py-3.5 overflow-x-auto scrollbar-hide">
        {['All', 'Music Videos', 'Radio', 'Tracks', 'Podcasts', 'Playlists'].map((cat, i) => (
          <button
            key={cat}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0 ${
              i === 0 ? 'bg-white/10 text-white border border-white/20' : 'text-zinc-500 border border-white/[0.06]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Now playing */}
      <div className="mx-4 mb-5 p-4 rounded-2xl border border-white/[0.1] bg-white/[0.03]">
        <div className="flex items-center gap-2 mb-4">
          <Radio className="w-3.5 h-3.5 text-white" />
          <span className="text-[10px] text-zinc-400 uppercase tracking-wider">{_copy("copy.8b2ae991573c", { defaultValue: "Now Playing" })}</span>
        </div>
        <div className="aspect-square rounded-xl bg-zinc-900 mb-4 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center">
            <Play className="w-6 h-6 text-white ml-1" />
          </div>
        </div>
        <div className="text-center mb-3">
          <h3 className="text-white text-base font-semibold">{_copy("copy.b29ae9358c04", { defaultValue: "Digital Dreams" })}</h3>
          <p className="text-zinc-500 text-sm">{_copy("copy.af86ba804639", { defaultValue: "CryptoBeats" })}</p>
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="h-1 rounded-full bg-white/10">
            <div className="h-1 rounded-full bg-white/40 w-1/3" />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-zinc-600">1:14</span>
            <span className="text-[10px] text-zinc-600">3:42</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-6">
          <Shuffle className="w-4 h-4 text-zinc-500" />
          <SkipBack className="w-5 h-5 text-white" />
          <div className="w-12 h-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
            <Play className="w-5 h-5 text-white ml-0.5" />
          </div>
          <SkipForward className="w-5 h-5 text-white" />
          <Repeat className="w-4 h-4 text-zinc-500" />
        </div>
      </div>

      {/* Up next */}
      <div className="px-4 flex-1">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white text-sm font-semibold">{_copy("copy.f9730ea7776a", { defaultValue: "Up Next" })}</h3>
          <ListMusic className="w-4 h-4 text-zinc-500" />
        </div>
        <div className="space-y-2">
          {MOCK_TRACKS.slice(1).map((track) => (
            <div key={track.title} className="flex items-center gap-3 py-2">
              <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center">
                <Play className="w-3 h-3 text-zinc-500" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-white text-sm block truncate">{track.title}</span>
                <span className="text-zinc-600 text-xs">{track.artist}</span>
              </div>
              <span className="text-zinc-600 text-xs">{track.duration}</span>
              <Heart className="w-4 h-4 text-zinc-600" />
            </div>
          ))}
        </div>
      </div>

      <MobileBottomBar />
    </div>
  );
}
