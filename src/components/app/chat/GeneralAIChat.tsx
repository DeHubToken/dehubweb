/**
 * General AI Chat Component
 * =========================
 * Grok-style AI chat interface for general questions.
 * 
 * RULE: All AI responses MUST be rendered through MarkdownText
 * to ensure proper formatting (bold, italic, lists, etc.)
 */

import { useState, useRef, useEffect } from 'react';
import { useTranslation as useI18n } from 'react-i18next';
import { X, Send, Sparkles, Loader2, ImageIcon, Share } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MarkdownText } from '@/lib/markdown';
import { PostModal } from '@/features/post';
import ftvLogoSymbol from '@/assets/ftv-logo-symbol.png';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  attachedImage?: string;
}

// Keywords that indicate image generation/editing request
const IMAGE_KEYWORDS = [
  'generate image', 'create image', 'make image', 'draw', 'design',
  'create a picture', 'make a picture', 'generate a picture',
  'create artwork', 'make art', 'edit this image', 'modify this',
  'change this image', 'put', 'add to this image', 'remove from',
  'generate an image', 'create an image', 'make an image',
  'generate a', 'create a', 'draw a', 'draw me', 'make me',
  'photo of', 'picture of', 'image of', 'illustration of'
];

// Keywords that indicate user wants to use the official logo in their image
const LOGO_KEYWORDS = [
  'dehub logo', 'the dehub logo', 'ftv logo', 'the ftv logo',
  'your logo', 'the logo', 'official logo', 'dehub brand', 
  'ftv brand', 'brand logo', 'company logo'
];

function requiresImageGeneration(message: string, hasAttachedImage: boolean): boolean {
  const lower = message.toLowerCase();
  if (hasAttachedImage) return true;
  return IMAGE_KEYWORDS.some(keyword => lower.includes(keyword));
}

function requiresLogoAsset(message: string): boolean {
  const lower = message.toLowerCase();
  return LOGO_KEYWORDS.some(keyword => lower.includes(keyword));
}

// Check if logo request also wants something creative (not just "show me the logo")
function isCreativeLogoRequest(message: string): boolean {
  const lower = message.toLowerCase();
  const simpleShowPatterns = [
    /^show\s*(me\s*)?(the\s*)?(dehub|ftv|your|official|brand|company)?\s*logo\.?$/,
    /^(dehub|ftv)\s*logo\.?$/,
    /^(the\s*)?(dehub|ftv|official)\s*logo\.?$/,
    /^display\s*(the\s*)?(dehub|ftv)?\s*logo\.?$/
  ];
  
  if (simpleShowPatterns.some(pattern => pattern.test(lower.trim()))) {
    return false;
  }
  return true;
}

// Convert an image URL to base64 data URL
async function imageUrlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

