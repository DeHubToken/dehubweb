import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paperclip, Radio, Sparkles, Loader2, Send, Mic, Music, Video, Upload, SpellCheck, Palette, ChevronLeft, ChevronRight, Type, Camera, Hash, X, Search, MessageSquare, BarChart2, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { GLASS_STYLES } from '@/constants/app.constants';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { AI_STYLE_OPTIONS } from '@/constants/ai-styles.constants';
import { GoLiveModal } from '@/components/app/modals';
import { openStageModal } from '@/contexts/StageContext';
import { EmojiGifPicker } from '@/components/app/chat/EmojiGifPicker';
import type { LiveMode, LiveStreamHandoff } from '../types';
import type { AttachedSound } from '../hooks/usePostSound';

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
  /**
   * A stream the composer's own mint just provisioned. Its arrival is what
   * opens the broadcast sheet — there is no setup step any more, so the sheet
   * is only ever entered already on air.
   */
  liveStream?: LiveStreamHandoff | null;
  onInsertFormatting: (format: 'bold' | 'italic' | 'mention') => void;
  onInsertEmoji: (emoji: string) => void;
  onInsertGif: (gifUrl: string) => void;
  onCameraCapture: () => void;
  onEnhanceWithAI: (mode: 'spellcheck' | 'grammar' | 'style', style?: string) => void;
  onPost: () => void;
  canPost: boolean;
  isEnhancing: boolean;
  isPosting?: boolean;
  uploadProgress?: number;
  
  hasText: boolean;
  hasImage?: boolean;
  hasVideo?: boolean;
  isScheduled?: boolean;
  onCloseModal?: () => void;
  onOpenCategories?: () => void;
  onOpenSoundPicker?: () => void;
  attachedSound?: AttachedSound | null;
  onClearSound?: () => void;
  onTogglePoll?: () => void;
  hasPoll?: boolean;
  /** e.g. "7 of 10 free posts left today". Null hides the row entirely. */
  postQuotaLabel?: string | null;
  /** True once today's allowance is spent and the next post costs DHB. */
  postQuotaExhausted?: boolean;
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
  liveStream,
  onInsertFormatting,
  onInsertEmoji,
  onInsertGif,
  onCameraCapture,
  onEnhanceWithAI,
  onPost,
  canPost,
  isEnhancing,
  isPosting,
  uploadProgress,
  
  hasText,
  hasImage,
  hasVideo,
  isScheduled,
  onCloseModal,
  onOpenCategories,
  onOpenSoundPicker,
  attachedSound,
  onClearSound,
  onTogglePoll,
  hasPoll,
  postQuotaLabel,
  postQuotaExhausted,
}: PostActionBarProps) {
  const [audioPopoverOpen, setAudioPopoverOpen] = useState(false);
  const [livePopoverOpen, setLivePopoverOpen] = useState(false);
  const [enhanceSheetOpen, setEnhanceSheetOpen] = useState(false);
  const [styleView, setStyleView] = useState(false);
  const navigate = useNavigate();
  const isLive = liveMode !== null;
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  // One attachment control for both images and video: route the picked files to
  // whichever handler matches the first file's type.
  const handleAttachmentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const first = e.target.files?.[0];
    if (!first) return;
    if (first.type.startsWith('video/')) {
      onVideoSelect(e);
    } else {
      onImageSelect(e);
    }
  };


  const handleSelectLiveMode = (mode: LiveMode) => {
    setLiveMode(mode);
    setLivePopoverOpen(false);
    if (mode === 'townhall') {
      // Close the post modal and open the Stages modal globally
      onCloseModal?.();
      openStageModal('create');
    }
    // A video stream opens nothing: picking Live just puts the composer in live
    // mode, and the composer itself is the setup form. The Go Live sheet now
    // only ever appears already broadcasting, handed a provisioned stream.
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

          <button
            type="button"
            onClick={() => {
              setEnhanceSheetOpen(false);
              setStyleView(false);
              onCloseModal?.();
              navigate('/app/ai');
            }}
            className="flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors"
          >
            <MessageSquare className="w-5 h-5 text-white" />
            Generate Content
          </button>
        </>
      )}
    </div>
  );

  const handleGoLiveModalClose = () => {
    setLiveMode(null);
    // Closes the composer behind it too: the broadcast is over, and the post it
    // was made from was published before the camera ever came on.
    onCloseModal?.();
  };

  const showUploadBar = isPosting && (uploadProgress ?? 0) > 0;

  return (
    <>
      {/* Opened by the arrival of a provisioned stream, never by a button. The
          setup form it used to carry is gone — the composer above is the form. */}
      <GoLiveModal
        isOpen={!!liveStream}
        onClose={handleGoLiveModalClose}
        initialStream={liveStream}
      />

      {/* Upload progress bar — liquid glass bubble style */}
      {showUploadBar && (
        <div className="px-4 pt-2 pb-1">
          <LiquidGlassBubble shimmer={false} noBorder={false} className="w-full">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-white/60">
                {(uploadProgress ?? 0) < 60 ? 'Uploading...' : (uploadProgress ?? 0) < 100 ? 'Publishing...' : 'Done!'}
              </span>
              <span className="text-xs text-white/60 tabular-nums">{uploadProgress ?? 0}%</span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden bg-white/[0.06] border border-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out relative overflow-hidden"
                style={{
                  width: `${uploadProgress ?? 0}%`,
                  background: 'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0.12) 100%)',
                  boxShadow: '0 0 12px rgba(255,255,255,0.12), inset 0 1px 0 rgba(255,255,255,0.18)',
                  borderTop: '1px solid rgba(255,255,255,0.15)',
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 2s infinite linear',
                  }}
                />
              </div>
            </div>
          </LiquidGlassBubble>
        </div>
      )}

      {/* Attached sound chip */}
      {attachedSound && (
        <div className="px-4 py-1.5 border-t border-white/10">
          <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-1.5">
            <Music className="w-3.5 h-3.5 text-white/60 flex-shrink-0" />
            <span className="text-xs text-white/80 truncate flex-1">
              ♪ {attachedSound.title} — {attachedSound.creator}
            </span>
            <button
              type="button"
              onClick={onClearSound}
              className="p-0.5 hover:bg-white/10 rounded transition-colors flex-shrink-0"
            >
              <X className="w-3.5 h-3.5 text-white/50" />
            </button>
          </div>
        </div>
      )}

      {/* Daily posting allowance. Quiet while there is headroom; it only
          speaks up once the next post starts costing DHB. */}
      {postQuotaLabel && !showUploadBar && (
        <div className="px-4 py-1.5 border-t border-white/10">
          <div className="flex items-center gap-2">
            <Gauge
              className={cn(
                'w-3.5 h-3.5 flex-shrink-0',
                postQuotaExhausted ? 'text-white/70' : 'text-white/40',
              )}
            />
            <span
              className={cn(
                'text-xs truncate',
                postQuotaExhausted ? 'text-white/80' : 'text-white/50',
              )}
            >
              {postQuotaLabel}
            </span>
          </div>
        </div>
      )}

    <div className="px-4 py-2 border-t border-white/10 flex items-center justify-between">
      <div className="flex items-center gap-0.5">
        <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={onImageSelect} className="hidden" />
        <input ref={videoInputRef} type="file" accept="video/*" onChange={onVideoSelect} className="hidden" />
        <input ref={audioInputRef} type="file" accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg,audio/m4a,audio/*" onChange={onAudioSelect} className="hidden" />
        <input
          ref={attachmentInputRef}
          type="file"
          accept={hasImage ? 'image/*' : hasVideo ? 'video/*' : 'image/*,video/*'}
          multiple={!hasVideo}
          onChange={handleAttachmentSelect}
          className="hidden"
        />

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

        {/* Attachment button — image and video share one control */}
        {!isLive && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => attachmentInputRef.current?.click()}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
              >
                <Paperclip className="w-5 h-5 text-white" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {hasImage ? 'Add image' : hasVideo ? 'Replace video' : 'Add image or video'}
            </TooltipContent>
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
                {onOpenSoundPicker && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSoundPicker();
                      setAudioPopoverOpen(false);
                    }}
                    className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-all"
                    title="Search Sounds"
                  >
                    <Search className="w-5 h-5 text-white" />
                  </button>
                )}
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
                  title="Stages"
                >
                  <Mic className="w-5 h-5 text-white" />
                </button>
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* Poll button — hidden when live or media attached */}
        {!isLive && !hasVideo && !hasImage && onTogglePoll && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onTogglePoll}
                className={cn('p-2 hover:bg-white/10 rounded-xl transition-colors', hasPoll && 'bg-white/20')}
              >
                <BarChart2 className="w-5 h-5 text-white" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{hasPoll ? 'Remove poll' : 'Add poll'}</TooltipContent>
          </Tooltip>
        )}

        {/* Emoji/GIF picker - single working button */}
        <EmojiGifPicker 
          onEmojiSelect={onInsertEmoji}
          onGifSelect={onInsertGif}
          triggerClassName="h-auto w-auto p-2 rounded-xl text-white backdrop-blur-none hover:bg-white/10 [&_svg]:size-5"
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
          <span className="hidden sm:inline">{isEnhancing ? 'Enhancing...' : 'AI'}</span>
        </Button>
        
        <Drawer open={enhanceSheetOpen} onOpenChange={handleCloseEnhance}>
          <DrawerContent column glass className="border-t border-white/10 max-h-[90vh] max-h-[90dvh]">
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
          // One button, one form. This used to branch to a second Go Live
          // sheet that asked for the title, description and cover all over
          // again — the composer already has them, and the mint provisions the
          // stream, so going live is just posting a live post.
          onClick={onPost}
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