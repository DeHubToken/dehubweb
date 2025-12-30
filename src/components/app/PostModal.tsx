import { useState, useRef } from 'react';
import { X, Image, Film, Radio, Lock, Bold, Italic, AtSign, Smile, MapPin, Sparkles, Loader2, Coins, Play, Shield } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { useIsMobile } from '@/hooks/use-mobile';

interface PostModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type MediaType = 'image' | 'video' | 'live' | null;

interface MediaFile {
  file: File;
  preview: string;
  type: 'image' | 'video';
  duration?: number;
}

export function PostModal({ isOpen, onClose }: PostModalProps) {
  const isMobile = useIsMobile();
  const [text, setText] = useState('');
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [isSubscribersOnly, setIsSubscribersOnly] = useState(false);
  const [isPPV, setIsPPV] = useState(false);
  const [isWatch2Earn, setIsWatch2Earn] = useState(false);
  const [isTokenGated, setIsTokenGated] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasVideo = media.some(m => m.type === 'video');
  const hasImage = media.some(m => m.type === 'image');
  const isShort = hasVideo && media.some(m => m.type === 'video' && m.duration && m.duration < 90);

  const getPostDestinations = () => {
    const destinations: string[] = ['Home'];
    if (hasImage) destinations.push('Images');
    if (hasVideo) {
      destinations.push('Videos');
      if (isShort) destinations.push('Shorts');
    }
    if (isLive) destinations.push('Live');
    return destinations;
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const preview = URL.createObjectURL(file);
      setMedia(prev => [...prev, { file, preview, type: 'image' }]);
    });
    e.target.value = '';
  };

  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const preview = URL.createObjectURL(file);
      
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = preview;
      
      const duration = await new Promise<number>((resolve) => {
        video.onloadedmetadata = () => {
          resolve(video.duration);
        };
      });

      setMedia(prev => [...prev, { file, preview, type: 'video', duration }]);
    }
    e.target.value = '';
  };

  const removeMedia = (index: number) => {
    setMedia(prev => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleEnhanceWithAI = async () => {
    if (!text.trim()) return;
    setIsEnhancing(true);
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const enhanced = text
      .split('. ')
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join('. ');
    
    setText(enhanced);
    setIsEnhancing(false);
  };

  const insertFormatting = (format: 'bold' | 'italic' | 'mention') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = text.substring(start, end);

    let newText = '';
    let cursorOffset = 0;

    switch (format) {
      case 'bold':
        newText = text.substring(0, start) + `**${selectedText}**` + text.substring(end);
        cursorOffset = selectedText ? 4 : 2;
        break;
      case 'italic':
        newText = text.substring(0, start) + `_${selectedText}_` + text.substring(end);
        cursorOffset = selectedText ? 2 : 1;
        break;
      case 'mention':
        newText = text.substring(0, start) + `@${selectedText}` + text.substring(end);
        cursorOffset = 1;
        break;
    }

    setText(newText);
    
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = selectedText ? end + cursorOffset : start + cursorOffset;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handlePost = () => {
    console.log('Posting to:', getPostDestinations());
    console.log('Content:', { text, media, isSubscribersOnly, isLive });
    
    setText('');
    setMedia([]);
    setIsSubscribersOnly(false);
    setIsLive(false);
    onClose();
  };

  const handleClose = () => {
    setText('');
    setMedia([]);
    setIsSubscribersOnly(false);
    setIsLive(false);
    onClose();
  };

  const destinations = getPostDestinations();
  const canPost = text.trim() || media.length > 0 || isLive;

  // Shared content component
  const ModalContent = () => (
    <>
      {/* Content Area */}
      <div className="p-4 max-h-[60vh] overflow-y-auto">
        <div className="flex gap-3">
          <Avatar className="w-10 h-10 flex-shrink-0">
            <AvatarImage src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100" />
            <AvatarFallback>U</AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What's happening?"
              className="w-full bg-transparent text-white text-lg placeholder:text-zinc-500 resize-none outline-none min-h-[80px]"
              rows={3}
            />

            <AnimatePresence>
              {media.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 grid gap-2"
                  style={{
                    gridTemplateColumns: media.length === 1 ? '1fr' : 'repeat(2, 1fr)',
                  }}
                >
                  {media.map((m, index) => (
                    <div key={index} className="relative rounded-xl overflow-hidden bg-zinc-900">
                      {m.type === 'image' ? (
                        <img src={m.preview} alt="" className="w-full h-32 object-cover" />
                      ) : (
                        <div className="relative">
                          <video src={m.preview} className="w-full h-32 object-cover" />
                          {m.duration && (
                            <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-0.5 rounded text-xs text-white">
                              {Math.floor(m.duration / 60)}:{String(Math.floor(m.duration % 60)).padStart(2, '0')}
                              {m.duration < 90 && <span className="ml-1 text-emerald-400">• Short</span>}
                            </div>
                          )}
                        </div>
                      )}
                      <button
                        onClick={() => removeMedia(index)}
                        className="absolute top-2 right-2 p-1 bg-black/70 hover:bg-black rounded-full transition-colors"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {isLive && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2"
                >
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-red-400 text-sm font-medium">Live stream will be created</span>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {canPost && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mt-2 flex items-center gap-1.5 flex-wrap"
                >
                  <span className="text-xs text-zinc-500">In:</span>
                  {destinations.map(dest => (
                    <span
                      key={dest}
                      className={cn(
                        "text-xs px-1.5 py-0.5 rounded-full",
                        dest === 'Shorts' ? 'bg-emerald-500/20 text-emerald-400' :
                        dest === 'Live' ? 'bg-red-500/20 text-red-400' :
                        'bg-zinc-800 text-zinc-400'
                      )}
                    >
                      {dest}
                    </span>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Content Access Toggles */}
      <div className="px-4 py-2 border-t border-white/10 space-y-0.5">
        <div className="flex items-center justify-between py-0.5">
          <div className="flex items-center gap-2">
            <Lock className={cn("w-4 h-4", isSubscribersOnly ? "text-amber-400" : "text-zinc-500")} />
            <span className={cn("text-sm", isSubscribersOnly ? "text-amber-400" : "text-zinc-400")}>Subscribers only</span>
          </div>
          <Switch checked={isSubscribersOnly} onCheckedChange={setIsSubscribersOnly} className="data-[state=checked]:bg-amber-500 scale-75" />
        </div>

        <div className="flex items-center justify-between py-0.5">
          <div className="flex items-center gap-2">
            <Coins className={cn("w-4 h-4", isPPV ? "text-emerald-400" : "text-zinc-500")} />
            <span className={cn("text-sm", isPPV ? "text-emerald-400" : "text-zinc-400")}>PPV</span>
          </div>
          <Switch checked={isPPV} onCheckedChange={setIsPPV} className="data-[state=checked]:bg-emerald-500 scale-75" />
        </div>

        <div className="flex items-center justify-between py-0.5">
          <div className="flex items-center gap-2">
            <Play className={cn("w-4 h-4", isWatch2Earn ? "text-blue-400" : "text-zinc-500")} />
            <span className={cn("text-sm", isWatch2Earn ? "text-blue-400" : "text-zinc-400")}>Watch2Earn</span>
          </div>
          <Switch checked={isWatch2Earn} onCheckedChange={setIsWatch2Earn} className="data-[state=checked]:bg-blue-500 scale-75" />
        </div>

        <div className="flex items-center justify-between py-0.5">
          <div className="flex items-center gap-2">
            <Shield className={cn("w-4 h-4", isTokenGated ? "text-purple-400" : "text-zinc-500")} />
            <span className={cn("text-sm", isTokenGated ? "text-purple-400" : "text-zinc-400")}>Token Gated</span>
          </div>
          <Switch checked={isTokenGated} onCheckedChange={setIsTokenGated} className="data-[state=checked]:bg-purple-500 scale-75" />
        </div>
      </div>

      {/* Action Bar */}
      <div className="px-4 py-2 border-t border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-0.5">
          <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
          <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoSelect} className="hidden" />
          
          <button onClick={() => imageInputRef.current?.click()} className="p-2 hover:bg-white/10 rounded-full transition-colors" title="Add image">
            <Image className="w-5 h-5 text-blue-400" />
          </button>
          
          <button onClick={() => videoInputRef.current?.click()} className="p-2 hover:bg-white/10 rounded-full transition-colors" title="Add video">
            <Film className="w-5 h-5 text-purple-400" />
          </button>
          
          <button onClick={() => setIsLive(!isLive)} className={cn("p-2 hover:bg-white/10 rounded-full transition-colors", isLive && "bg-red-500/20")} title="Go live">
            <Radio className={cn("w-5 h-5", isLive ? "text-red-500" : "text-red-400")} />
          </button>

          <div className="w-px h-4 bg-white/10 mx-1" />

          <button onClick={() => insertFormatting('bold')} className="p-1.5 hover:bg-white/10 rounded-full transition-colors" title="Bold">
            <Bold className="w-4 h-4 text-zinc-400" />
          </button>
          
          <button onClick={() => insertFormatting('italic')} className="p-1.5 hover:bg-white/10 rounded-full transition-colors" title="Italic">
            <Italic className="w-4 h-4 text-zinc-400" />
          </button>
          
          <button onClick={() => insertFormatting('mention')} className="p-1.5 hover:bg-white/10 rounded-full transition-colors" title="Mention">
            <AtSign className="w-4 h-4 text-zinc-400" />
          </button>

          <button className="p-1.5 hover:bg-white/10 rounded-full transition-colors" title="Emoji">
            <Smile className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleEnhanceWithAI}
            disabled={!text.trim() || isEnhancing}
            className="rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white gap-1.5 text-xs px-3 h-8"
          >
            {isEnhancing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {isEnhancing ? 'AI...' : 'Enhance'}
          </Button>
          
          <Button
            onClick={handlePost}
            disabled={!canPost}
            className="rounded-full px-4 h-8 bg-white text-black hover:bg-zinc-200 font-semibold disabled:opacity-50 text-sm"
          >
            Post
          </Button>
        </div>
      </div>

      {/* Character Count */}
      <div className="px-4 pb-3 flex justify-end">
        <span className={cn("text-xs", text.length > 280 ? "text-amber-400" : "text-zinc-500")}>
          {text.length}/280
        </span>
      </div>
    </>
  );

  // Use Drawer for mobile/tablet, Dialog for desktop
  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={handleClose}>
        <DrawerContent glass className="max-h-[90vh]">
          <VisuallyHidden>
            <DrawerTitle>Create a post</DrawerTitle>
          </VisuallyHidden>
          <ModalContent />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] p-0 bg-black border-zinc-800 overflow-hidden">
        <VisuallyHidden>
          <DialogTitle>Create a post</DialogTitle>
        </VisuallyHidden>
        <ModalContent />
      </DialogContent>
    </Dialog>
  );
}