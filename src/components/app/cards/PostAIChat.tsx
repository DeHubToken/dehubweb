/**
 * Post AI Chat Component
 * ======================
 * Grok-style AI chat interface for post context and analysis.
 */

import { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { MarkdownText } from '@/lib/markdown';

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
  const isMobile = useIsMobile();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Generate initial context message
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const contextDescription = getContextDescription(postContext);
      setMessages([{
        id: 'initial',
        role: 'assistant',
        content: `I can see this ${postContext.type}. ${contextDescription}\n\nWhat would you like to know about it?`
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

    try {
      // Use the unified general-ai-chat endpoint with post context
      const { data, error } = await supabase.functions.invoke('general-ai-chat', {
        body: {
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          })),
          postContext
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
    onClose();
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
                  className={`max-w-[85%] ${
                    message.role === 'user'
                      ? 'relative group'
                      : ''
                  }`}
                >
                  {message.role === 'user' ? (
                    /* User message with liquid glass bubble */
                    <div className="relative px-4 py-2.5 rounded-2xl rounded-br-md overflow-hidden
                      bg-gradient-to-br from-white/20 via-white/10 to-white/5
                      backdrop-blur-xl border border-white/30
                      shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]
                      before:absolute before:inset-0 before:rounded-2xl before:rounded-br-md
                      before:bg-gradient-to-br before:from-white/10 before:via-transparent before:to-transparent
                      before:pointer-events-none
                      after:absolute after:inset-[1px] after:rounded-2xl after:rounded-br-md
                      after:bg-gradient-to-b after:from-white/5 after:to-transparent
                      after:pointer-events-none"
                    >
                      <p className="text-sm whitespace-pre-wrap text-white relative z-10">{message.content}</p>
                    </div>
                  ) : (
                    /* Assistant message */
                    <div className="bg-white/10 rounded-2xl px-4 py-2.5">
                      <MarkdownText content={message.content} className="text-sm" />
                    </div>
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
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this post..."
            className="flex-1 bg-white/10 border border-white/10 rounded-full px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="rounded-full shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DrawerContent glass className="h-[85vh]">
          <DrawerHeader className="border-b border-white/10 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-white" />
                <DrawerTitle className="text-white">AI Assistant</DrawerTitle>
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
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg h-[600px] p-0 bg-black/40 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col">
        <DialogHeader className="p-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-white" />
            <DialogTitle className="text-white">AI Assistant</DialogTitle>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          {chatContent}
        </div>
      </DialogContent>
    </Dialog>
  );
}
