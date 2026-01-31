import { useState, useRef } from 'react';
import { Image, Film, Radio, Bold, Italic, Smile, Sparkles, Loader2, Send, Mic, Music, Video, Upload, SpellCheck, Palette, ChevronLeft, ChevronRight, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { GLASS_STYLES } from '@/constants/app.constants';
import { AI_STYLE_OPTIONS } from '@/constants/ai-styles.constants';
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
  onEnhanceWithAI: (mode: 'spellcheck' | 'grammar' | 'style', style?: string) => void;
  onPost: () => void;
  canPost: boolean;
  isEnhancing: boolean;
  hasText: boolean;
  hasImage?: boolean;
  hasVideo?: boolean;
  isScheduled?: boolean;
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
  onEnhanceWithAI,
  onPost,
  canPost,
  isEnhancing,
  hasText,
  hasImage,
  hasVideo,
  isScheduled,
}: PostActionBarProps) {
  const [livePopoverOpen, setLivePopoverOpen] = useState(false);
  const [enhanceSheetOpen, setEnhanceSheetOpen] = useState(false);
  const [styleView, setStyleView] = useState(false);
  const [uploadTooltipOpen, setUploadTooltipOpen] = useState(false);
  const [recordTooltipOpen, setRecordTooltipOpen] = useState(false);
  const isLive = liveMode !== null;

  const handleSelectLiveMode = (mode: LiveMode) => {
    setLiveMode(mode);
    setLivePopoverOpen(false);
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

  return (
    <div className="px-4 py-2 border-t border-white/10 flex items-center justify-between">
      <div className="flex items-center gap-0.5">
        <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={onImageSelect} className="hidden" />
        <input ref={videoInputRef} type="file" accept="video/*" onChange={onVideoSelect} className="hidden" />
        <input ref={audioInputRef} type="file" accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg,audio/m4a,audio/*" onChange={onAudioSelect} className="hidden" />
        
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
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button 
                    type="button" 
                    className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                  >
                    <Music className="w-5 h-5 text-white" />
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
                <Tooltip open={uploadTooltipOpen}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => audioInputRef.current?.click()}
                      onMouseEnter={() => setUploadTooltipOpen(true)}
                      onMouseLeave={() => setUploadTooltipOpen(false)}
                      className="p-2.5 rounded-xl bg-white/10 backdrop-blur-xl border border-white/5 hover:bg-white/20 transition-all shadow-lg"
                    >
                      <Upload className="w-5 h-5 text-white" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left">Upload Audio</TooltipContent>
                </Tooltip>
                <Tooltip open={recordTooltipOpen}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={onStartRecording}
                      onMouseEnter={() => setRecordTooltipOpen(true)}
                      onMouseLeave={() => setRecordTooltipOpen(false)}
                      className="p-2.5 rounded-xl bg-white/10 backdrop-blur-xl border border-white/5 hover:bg-white/20 transition-all shadow-lg"
                    >
                      <Mic className="w-5 h-5 text-white" />
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
                    className={cn("p-2 hover:bg-white/10 rounded-xl transition-colors", isLive && "bg-white/20")}
                  >
                    <Radio className={cn("w-5 h-5", isLive ? "text-white" : "text-white")} />
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
                      className="p-2.5 rounded-xl bg-white/10 backdrop-blur-xl border border-white/5 hover:bg-white/20 transition-all shadow-lg"
                    >
                      <Video className="w-5 h-5 text-white" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left">Live Video</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => handleSelectLiveMode('townhall')}
                      className="p-2.5 rounded-xl bg-white/10 backdrop-blur-xl border border-white/5 hover:bg-white/20 transition-all shadow-lg"
                    >
                      <Mic className="w-5 h-5 text-white" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left">Town Hall</TooltipContent>
                </Tooltip>
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* Removed audio buttons when hasImage - functionality is on the image thumbnail */}

        <div className="w-px h-4 bg-white/10 mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <button 
              type="button" 
              onClick={() => onInsertFormatting('bold')} 
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
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
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
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
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            >
              <Smile className="w-4 h-4 text-zinc-400" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Emoji</TooltipContent>
        </Tooltip>
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
          onClick={onPost}
          disabled={!canPost}
                className={cn(
                  "rounded-xl px-3 h-8 sm:px-4 font-semibold disabled:opacity-50 text-sm",
            isLive 
              ? "bg-red-500 text-white hover:bg-red-600" 
              : isScheduled
                ? "bg-amber-500 text-black hover:bg-amber-400"
                : "bg-white text-black hover:bg-zinc-200"
          )}
        >
          <span className="hidden sm:inline">
            {isLive ? 'Go Live' : isScheduled ? 'Schedule' : 'Post'}
          </span>
          {isLive ? <Radio className="w-4 h-4 sm:hidden" /> : <Send className="w-4 h-4 sm:hidden" />}
        </Button>
      </div>
    </div>
  );
}