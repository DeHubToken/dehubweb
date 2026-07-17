import { useState, useEffect, useRef, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Smile, Search, Loader2 } from 'lucide-react';

const EMOJI_CATEGORIES = {
  'Smileys': ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😋', '😛', '🤪', '😎', '🤩', '🥳'],
  'Gestures': ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '👏', '🙌', '👐', '🤲', '🙏', '💪', '🦾', '🖐️', '✋', '👋', '🤚', '🖖', '👊'],
  'Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'],
  'Objects': ['🔥', '⭐', '✨', '💫', '🌟', '💥', '💯', '🎉', '🎊', '🎁', '🏆', '🥇', '🎮', '🎯', '🎨', '🎬', '📸', '💰', '💎', '🚀'],
};

// GIPHY public beta key (intended for client-side use)
const GIPHY_API_KEY = 'GlVGYHkr3WSBnllca54iNt0yFbjz7L65';

interface GiphyGif {
  id: string;
  images: {
    fixed_width: { url: string };
    original: { url: string };
  };
  title: string;
}

async function fetchTrendingGifs(): Promise<string[]> {
  try {
    const res = await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=pg-13`);
    const data = await res.json();
    return (data.data || []).map((g: GiphyGif) => g.images.fixed_width.url);
  } catch {
    return [];
  }
}

async function searchGifs(query: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=20&rating=pg-13`);
    const data = await res.json();
    return (data.data || []).map((g: GiphyGif) => g.images.fixed_width.url);
  } catch {
    return [];
  }
}

interface EmojiGifPickerProps {
  onEmojiSelect: (emoji: string) => void;
  onGifSelect: (gifUrl: string) => void;
}

export function EmojiGifPicker({ onEmojiSelect, onGifSelect }: EmojiGifPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'emoji' | 'gif'>('emoji');
  const [activeCategory, setActiveCategory] = useState('Smileys');
  const [gifSearchQuery, setGifSearchQuery] = useState('');
  const [gifs, setGifs] = useState<string[]>([]);
  const [loadingGifs, setLoadingGifs] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load trending GIFs when GIF tab opens
  useEffect(() => {
    if (open && activeTab === 'gif' && gifs.length === 0 && !gifSearchQuery) {
      setLoadingGifs(true);
      fetchTrendingGifs().then(results => {
        setGifs(results);
        setLoadingGifs(false);
      });
    }
  }, [open, activeTab]);

  // Debounced search
  const debouncedSearch = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setLoadingGifs(true);
      fetchTrendingGifs().then(results => {
        setGifs(results);
        setLoadingGifs(false);
      });
      return;
    }
    setLoadingGifs(true);
    debounceRef.current = setTimeout(() => {
      searchGifs(query).then(results => {
        setGifs(results);
        setLoadingGifs(false);
      });
    }, 500);
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setGifSearchQuery(value);
    debouncedSearch(value);
  };

  const handleEmojiClick = (emoji: string) => {
    onEmojiSelect(emoji);
    setOpen(false);
  };

  const handleGifClick = (gifUrl: string) => {
    onGifSelect(gifUrl);
    setOpen(false);
    setGifSearchQuery('');
  };

  // Reset on close
  useEffect(() => {
    if (!open) {
      setGifSearchQuery('');
      setGifs([]);
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-white hover:text-white hover:bg-zinc-700"
        >
          <Smile className="w-5 h-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-0" 
        align="start"
        side="top"
      >
        {/* Tab switcher */}
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setActiveTab('emoji')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'emoji'
                ? 'text-white border-b-2 border-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Emoji
          </button>
          <button
            onClick={() => setActiveTab('gif')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'gif'
                ? 'text-white border-b-2 border-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            GIF
          </button>
        </div>

        {activeTab === 'emoji' ? (
          <>
            {/* Category tabs */}
            <div className="flex border-b border-white/10 overflow-x-auto">
              {Object.keys(EMOJI_CATEGORIES).map((category) => (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                    activeCategory === category 
                      ? 'text-white border-b-2 border-white' 
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
            {/* Emoji grid */}
            <div className="p-2 max-h-48 overflow-y-auto">
              <div className="grid grid-cols-8 gap-1">
                {EMOJI_CATEGORIES[activeCategory as keyof typeof EMOJI_CATEGORIES].map((emoji, index) => (
                  <button
                    key={index}
                    onClick={() => handleEmojiClick(emoji)}
                    className="w-8 h-8 flex items-center justify-center text-lg hover:bg-white/10 rounded transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* GIF Search */}
            <div className="p-2 border-b border-white/10">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  placeholder="Search GIFs..."
                  value={gifSearchQuery}
                  onChange={handleSearchChange}
                  className="pl-8 h-8 bg-white/5 border-white/10 text-white text-sm placeholder:text-zinc-500"
                />
              </div>
            </div>
            
            <div className="p-2 text-xs text-zinc-500 font-medium">
              {gifSearchQuery ? 'Search Results' : 'Trending'}
            </div>
            
            {/* GIF grid */}
            <div className="p-2 pt-0 max-h-64 overflow-y-auto">
              {loadingGifs ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
                </div>
              ) : gifs.length === 0 ? (
                <p className="text-center text-zinc-500 text-xs py-8">No GIFs found</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {gifs.map((gif, index) => (
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
              )}
            </div>
            
            <div className="p-2 border-t border-white/10 text-center">
              <span className="text-[10px] text-zinc-500">Powered by GIPHY</span>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
