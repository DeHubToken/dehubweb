import { useState } from 'react';
import { Image, Film, Radio, Bold, Italic, Smile, Sparkles, Loader2, Send, Mic, Music, Video, Upload, SpellCheck, Palette, ChevronRight, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { LiveMode } from '../types';

const STYLE_OPTIONS = [
  { id: 'old-english', label: 'Old English', emoji: '🏰' },
  { id: 'cockney', label: 'Cockney', emoji: '🎩' },
  { id: 'celtic', label: 'Celtic', emoji: '☘️' },
  { id: 'scouse', label: 'Scouse', emoji: '⚽' },
  { id: 'wild-west', label: 'Wild West', emoji: '🤠' },
  { id: 'asian-uncle', label: 'Asian Uncle', emoji: '👴' },
  { id: 'russian-mafia', label: 'Russian Mafia', emoji: '🎰' },
  { id: 'pirate', label: 'Pirate', emoji: '🏴‍☠️' },
  { id: 'alien', label: 'Alien', emoji: '👽' },
  { id: 'e-girl', label: 'E-Girl', emoji: '💖' },
  { id: 'chad', label: 'Chad', emoji: '💪' },
] as const;

interface PostActionBarProps {
  imageInputRef: React.RefObject<HTMLInputElement>;
  videoInputRef: React.RefObject<HTMLInputElement>;
  audioInputRef: React.RefObject<HTMLInputElement>;
  onImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onVideoSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAudioSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  liveMode: LiveMode;
  setLiveMode: (value: LiveMode) => void;
  onInsertFormatting: (format: 'bold' | 'italic' | 'mention') => void;
  onEnhanceWithAI: (mode: 'spellcheck' | 'grammar' | 'style', style?: string) => void;
  onPost: () => void;
  canPost: boolean;
  isEnhancing: boolean;
  hasText: boolean;
  hasImage?: boolean;
}

export function PostActionBar({
  imageInputRef,
  videoInputRef,
  audioInputRef,
  onImageSelect,
  onVideoSelect,
  onAudioSelect,
  liveMode,
  setLiveMode,
  onInsertFormatting,
  onEnhanceWithAI,
  onPost,
  canPost,
  isEnhancing,
  hasText,
  hasImage,
}: PostActionBarProps) {
  const [livePopoverOpen, setLivePopoverOpen] = useState(false);
  const [enhancePopoverOpen, setEnhancePopoverOpen] = useState(false);
  const [styleSubmenuOpen, setStyleSubmenuOpen] = useState(false);
  const isLive = liveMode !== null;

  const handleSelectLiveMode = (mode: LiveMode) => {
    setLiveMode(mode);
    setLivePopoverOpen(false);
  };

  const handleSpellCheck = () => {
    onEnhanceWithAI('spellcheck');
    setEnhancePopoverOpen(false);
  };

  const handleGrammar = () => {
    onEnhanceWithAI('grammar');
    setEnhancePopoverOpen(false);
  };

  const handleStyleSelect = (styleId: string) => {
    onEnhanceWithAI('style', styleId);
    setEnhancePopoverOpen(false);
    setStyleSubmenuOpen(false);
  };

  return (
    <div className="px-4 py-2 border-t border-white/10 flex items-center justify-between">
      <div className="flex items-center gap-0.5">
        <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={onImageSelect} className="hidden" />
        <input ref={videoInputRef} type="file" accept="video/*" onChange={onVideoSelect} className="hidden" />
        <input ref={audioInputRef} type="file" accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg,audio/m4a,audio/*" onChange={onAudioSelect} className="hidden" />
        
        {!isLive && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button 
                type="button" 
                onClick={() => imageInputRef.current?.click()} 
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <Image className="w-5 h-5 text-blue-400" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Add image</TooltipContent>
          </Tooltip>
        )}
        
        {!hasImage && !isLive && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button 
                type="button" 
                onClick={() => videoInputRef.current?.click()} 
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <Film className="w-5 h-5 text-purple-400" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Add video</TooltipContent>
          </Tooltip>
        )}

        {/* Audio button with popover for upload/record options */}
        {!isLive && (
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button 
                    type="button" 
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  >
                    <Music className="w-5 h-5 text-emerald-400" />
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Add audio</TooltipContent>
            </Tooltip>
            <PopoverContent 
              className="w-auto p-1 bg-transparent border-none shadow-none" 
              align="center"
              side="top"
              sideOffset={4}
            >
              <div className="flex flex-col items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => audioInputRef.current?.click()}
                      className="p-2.5 rounded-full bg-white/10 backdrop-blur-xl border border-white/5 hover:bg-white/20 transition-all shadow-lg"
                    >
                      <Upload className="w-5 h-5 text-emerald-400" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left">Upload Audio</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="p-2.5 rounded-full bg-white/10 backdrop-blur-xl border border-white/5 hover:bg-white/20 transition-all shadow-lg"
                    >
                      <Mic className="w-5 h-5 text-red-400" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left">Record Audio</TooltipContent>
                </Tooltip>
              </div>
            </PopoverContent>
          </Popover>
        )}
        
        {!hasImage && (
          <Popover open={livePopoverOpen} onOpenChange={setLivePopoverOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button 
                    type="button" 
                    onClick={() => {
                      if (isLive) {
                        setLiveMode(null);
                      } else {
                        setLivePopoverOpen(true);
                      }
                    }}
                    className={cn("p-2 hover:bg-white/10 rounded-full transition-colors", isLive && "bg-red-500/20")}
                  >
                    <Radio className={cn("w-5 h-5", isLive ? "text-red-500" : "text-red-400")} />
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Go live</TooltipContent>
            </Tooltip>
            <PopoverContent 
              className="w-auto p-1 bg-transparent border-none shadow-none" 
              align="center"
              side="top"
              sideOffset={4}
            >
              <div className="flex flex-col items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => handleSelectLiveMode('video')}
                      className="p-2.5 rounded-full bg-white/10 backdrop-blur-xl border border-white/5 hover:bg-white/20 transition-all shadow-lg"
                    >
                      <Video className="w-5 h-5 text-red-400" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left">Live Video</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => handleSelectLiveMode('townhall')}
                      className="p-2.5 rounded-full bg-white/10 backdrop-blur-xl border border-white/5 hover:bg-white/20 transition-all shadow-lg"
                    >
                      <Mic className="w-5 h-5 text-purple-400" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left">Town Hall</TooltipContent>
                </Tooltip>
              </div>
            </PopoverContent>
          </Popover>
        )}

        {hasImage && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button 
                  type="button" 
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <Mic className="w-5 h-5 text-emerald-400" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Record audio</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button 
                  type="button" 
                  onClick={() => audioInputRef.current?.click()}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <Music className="w-5 h-5 text-emerald-400" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Upload audio</TooltipContent>
            </Tooltip>
          </>
        )}

        <div className="w-px h-4 bg-white/10 mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <button 
              type="button" 
              onClick={() => onInsertFormatting('bold')} 
              className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
            >
              <Bold className="w-4 h-4 text-zinc-400" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Bold</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <button 
              type="button" 
              onClick={() => onInsertFormatting('italic')} 
              className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
            >
              <Italic className="w-4 h-4 text-zinc-400" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Italic</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button 
              type="button" 
              className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
            >
              <Smile className="w-4 h-4 text-zinc-400" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Emoji</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex items-center gap-2">
        <Popover open={enhancePopoverOpen} onOpenChange={setEnhancePopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasText || isEnhancing}
              className="rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white gap-1.5 text-xs px-3 h-8 sm:px-3 sm:gap-1.5"
            >
              {isEnhancing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              <span className="hidden sm:inline">{isEnhancing ? 'AI...' : 'AI'}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent 
            className="w-48 p-1 bg-zinc-900/95 backdrop-blur-xl border border-white/10" 
            align="end"
            side="top"
            sideOffset={4}
          >
            <button
              type="button"
              onClick={handleSpellCheck}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 rounded-md transition-colors"
            >
              <SpellCheck className="w-4 h-4 text-blue-400" />
              Spell Check
            </button>
            
            <button
              type="button"
              onClick={handleGrammar}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 rounded-md transition-colors"
            >
              <Type className="w-4 h-4 text-emerald-400" />
              Fix Grammar
            </button>
            
            <Popover open={styleSubmenuOpen} onOpenChange={setStyleSubmenuOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-white hover:bg-white/10 rounded-md transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-purple-400" />
                    Change Style
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-500" />
                </button>
              </PopoverTrigger>
              <PopoverContent 
                className="w-44 p-1 bg-zinc-900/95 backdrop-blur-xl border border-white/10 max-h-64 overflow-y-auto" 
                align="start"
                side="left"
                sideOffset={4}
              >
                {STYLE_OPTIONS.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => handleStyleSelect(style.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 rounded-md transition-colors"
                  >
                    <span>{style.emoji}</span>
                    {style.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </PopoverContent>
        </Popover>
        
        <Button
          onClick={onPost}
          disabled={!canPost}
          className={cn(
            "rounded-full px-3 h-8 sm:px-4 font-semibold disabled:opacity-50 text-sm",
            isLive 
              ? "bg-red-500 text-white hover:bg-red-600" 
              : "bg-white text-black hover:bg-zinc-200"
          )}
        >
          <span className="hidden sm:inline">{isLive ? 'Go Live' : 'Post'}</span>
          {isLive ? <Radio className="w-4 h-4 sm:hidden" /> : <Send className="w-4 h-4 sm:hidden" />}
        </Button>
      </div>
    </div>
  );
}
