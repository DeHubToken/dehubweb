/**
 * Post AI Chat Component
 * ======================
 * AI chat interface for post context and analysis.
 * Matches the UI of AssistantPage for consistency.
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation as useI18n } from 'react-i18next';
import { X, Send, Sparkles, Loader2, Paperclip, Mic, Square, VolumeX, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUserLanguage } from '@/hooks/use-user-language';
import { useVoiceChat } from '@/hooks/use-voice-chat';
import { useMinimizedChats } from '@/hooks/use-minimized-chats';
import { supabase } from '@/integrations/supabase/client';
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
}

interface PostAIChatProps {
  isOpen: boolean;
  onClose: () => void;
  postContext: PostContext;
}

export function PostAIChat({ isOpen, onClose, postContext }: PostAIChatProps) {
  // Generate a STABLE chat ID based on post context (not useId which changes on remount)
  const chatId = useMemo(() => {
    const baseId = `${postContext.type}-${postContext.author || 'anon'}`;
    const contentHash = (postContext.title || postContext.caption || 'untitled').slice(0, 20);
    return `ai-chat-${baseId}-${contentHash}`.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
  }, [postContext.type, postContext.author, postContext.title, postContext.caption]);

  const isMobile = useIsMobile();
  const { t } = useI18n();
  const { language: userLanguage } = useUserLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingVoiceRef = useRef(false);
  
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
      case 'image':
        return `It's an image post by @${ctx.author || 'unknown'}${ctx.caption ? `. Caption: "${ctx.caption}"` : ''}`;
      case 'video':
        return `It's a video titled "${ctx.title || 'Untitled'}" by ${ctx.author || 'unknown'}`;
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
                e.target.style.height = 'auto';
                const maxHeight = window.innerHeight * 0.3;
                const newHeight = Math.min(e.target.scrollHeight, maxHeight);
                e.target.style.height = `${newHeight}px`;
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
                  className="text-cyan-400 hover:text-cyan-300 transition-colors p-1 animate-pulse shrink-0 mb-0.5"
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

  // Desktop: Dialog - prevent accidental closes via escape/outside click
  return (
    <Dialog open={isOpen && !isThisMinimized}>
      <DialogContent 
        hideCloseButton 
        className="max-w-lg h-[600px] p-0 bg-black/60 backdrop-blur-[24px] saturate-[180%] border border-white/10 shadow-2xl flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="p-4 border-b border-white/10 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={assistantAvatar} alt="" className="w-8 h-8 rounded-full" />
              <DialogTitle className="text-white text-base">{t('aiChat.title')}</DialogTitle>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleMinimize}
                className="text-white/60 hover:text-white hover:bg-white/10 h-8 w-8"
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="text-white/60 hover:text-white hover:bg-white/10 h-8 w-8"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          {chatContent}
        </div>
      </DialogContent>
    </Dialog>
  );
}
