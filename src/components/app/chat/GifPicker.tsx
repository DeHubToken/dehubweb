import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

// Mock GIF data - in production, integrate with Giphy/Tenor API
const MOCK_GIFS = [
  'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
  'https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif',
  'https://media.giphy.com/media/3oriO0OEd9QIDdllqo/giphy.gif',
  'https://media.giphy.com/media/l46Cy1rHbQ92uuLXa/giphy.gif',
  'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif',
  'https://media.giphy.com/media/xUPGcguWZHRC2HyBRS/giphy.gif',
];

const TRENDING_GIFS = [
  'https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif',
  'https://media.giphy.com/media/3o6Zt6ML6BklcajjsA/giphy.gif',
  'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif',
  'https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif',
  'https://media.giphy.com/media/l0MYAs5E2oIDCq9So/giphy.gif',
  'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif',
];

interface GifPickerProps {
  onGifSelect: (gifUrl: string) => void;
}

export function GifPicker({ onGifSelect }: GifPickerProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleGifClick = (gifUrl: string) => {
    onGifSelect(gifUrl);
    setOpen(false);
    setSearchQuery('');
  };

  const displayGifs = searchQuery ? MOCK_GIFS : TRENDING_GIFS;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-zinc-400 hover:text-white hover:bg-zinc-700 text-xs font-bold"
        >
          GIF
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-0" 
        align="start"
        side="top"
      >
        {/* Search */}
        <div className="p-2 border-b border-white/10">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="Search GIFs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 bg-white/5 border-white/10 text-white text-sm placeholder:text-zinc-500"
            />
          </div>
        </div>
        
        <div className="p-2 text-xs text-zinc-500 font-medium">
          {searchQuery ? 'Search Results' : 'Trending'}
        </div>
        
        {/* GIF grid */}
        <div className="p-2 pt-0 max-h-64 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            {displayGifs.map((gif, index) => (
              <button
                key={index}
                onClick={() => handleGifClick(gif)}
                className="aspect-video rounded-lg overflow-hidden hover:ring-2 hover:ring-white transition-all"
              >
                <img 
                  src={gif} 
                  alt="GIF" 
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </div>
        
        <div className="p-2 border-t border-white/10 text-center">
          <span className="text-[10px] text-zinc-500">Powered by GIPHY</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
