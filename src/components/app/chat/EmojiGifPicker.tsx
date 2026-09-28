import { useState, useEffect, useRef, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Smile, Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { AppState } from '@/components/app/AppState';
import { EmojiPanel } from '@/components/app/emoji/EmojiPanel';
import { PackGrid, PackStrip, StickerPanel, useGifPacks } from '@/components/app/packs/PackPickerParts';
import { useKidsModeLock } from '@/hooks/use-kids-mode';

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
  /** Overrides the trigger's default ghost-button look — for callers whose
   *  neighbouring controls use a different button style (e.g. the comment
   *  composer's bordered glass pills instead of the chat rail's ghost icons). */
  triggerClassName?: string;
  /** Overrides the Smile glyph's default size, to match a neighbouring icon
   *  size other than the chat rail's w-5 h-5. */
  iconClassName?: string;
}

export function EmojiGifPicker({ onEmojiSelect, onGifSelect, triggerClassName, iconClassName }: EmojiGifPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'emoji' | 'sticker' | 'gif'>('emoji');
  const gifPacks = useGifPacks();
  // Kids Mode: creator packs are unreviewed uploads, the same reason custom
  // emoji are hidden there — no Stickers tab and no GIF packs, GIPHY only.
  const kids = useKidsModeLock();
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

  const handleEmojiClick = (emoji: string, { keepOpen }: { keepOpen: boolean }) => {
    onEmojiSelect(emoji);
    if (!keepOpen) setOpen(false);
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
          className={cn("h-8 w-8 text-white hover:text-white hover:bg-zinc-700", triggerClassName)}
        >
          <Smile className={cn("w-5 h-5", iconClassName)} />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        collisionPadding={8}
        className="w-[calc(100vw-1rem)] sm:w-[22rem] p-0 overflow-hidden" 
        align="start"
        side="top"
      >
        {/* Tab switcher */}
        <div className="flex border-b border-white/10">
          {(kids ? (['emoji', 'gif'] as const) : (['emoji', 'sticker', 'gif'] as const)).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-white border-b-2 border-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {t(tab === 'emoji' ? 'emojiPicker.tabEmoji' : tab === 'sticker' ? 'creatorPacks.tabStickers' : 'emojiPicker.tabGif')}
            </button>
          ))}
        </div>

        {activeTab === 'emoji' ? (
          <EmojiPanel onSelect={handleEmojiClick} />
        ) : activeTab === 'sticker' && !kids ? (
          <StickerPanel onSelect={handleGifClick} />
        ) : (
          <>
            {!kids && <PackStrip packs={gifPacks.packs} active={gifPacks.active} onChange={gifPacks.setActive} leading="GIPHY" />}
            {!kids && gifPacks.items ? (
              <div className="max-h-72 overflow-y-auto">
                <PackGrid kind="gif" items={gifPacks.items} onSelect={handleGifClick} />
              </div>
            ) : (
            <>
            {/* GIF Search */}
            <div className="p-2 border-b border-white/10">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  placeholder={t('emojiPicker.searchGifs')}
                  value={gifSearchQuery}
                  onChange={handleSearchChange}
                  className="pl-8 h-8 bg-white/5 border-white/10 text-white text-sm placeholder:text-zinc-500"
                />
              </div>
            </div>
            
            <div className="p-2 text-xs text-zinc-500 font-medium">
              {gifSearchQuery ? t('emojiPicker.searchResults') : t('emojiPicker.trending')}
            </div>
            
            {/* GIF grid */}
            <div className="p-2 pt-0 max-h-64 overflow-y-auto">
              {loadingGifs ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
                </div>
              ) : gifs.length === 0 ? (
                <AppState icon="search" title={t('emojiPicker.noGifs')} kind="search-empty" size="compact" />
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
              <span className="text-[10px] text-zinc-500">{t('emojiPicker.poweredByGiphy')}</span>
            </div>
            </>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
