import { useState } from 'react';
import { Image, Film, Radio, Bold, Italic, AtSign, Smile, Sparkles, Loader2, Send, Mic, Music, Video, Headphones } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { LiveMode } from '../types';

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
  onEnhanceWithAI: () => void;
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
  const isLive = liveMode !== null;

  const handleSelectLiveMode = (mode: LiveMode) => {
    setLiveMode(mode);
    setLivePopoverOpen(false);
  };

  return (
    <div className="px-4 py-2 border-t border-white/10 flex items-center justify-between">
      <div className="flex items-center gap-0.5">
        <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={onImageSelect} className="hidden" />
        <input ref={videoInputRef} type="file" accept="video/*" onChange={onVideoSelect} className="hidden" />
        <input ref={audioInputRef} type="file" accept="audio/*" onChange={onAudioSelect} className="hidden" />
        
        {!isLive && (
          <button 
            type="button" 
            onClick={() => imageInputRef.current?.click()} 
            className="p-2 hover:bg-white/10 rounded-full transition-colors" 
            title="Add image"
          >
            <Image className="w-5 h-5 text-blue-400" />
          </button>
        )}
        
        {!hasImage && !isLive && (
          <button 
            type="button" 
            onClick={() => videoInputRef.current?.click()} 
            className="p-2 hover:bg-white/10 rounded-full transition-colors" 
            title="Add video"
          >
            <Film className="w-5 h-5 text-purple-400" />
          </button>
        )}
        
        {!hasImage && (
          <Popover open={livePopoverOpen} onOpenChange={setLivePopoverOpen}>
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
                title="Go live"
              >
                <Radio className={cn("w-5 h-5", isLive ? "text-red-500" : "text-red-400")} />
              </button>
            </PopoverTrigger>
            <PopoverContent 
              className="w-64 p-0 bg-zinc-900/95 backdrop-blur-xl border border-white/10" 
              align="start"
              sideOffset={8}
            >
              <div className="p-2">
                <p className="text-xs text-zinc-400 px-2 py-1.5 font-medium">Choose Live Type</p>
                <button
                  type="button"
                  onClick={() => handleSelectLiveMode('video')}
                  className="w-full flex items-start gap-3 p-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
                >
                  <div className="p-2 rounded-full bg-red-500/20">
                    <Video className="w-4 h-4 text-red-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">Live Video</p>
                    <p className="text-xs text-zinc-400">Stream video like Twitch</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectLiveMode('townhall')}
                  className="w-full flex items-start gap-3 p-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
                >
                  <div className="p-2 rounded-full bg-purple-500/20">
                    <Headphones className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">Town Hall</p>
                    <p className="text-xs text-zinc-400">Audio spaces like Twitter</p>
                  </div>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        )}

        {hasImage && (
          <>
            <button 
              type="button" 
              className="p-2 hover:bg-white/10 rounded-full transition-colors" 
              title="Record audio"
            >
              <Mic className="w-5 h-5 text-emerald-400" />
            </button>
            <button 
              type="button" 
              onClick={() => audioInputRef.current?.click()}
              className="p-2 hover:bg-white/10 rounded-full transition-colors" 
              title="Upload audio"
            >
              <Music className="w-5 h-5 text-emerald-400" />
            </button>
          </>
        )}

        <div className="w-px h-4 bg-white/10 mx-1" />

        <button 
          type="button" 
          onClick={() => onInsertFormatting('bold')} 
          className="p-1.5 hover:bg-white/10 rounded-full transition-colors" 
          title="Bold"
        >
          <Bold className="w-4 h-4 text-zinc-400" />
        </button>
        
        <button 
          type="button" 
          onClick={() => onInsertFormatting('italic')} 
          className="p-1.5 hover:bg-white/10 rounded-full transition-colors" 
          title="Italic"
        >
          <Italic className="w-4 h-4 text-zinc-400" />
        </button>
        
        <button 
          type="button" 
          onClick={() => onInsertFormatting('mention')} 
          className="p-1.5 hover:bg-white/10 rounded-full transition-colors" 
          title="Mention"
        >
          <AtSign className="w-4 h-4 text-zinc-400" />
        </button>

        <button 
          type="button" 
          className="p-1.5 hover:bg-white/10 rounded-full transition-colors" 
          title="Emoji"
        >
          <Smile className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onEnhanceWithAI}
          disabled={!hasText || isEnhancing}
          className="rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white gap-1.5 text-xs px-3 h-8 sm:px-3 sm:gap-1.5"
        >
          {isEnhancing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          <span className="hidden sm:inline">{isEnhancing ? 'AI...' : 'Enhance'}</span>
        </Button>
        
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
