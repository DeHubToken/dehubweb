import { Users, Eye, MoreVertical } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface TwitchStream {
  id: string;
  streamer: string;
  avatar: string;
  title: string;
  game: string;
  viewers: string;
  thumbnail: string;
  tags: string[];
  isLive: boolean;
}

const MOCK_STREAMS: TwitchStream[] = [
  {
    id: '1',
    streamer: 'Ninja',
    avatar: 'ninja',
    title: '🔴 LIVE - Grinding Ranked! Road to Champion',
    game: 'Fortnite',
    viewers: '45.2K',
    thumbnail: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=480&h=270&fit=crop',
    tags: ['English', 'Competitive', 'Ranked'],
    isLive: true,
  },
  {
    id: '2',
    streamer: 'Pokimane',
    avatar: 'poki',
    title: 'Chill stream with chat 💜 !socials',
    game: 'Just Chatting',
    viewers: '32.1K',
    thumbnail: 'https://images.unsplash.com/photo-1614680376593-902f74cf0d41?w=480&h=270&fit=crop',
    tags: ['English', 'Chill', 'Chat'],
    isLive: true,
  },
  {
    id: '3',
    streamer: 'xQc',
    avatar: 'xqc',
    title: 'REACT ANDY TODAY | !youtube',
    game: 'Just Chatting',
    viewers: '89.5K',
    thumbnail: 'https://images.unsplash.com/photo-1560253023-3ec5d502959f?w=480&h=270&fit=crop',
    tags: ['English', 'Variety'],
    isLive: true,
  },
  {
    id: '4',
    streamer: 'Shroud',
    avatar: 'shroud',
    title: 'Late night gaming session',
    game: 'Valorant',
    viewers: '28.7K',
    thumbnail: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=480&h=270&fit=crop',
    tags: ['English', 'FPS', 'Pro Player'],
    isLive: true,
  },
  {
    id: '5',
    streamer: 'HasanAbi',
    avatar: 'hasan',
    title: 'News & Politics | Reacting to everything',
    game: 'Just Chatting',
    viewers: '41.3K',
    thumbnail: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=480&h=270&fit=crop',
    tags: ['English', 'Politics', 'News'],
    isLive: true,
  },
  {
    id: '6',
    streamer: 'Summit1g',
    avatar: 'summit',
    title: 'GTA RP - New storyline today!',
    game: 'Grand Theft Auto V',
    viewers: '22.8K',
    thumbnail: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=480&h=270&fit=crop',
    tags: ['English', 'Roleplay'],
    isLive: true,
  },
];

const CATEGORIES = [
  { name: 'Just Chatting', viewers: '412K', image: 'https://images.unsplash.com/photo-1614680376593-902f74cf0d41?w=100&h=130&fit=crop' },
  { name: 'Fortnite', viewers: '189K', image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=100&h=130&fit=crop' },
  { name: 'Valorant', viewers: '156K', image: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=100&h=130&fit=crop' },
  { name: 'Minecraft', viewers: '134K', image: 'https://images.unsplash.com/photo-1587573089734-599851c3d30e?w=100&h=130&fit=crop' },
];

export function LiveFeed() {
  return (
    <div className="p-2 sm:p-3 space-y-4">
      {/* Categories */}
      <div className="bg-zinc-900 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-white">Categories</h2>
          <button className="text-purple-400 text-sm hover:underline">Show All</button>
        </div>
        <div className="flex gap-3 overflow-x-auto scrollbar-hide">
          {CATEGORIES.map((cat) => (
            <div key={cat.name} className="flex-shrink-0 cursor-pointer group">
              <div className="w-24 aspect-[3/4] rounded-lg overflow-hidden mb-2">
                <img src={cat.image} alt="" className="w-full h-full object-cover" />
              </div>
              <p className="text-white text-sm font-medium truncate w-24">{cat.name}</p>
              <p className="text-zinc-500 text-xs">{cat.viewers} viewers</p>
            </div>
          ))}
        </div>
      </div>

      {/* Live Channels */}
      <div className="bg-zinc-900 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-white flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            Live Channels
          </h2>
          <button className="text-purple-400 text-sm hover:underline">Show All</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
          {MOCK_STREAMS.map((stream) => (
            <div
              key={stream.id}
              className="cursor-pointer group"
            >
              {/* Thumbnail */}
              <div className="relative aspect-video rounded-xl overflow-hidden mb-2">
                <img src={stream.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                
                {/* Live badge */}
                <div className="absolute top-2 left-2 flex items-center gap-2">
                  <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded">LIVE</span>
                </div>

                {/* Viewer count */}
                <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/70 px-2 py-0.5 rounded">
                  <Eye className="w-3 h-3 text-red-500" />
                  <span className="text-white text-xs font-medium">{stream.viewers}</span>
                </div>

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
              </div>

              {/* Info */}
              <div className="flex gap-2">
                <Avatar className="w-9 h-9 flex-shrink-0 ring-2 ring-purple-500">
                  <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${stream.avatar}`} />
                  <AvatarFallback className="bg-zinc-700">{stream.streamer[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-white text-sm truncate group-hover:text-purple-400 transition-colors">
                    {stream.title}
                  </h3>
                  <p className="text-zinc-400 text-xs">{stream.streamer}</p>
                  <p className="text-zinc-500 text-xs">{stream.game}</p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {stream.tags.slice(0, 2).map((tag) => (
                      <span key={tag} className="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
