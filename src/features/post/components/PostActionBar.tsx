import { Image, Film, Radio, Bold, Italic, AtSign, Smile, Sparkles, Loader2, Send, Mic, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PostActionBarProps {
  imageInputRef: React.RefObject<HTMLInputElement>;
  videoInputRef: React.RefObject<HTMLInputElement>;
  audioInputRef: React.RefObject<HTMLInputElement>;
  onImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onVideoSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAudioSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isLive: boolean;
  setIsLive: (value: boolean) => void;
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
  isLive,
  setIsLive,
  onInsertFormatting,
  onEnhanceWithAI,
  onPost,
  canPost,
  isEnhancing,
  hasText,
  hasImage,
}: PostActionBarProps) {
  return (
    <div className="px-4 py-2 border-t border-white/10 flex items-center justify-between">
      <div className="flex items-center gap-0.5">
        <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={onImageSelect} className="hidden" />
        <input ref={videoInputRef} type="file" accept="video/*" onChange={onVideoSelect} className="hidden" />
        <input ref={audioInputRef} type="file" accept="audio/*" onChange={onAudioSelect} className="hidden" />
        
        <button 
          type="button" 
          onClick={() => imageInputRef.current?.click()} 
          className="p-2 hover:bg-white/10 rounded-full transition-colors" 
          title="Add image"
        >
          <Image className="w-5 h-5 text-blue-400" />
        </button>
        
        {!hasImage && (
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
          <button 
            type="button" 
            onClick={() => setIsLive(!isLive)} 
            className={cn("p-2 hover:bg-white/10 rounded-full transition-colors", isLive && "bg-red-500/20")} 
            title="Go live"
          >
            <Radio className={cn("w-5 h-5", isLive ? "text-red-500" : "text-red-400")} />
          </button>
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
          className="rounded-full px-3 h-8 sm:px-4 bg-white text-black hover:bg-zinc-200 font-semibold disabled:opacity-50 text-sm"
        >
          <span className="hidden sm:inline">Post</span>
          <Send className="w-4 h-4 sm:hidden" />
        </Button>
      </div>
    </div>
  );
}