interface GeneralAIChatProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GeneralAIChat({ isOpen, onClose }: GeneralAIChatProps) {
  const { walletAddress, openLoginModal } = useAuth();
  const isMobile = useIsMobile();
  const { t } = useI18n();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [postModalFiles, setPostModalFiles] = useState<FileList | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generate initial welcome message
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        id: 'initial',
        role: 'assistant',
        content: t('aiChat.welcomeGeneral')
      }]);
    }
  }, [isOpen]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      setAttachedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      attachedImage: attachedImage || undefined
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input.trim();
    const currentAttachedImage = attachedImage;
    setInput('');
    setAttachedImage(null);
    setIsLoading(true);

    try {
      // Check if user wants to use the official logo in their image
      const wantsLogo = requiresLogoAsset(currentInput);
      const isCreativeLogo = wantsLogo && isCreativeLogoRequest(currentInput);
      
      // If just asking "show me the logo" without creative context, display it directly
      if (wantsLogo && !isCreativeLogo) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: t('aiChat.officialLogo'),
          imageUrl: ftvLogoSymbol
        };
        setMessages(prev => [...prev, assistantMessage]);
        setIsLoading(false);
        return;
      }
      
      // If creative logo request, convert logo to base64 and use as source image
      let effectiveSourceImage = currentAttachedImage;
      if (isCreativeLogo) {
        effectiveSourceImage = await imageUrlToBase64(ftvLogoSymbol);
      }
      const isImageRequest = isCreativeLogo || requiresImageGeneration(currentInput, !!currentAttachedImage);
      
      if (isImageRequest) {
        const { data, error } = await supabase.functions.invoke('generate-image', {
          body: {
            prompt: currentInput,
            sourceImage: effectiveSourceImage || undefined
          }
        });

        if (error) throw error;
        
        // Check for error in response (like safety blocks)
        if (data.error) {
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: data.error
          }]);
          return;
        }

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.text || (currentAttachedImage ? t('aiChat.editedImage') : t('aiChat.generatedImage')),
          imageUrl: data.imageUrl
        };

        setMessages(prev => [...prev, assistantMessage]);
      } else {
        const { data, error } = await supabase.functions.invoke('general-ai-chat', {
          body: {
            messages: [...messages, userMessage].map(m => ({
              role: m.role,
              content: m.content
            }))
          }
        });

        if (error) throw error;

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.response || t('aiChat.noResponse')
        };

        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('AI chat error:', error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: t('aiChat.errorGeneric')
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClose = () => {
    setMessages([]);
    setInput('');
    setAttachedImage(null);
    onClose();
  };

  // Convert base64 image to FileList for PostModal
  const handlePostImage = async (imageUrl: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], 'ai-generated-image.png', { type: 'image/png' });
      
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      
      setPostModalFiles(dataTransfer.files);
      setPostModalOpen(true);
    } catch (error) {
      console.error('Error preparing image for post:', error);
    }
  };

  const chatContent = (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <ScrollArea className="flex-1 px-4 [&>div>div]:!block [&_[data-radix-scroll-area-scrollbar]]:hidden" ref={scrollRef}>
        <div className="py-4 space-y-4">
          <AnimatePresence mode="popLayout">
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-white/10 text-white'
                  }`}
                >
                  {/* Show attached image for user messages */}
                  {message.attachedImage && (
                    <div className="mb-2">
                      <img 
                        src={message.attachedImage} 
                        alt="Attached" 
                        className="max-w-full max-h-48 rounded-lg object-contain"
                      />
                    </div>
                  )}
                  {message.role === 'assistant' ? (
                    <>
                      <MarkdownText content={message.content} className="text-sm" />
                      {/* Show generated image for assistant messages */}
                      {message.imageUrl && (
                        <div className="mt-2 space-y-2">
                          <img 
                            src={message.imageUrl} 
                            alt="Generated" 
                            className="max-w-full rounded-lg"
                          />
                          <Button
                            size="sm"
                            onClick={() => handlePostImage(message.imageUrl!)}
                            className="w-full gap-2 rounded-full"
                          >
                            <Share className="w-4 h-4" />
                            {t('aiChat.post')}
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="bg-white/10 rounded-2xl px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-white/60" />
              </div>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-white/10">
        {/* Attached image preview */}
        {attachedImage && (
          <div className="mb-2 relative inline-block">
            <img 
              src={attachedImage} 
              alt="Attached" 
              className="max-h-24 rounded-lg object-contain"
            />
            <button
              onClick={() => setAttachedImage(null)}
              className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        )}
        
        <div className="flex gap-1.5 sm:gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />
          
          {/* Image upload button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full shrink-0 border-white/20 bg-white/5 hover:bg-white/10 w-9 h-9 sm:w-10 sm:h-10"
              >
                <ImageIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/70" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('aiChat.attachImage')}</TooltipContent>
          </Tooltip>
          
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={attachedImage ? t('aiChat.describeEdits') : t('aiChat.askAnything')}
            className="flex-1 bg-white/10 border border-white/10 rounded-full px-3 py-2 sm:px-4 sm:py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="rounded-full shrink-0 w-9 h-9 sm:w-10 sm:h-10"
          >
            <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  // Prompt login if not authenticated
  if (!walletAddress) {
    if (isOpen) {
      onClose();
      openLoginModal();
    }
    return null;
  }

  if (isMobile) {
    return (
      <>
        <Drawer open={isOpen} onOpenChange={(open) => !open && handleClose()}>
          <DrawerContent glass className="h-[85vh]">
            <DrawerHeader className="border-b border-white/10 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-white" />
                  <DrawerTitle className="text-white">{t('aiChat.title')}</DrawerTitle>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClose}
                  className="text-white/60 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </DrawerHeader>
            {chatContent}
          </DrawerContent>
        </Drawer>

        <PostModal
          isOpen={postModalOpen}
          onClose={() => setPostModalOpen(false)}
          initialFiles={postModalFiles}
          onFilesProcessed={() => setPostModalFiles(null)}
        />
      </>
    );
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-lg h-[600px] p-0 bg-black/40 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col">
          <DialogHeader className="p-4 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-white" />
              <DialogTitle className="text-white">{t('aiChat.title')}</DialogTitle>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {chatContent}
          </div>
        </DialogContent>
      </Dialog>

      <PostModal
        isOpen={postModalOpen}
        onClose={() => setPostModalOpen(false)}
        initialFiles={postModalFiles}
        onFilesProcessed={() => setPostModalFiles(null)}
      />
    </>
  );
}
