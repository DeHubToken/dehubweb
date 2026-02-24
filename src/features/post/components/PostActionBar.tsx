import { useState, useRef } from 'react';
import { Image, Film, Radio, Sparkles, Loader2, Send, Mic, Music, Video, Upload, SpellCheck, Palette, ChevronLeft, ChevronRight, Type, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { GLASS_STYLES } from '@/constants/app.constants';
import { AI_STYLE_OPTIONS } from '@/constants/ai-styles.constants';
import { GoLiveModal } from '@/components/app/modals';
import { AudioSpacesModal } from '@/components/app/spaces';
import { EmojiGifPicker } from '@/components/app/chat/EmojiGifPicker';
import type { LiveMode } from '../types';

interface PostActionBarProps {
  imageInputRef: React.RefObject<HTMLInputElement>;
  videoInputRef: React.RefObject<HTMLInputElement>;
  audioInputRef: React.RefObject<HTMLInputElement>;
  onImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onVideoSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAudioSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onStartRecording: () => void;
  liveMode: LiveMode;
  setLiveMode: (value: LiveMode) => void;
  onInsertFormatting: (format: 'bold' | 'italic' | 'mention') => void;
  onInsertEmoji: (emoji: string) => void;
  onInsertGif: (gifUrl: string) => void;
  onCameraCapture: () => void;
  onEnhanceWithAI: (mode: 'spellcheck' | 'grammar' | 'style', style?: string) => void;
  onPost: () => void;
  canPost: boolean;
  isEnhancing: boolean;
  isPosting?: boolean;
  hasText: boolean;
  hasImage?: boolean;
  hasVideo?: boolean;
  isScheduled?: boolean;
  onCloseModal?: () => void;
}

export function PostActionBar({
  imageInputRef,
  videoInputRef,
  audioInputRef,
  onImageSelect,
  onVideoSelect,
  onAudioSelect,
  onStartRecording,
  liveMode,
  setLiveMode,
  onInsertFormatting,
  onInsertEmoji,
  onInsertGif,
  onCameraCapture,
  onEnhanceWithAI,
  onPost,
  canPost,
  isEnhancing,
  isPosting,
  hasText,
  hasImage,
  hasVideo,
  isScheduled,
  onCloseModal,
}: PostActionBarProps) {
  const [audioPopoverOpen, setAudioPopoverOpen] = useState(false);
  const [livePopoverOpen, setLivePopoverOpen] = useState(false);
  const [enhanceSheetOpen, setEnhanceSheetOpen] = useState(false);
  const [styleView, setStyleView] = useState(false);
  const [goLiveModalOpen, setGoLiveModalOpen] = useState(false);
  const [audioSpacesModalOpen, setAudioSpacesModalOpen] = useState(false);
  const isLive = liveMode !== null;

  const handleSelectLiveMode = (mode: LiveMode) => {
    setLiveMode(mode);
    setLivePopoverOpen(false);
    // Open the appropriate modal based on mode
    if (mode === 'townhall') {
      setAudioSpacesModalOpen(true);
    } else {
      setGoLiveModalOpen(true);
    }
  };

  const handleSpellCheck = () => {
    onEnhanceWithAI('spellcheck');
    setEnhanceSheetOpen(false);
    setStyleView(false);
  };

  const handleGrammar = () => {
    onEnhanceWithAI('grammar');
    setEnhanceSheetOpen(false);
    setStyleView(false);
  };

  const handleStyleSelect = (styleId: string) => {
    onEnhanceWithAI('style', styleId);
    setEnhanceSheetOpen(false);
    setStyleView(false);
  };

  const handleCloseEnhance = () => {
    setEnhanceSheetOpen(false);
    setStyleView(false);
  };

  // Menu content - used in Drawer on all devices
  const menuContent = (
    <div className="flex flex-col max-h-[50vh] overflow-y-auto pb-4">
      {styleView ? (
        <>
          {AI_STYLE_OPTIONS.map((style) => (
            <button
              key={style.id}
              type="button"
              onClick={() => handleStyleSelect(style.id)}
              className="flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors"
            >
              <span className="text-lg">{style.emoji}</span>
              {style.label}
            </button>
          ))}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={handleSpellCheck}
            className="flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors"
          >
            <SpellCheck className="w-5 h-5 text-white" />
            Spell Check
          </button>
          
          <button
            type="button"
            onClick={handleGrammar}
            className="flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors"
          >
            <Type className="w-5 h-5 text-white" />
            Fix Grammar
          </button>
          
          <button
            type="button"
            onClick={() => setStyleView(true)}
            className="flex items-center justify-between px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Palette className="w-5 h-5 text-white" />
              Change Style
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-500" />
          </button>
        </>
      )}
    </div>
  );

  const handleGoLiveClick = () => {
    if (isLive) {
      // Open the Go Live modal
      setGoLiveModalOpen(true);
    }
  };

  const handleGoLiveModalClose = () => {
    setGoLiveModalOpen(false);
    setLiveMode(null);
    // Close the parent post modal if provided
    onCloseModal?.();
  };

  const handleAudioSpacesModalClose = () => {
    setAudioSpacesModalOpen(false);
    setLiveMode(null);
    // Close the parent post modal if provided
    onCloseModal?.();
  };

  return (
    <>
      <GoLiveModal
        isOpen={goLiveModalOpen}
        onClose={handleGoLiveModalClose}
      />
      <AudioSpacesModal
        isOpen={audioSpacesModalOpen}
        onClose={handleAudioSpacesModalClose}
      />
    <div className="px-4 py-2 border-t border-white/10 flex items-center justify-between">
      <div className="flex items-center gap-0.5">
        <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={onImageSelect} className="hidden" />
        <input ref={videoInputRef} type="file" accept="video/*" onChange={onVideoSelect} className="hidden" />
        <input ref={audioInputRef} type="file" accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg,audio/m4a,audio/*" onChange={onAudioSelect} className="hidden" />
        
        {/* Camera button for recording - leftmost position */}
        {!isLive && !hasVideo && !hasImage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button 
                type="button" 
                onClick={onCameraCapture} 
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
              >
                <Camera className="w-5 h-5 text-white" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Record video</TooltipContent>
          </Tooltip>
        )}

        {/* Image button */}
        {!isLive && !hasVideo && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button 
                type="button" 
                onClick={() => imageInputRef.current?.click()} 
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
              >
                <Image className="w-5 h-5 text-white" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Add image</TooltipContent>
          </Tooltip>
        )}
        
        {/* Desktop: Separate video button */}
        {!hasImage && !isLive && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button 
                type="button" 
                onClick={() => videoInputRef.current?.click()} 
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
              >
                <Film className="w-5 h-5 text-white" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Add video</TooltipContent>
          </Tooltip>
        )}

        {/* Audio button with popover for upload/record options */}
        {!isLive && (
          <Popover open={audioPopoverOpen} onOpenChange={setAudioPopoverOpen} modal={true}>
            <PopoverTrigger asChild>
              <button 
                type="button" 
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
              >
                <Music className="w-5 h-5 text-white" />
              </button>
            </PopoverTrigger>
            <PopoverContent 
              className="w-auto p-1 bg-zinc-900/90 backdrop-blur-xl border border-white/10 shadow-xl rounded-xl z-[150]" 
              align="center"
              side="top"
              sideOffset={8}
            >
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    audioInputRef.current?.click();
                    setAudioPopoverOpen(false);
                  }}
                  className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-all"
                  title="Upload Audio"
                >
                  <Upload className="w-5 h-5 text-white" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onStartRecording();
                    setAudioPopoverOpen(false);
                  }}
                  className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-all"
                  title="Record Audio"
                >
                  <Mic className="w-5 h-5 text-white" />
                </button>
              </div>
            </PopoverContent>
          </Popover>
        )}
        
        {!hasImage && (
          <Popover open={livePopoverOpen} onOpenChange={setLivePopoverOpen} modal={true}>
            <PopoverTrigger asChild>
              <button 
                type="button" 
                onClick={() => {
                  if (isLive) {
                    setLiveMode(null);
                  }
                }}
                className={cn("p-2 hover:bg-white/10 rounded-xl transition-colors", isLive && "bg-white/20")}
                title="Go live"
              >
                <Radio className={cn("w-5 h-5", isLive ? "text-white" : "text-white")} />
              </button>
            </PopoverTrigger>
            <PopoverContent 
              className="w-auto p-1 bg-zinc-900/90 backdrop-blur-xl border border-white/10 shadow-xl rounded-xl z-[150]" 
              align="center"
              side="top"
              sideOffset={8}
            >
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSelectLiveMode('video')}
                  className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-all"
                  title="Live Video"
                >
                  <Video className="w-5 h-5 text-white" />
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectLiveMode('townhall')}
                  className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-all"
                  title="Town Hall"
                >
                  <Mic className="w-5 h-5 text-white" />
                </button>
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* Removed audio buttons when hasImage - functionality is on the image thumbnail */}

        <div className="w-px h-4 bg-white/10 mx-1" />

        {/* Emoji/GIF picker - single working button */}
        <EmojiGifPicker 
          onEmojiSelect={onInsertEmoji}
          onGifSelect={onInsertGif}
        />
      </div>

      <div className="flex items-center gap-2">
        {/* Enhance: Always use Drawer/Sheet on all devices */}
        <Button
          variant="outline"
          size="sm"
          disabled={!hasText || isEnhancing}
          onClick={() => setEnhanceSheetOpen(true)}
          className="rounded-xl border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white gap-1.5 text-xs px-3 h-8"
        >
          {isEnhancing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          <span className="hidden sm:inline">{isEnhancing ? 'Enhancing...' : 'Enhance'}</span>
        </Button>
        
        <Drawer open={enhanceSheetOpen} onOpenChange={handleCloseEnhance}>
          <DrawerContent glass className="border-t border-white/10">
            <DrawerHeader className="border-b border-white/10">
              {styleView && (
                <button
                  type="button"
                  onClick={() => setStyleView(false)}
                  className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition-colors mb-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              )}
              <DrawerTitle className="text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-white" />
                {styleView ? 'Choose Style' : 'Enhance'}
              </DrawerTitle>
            </DrawerHeader>
            {menuContent}
          </DrawerContent>
        </Drawer>
        
        <Button
          onClick={isLive ? handleGoLiveClick : onPost}
          disabled={(!canPost && !isLive) || isPosting}
          className={cn(
            "rounded-xl px-3 h-8 sm:px-4 font-semibold disabled:opacity-50 text-sm",
            isLive 
              ? "bg-red-500 text-white hover:bg-red-600" 
              : isScheduled
                ? "bg-amber-500 text-black hover:bg-amber-400"
                : "bg-white text-black hover:bg-zinc-200"
          )}
        >
          {isPosting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <span className="hidden sm:inline">
                {isLive ? 'Go Live' : isScheduled ? 'Schedule' : 'Post'}
              </span>
              {isLive ? <Radio className="w-4 h-4 sm:hidden" /> : <Send className="w-4 h-4 sm:hidden" />}
            </>
          )}
        </Button>
      </div>
    </div>
    </>
  );
}