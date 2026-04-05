/**
 * Post AI Chat Component
 * ======================
 * AI chat interface for post context and analysis.
 * Matches the UI of AssistantPage for consistency.
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation as useI18n } from 'react-i18next';
import { X, Send, Sparkles, Loader2, Paperclip, Mic, Square, VolumeX, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUserLanguage } from '@/hooks/use-user-language';
import { useVoiceChat } from '@/hooks/use-voice-chat';
import { useMinimizedChats } from '@/hooks/use-minimized-chats';
import { useOpenChatsRegistry } from '@/hooks/use-open-chats-registry';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MarkdownText } from '@/lib/markdown';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { toast } from 'sonner';
import assistantAvatar from '@/assets/ai-assistant-avatar.png';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface PostContext {
  type: 'image' | 'video' | 'live' | 'post';
  author?: string;
  caption?: string;
  title?: string;
  game?: string;
  viewers?: string;
  thumbnail?: string;
  imageUrl?: string;
  imageUrls?: string[];
  activeImageIndex?: number;
}

interface PostAIChatProps {
  isOpen: boolean;
  onClose: () => void;
  postContext: PostContext;
}

export function PostAIChat({ isOpen, onClose, postContext }: PostAIChatProps) {
  const { walletAddress, openLoginModal } = useAuth();
  // Generate a STABLE chat ID based on post context (not useId which changes on remount)
  const chatId = useMemo(() => {
    const baseId = `${postContext.type}-${postContext.author || 'anon'}`;
    const contentHash = (postContext.title || postContext.caption || 'untitled').slice(0, 20);
    return `ai-chat-${baseId}-${contentHash}`.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
  }, [postContext.type, postContext.author, postContext.title, postContext.caption]);

  const isMobile = useIsMobile();
  const isDesktopOpen = isOpen && !isMobile;
  const { position } = useOpenChatsRegistry(chatId, isDesktopOpen);
  const { t } = useI18n();
  const { language: userLanguage } = useUserLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingVoiceRef = useRef(false);
  
  // Desktop resize state
  const MIN_WIDTH = 300;
  const MAX_WIDTH = 600;
  const [chatWidth, setChatWidth] = useState(380);
  const isResizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(380);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = chatWidth;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = startXRef.current - ev.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + delta));
      setChatWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [chatWidth]);
  
  // Global minimized chats manager
  const { addChat, removeChat, isMinimized } = useMinimizedChats();
  const isThisMinimized = isMinimized(chatId);
  
  // Cleanup orphan entries on unmount
  useEffect(() => {
    return () => {
      // If this chat is minimized when unmounting, remove it to prevent orphans
      if (isMinimized(chatId)) {
        removeChat(chatId);
      }
    };
  }, [chatId, isMinimized, removeChat]);

  // Voice chat hook
  const {
    isRecording,
    isSpeaking,
    transcript,
    startRecording,
    stopRecording,
    stopSpeaking,
    isSupported: isVoiceSupported,
  } = useVoiceChat({
    voicePreference: 'female',
    onTranscript: (text) => {
      if (text.trim()) {
        setInput(text);
        pendingVoiceRef.current = true;
        setTimeout(() => {
          handleVoiceSend(text);
        }, 100);
      }
    },
    onError: (error) => {
      toast.error(error);
    },
  });

  // Generate initial context message
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const contextDescription = getContextDescription(postContext);
      setMessages([{
        id: 'initial',
        role: 'assistant',
        content: t('aiChat.welcomePost', { type: postContext.type, context: contextDescription })
      }]);
    }
  }, [isOpen, postContext]);

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

  const getContextDescription = (ctx: PostContext): string => {
    switch (ctx.type) {
      case 'image': {
        const multiInfo = ctx.imageUrls && ctx.imageUrls.length > 1
          ? ` This post has ${ctx.imageUrls.length} images, and the user is currently viewing image ${(ctx.activeImageIndex ?? 0) + 1} of ${ctx.imageUrls.length}.`
          : '';
        return `It's an image post by @${ctx.author || 'unknown'}${ctx.caption ? `. Caption: "${ctx.caption}"` : ''}${multiInfo}`;
      }
      case 'video':
        return `It's a video titled "${ctx.title || 'a video'}" by ${ctx.author || 'unknown'}`;
      case 'live':
        return `It's a live stream by ${ctx.author || 'unknown'}${ctx.title ? ` titled "${ctx.title}"` : ''}${ctx.game ? ` playing ${ctx.game}` : ''}${ctx.viewers ? ` with ${ctx.viewers} viewers` : ''}`;
      case 'post':
        return `It's a text post by @${ctx.author || 'unknown'}${ctx.caption ? `: "${ctx.caption}"` : ''}`;
      default:
        return '';
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      const { data, error } = await supabase.functions.invoke('general-ai-chat', {
        body: {
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          })),
          postContext,
          userLanguage
        }
      });

      if (error) throw error;

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || t('aiChat.noResponse')
      };

      setMessages(prev => [...prev, assistantMessage]);
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

  const handleVoiceSend = async (voiceText: string) => {
    if (!voiceText.trim() || isLoading) return;
    pendingVoiceRef.current = true;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: voiceText.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('general-ai-chat', {
        body: {
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          })),
          postContext,
          userLanguage
        }
      });

      if (error) throw error;

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || 'I apologize, I couldn\'t generate a response.'
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('AI chat error:', error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      }]);
    } finally {
      setIsLoading(false);
      pendingVoiceRef.current = false;
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
    removeChat(chatId);
    onClose();
  };
  
  const handleMinimize = () => {
    addChat({
      id: chatId,
      title: postContext.title || postContext.caption || `${postContext.type} by ${postContext.author}`,
      type: postContext.type,
      author: postContext.author,
    });
  };
  
  const handleRestore = () => {
    removeChat(chatId);
  };

  const chatContent = (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <ScrollArea className="flex-1 px-4 [&>div>div]:!block [&_[data-radix-scroll-area-scrollbar]]:hidden scrollbar-hide" ref={scrollRef}>
        <div className="py-4 space-y-4">
          <AnimatePresence mode="popLayout">
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start gap-2'}`}
              >
                {/* Assistant avatar */}
                {message.role === 'assistant' && (
                  <img 
                    src={assistantAvatar} 
                    alt="" 
                    className="w-7 h-7 rounded-full shrink-0 mt-0.5"
                  />
                )}
                {message.role === 'user' ? (
                  <LiquidGlassBubble tail="right" className="max-w-[85%]">
                    <p className="text-sm whitespace-pre-wrap text-white">{message.content}</p>
                  </LiquidGlassBubble>
                ) : (
                  <div className="max-w-[85%] rounded-2xl px-4 py-2.5 bg-white/10 text-white">
                    <MarkdownText content={message.content} className="text-sm" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start gap-2"
            >
              <img 
                src={assistantAvatar} 
                alt="" 
                className="w-7 h-7 rounded-full shrink-0"
              />
              <div className="bg-white/10 rounded-2xl px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-white/60" />
                <span className="text-sm text-white/60">{t('aiChat.thinking')}</span>
              </div>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Input - Matching AssistantPage style exactly */}
      <div className="p-4 border-t border-white/10">
        <div className={`flex items-end gap-2 bg-zinc-900/10 backdrop-blur-2xl rounded-2xl px-3 py-2 border shadow-xl transition-all duration-500 ${
          isRecording ? 'border-red-500/50' : 'border-white/10'
        }`}>
          {/* Voice recording button */}
          {isVoiceSupported && (
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isLoading}
              className={`transition-colors p-1 disabled:opacity-30 shrink-0 mb-0.5 ${
                isRecording 
                  ? 'text-red-500' 
                  : 'text-white hover:text-white/80'
              }`}
            >
              {isRecording ? (
                <div className="w-5 h-5 flex items-center justify-center">
                  <Square className="w-3.5 h-3.5 fill-current animate-pulse" />
                </div>
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </button>
          )}
          
          {/* Auto-expanding textarea */}
          <textarea
            ref={inputRef}
            value={isRecording ? transcript : input}
            onChange={(e) => {
              if (!isRecording) {
                setInput(e.target.value);
                // Auto-resize
                const t = e.target;
                requestAnimationFrame(() => {
                  t.style.height = 'auto';
                  const maxHeight = window.innerHeight * 0.3;
                  t.style.height = `${Math.min(t.scrollHeight, maxHeight)}px`;
                });
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={isRecording ? t('aiChat.listening') : t('aiChat.askAboutPost')}
            className={`flex-1 bg-transparent text-sm text-white placeholder:text-white/50 focus:outline-none min-w-0 resize-none overflow-y-auto leading-relaxed py-1 ${
              isRecording ? 'text-white/60 italic' : ''
            }`}
            style={{ 
              minHeight: '24px',
              maxHeight: '30vh'
            }}
            rows={1}
            readOnly={isRecording}
          />
          
          {/* Stop speaking button */}
          {isSpeaking && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={stopSpeaking}
                  className="text-white hover:text-white/80 transition-colors p-1 animate-pulse shrink-0 mb-0.5"
                >
                  <VolumeX className="w-5 h-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t('aiChat.stopSpeaking')}</TooltipContent>
            </Tooltip>
          )}
          
          {/* Send button */}
          <button
            type="button"
            onClick={handleSend}
            disabled={(!input.trim() && !isRecording) || isLoading}
            className="text-white hover:text-white/80 transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed shrink-0 mb-0.5"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );

  // When minimized, don't render anything - global MinimizedAIChats handles the floating button
  if (isThisMinimized) {
    return null;
  }

  // Prompt login if not authenticated
  if (!walletAddress) {
    if (isOpen) {
      onClose();
      openLoginModal();
    }
    return null;
  }

  // Mobile: Drawer - dismissible={false} prevents swipe-to-close
  if (isMobile) {
    return (
      <Drawer open={isOpen && !isThisMinimized} dismissible={false}>
        <DrawerContent glass className="h-[85vh]">
          <DrawerHeader className="border-b border-white/10 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={assistantAvatar} alt="" className="w-8 h-8 rounded-full" />
                <DrawerTitle className="text-white text-base">{t('aiChat.title')}</DrawerTitle>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleMinimize}
                  className="text-white/60 hover:text-white hover:bg-white/10"
                >
                  <Minus className="w-5 h-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClose}
                  className="text-white/60 hover:text-white hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </DrawerHeader>
          {chatContent}
        </DrawerContent>
      </Drawer>
    );
  }

  // Desktop: Fixed bottom-right chat box (MSN-style), stacking side by side

  const CHAT_GAP = 12;
  const rightOffset = 16 + (position >= 0 ? position : 0) * (chatWidth + CHAT_GAP);

  return createPortal(
    <AnimatePresence>
      {isOpen && !isThisMinimized && (
        <motion.div
          key={chatId}
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-4 z-50 flex flex-col bg-black/60 backdrop-blur-[24px] saturate-[180%] border border-white/10 shadow-2xl rounded-2xl overflow-hidden"
          style={{
            right: `${rightOffset}px`,
            width: `${chatWidth}px`,
            height: '520px',
          }}
        >
          {/* Resize handle — top-left corner */}
          <div
            onMouseDown={handleResizeStart}
            className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize z-10 group"
          >
            <div className="absolute top-1 left-1 w-2 h-2 rounded-sm bg-white/0 group-hover:bg-white/30 transition-colors" />
          </div>
          {/* Left edge resize handle */}
          <div
            onMouseDown={handleResizeStart}
            className="absolute top-0 left-0 w-1.5 h-full cursor-ew-resize z-10 hover:bg-white/10 transition-colors"
          />

          {/* Header */}
          <div className="p-3 border-b border-white/10 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img src={assistantAvatar} alt="" className="w-7 h-7 rounded-full" />
                <span className="text-white text-sm font-medium truncate max-w-[200px]">{t('aiChat.title')}</span>
              </div>
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleMinimize}
                  className="text-white/60 hover:text-white hover:bg-white/10 h-7 w-7"
                >
                  <Minus className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClose}
                  className="text-white/60 hover:text-white hover:bg-white/10 h-7 w-7"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            {chatContent}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
