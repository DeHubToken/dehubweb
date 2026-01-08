/**
 * AI Assistant Page
 * =================
 * Dedicated page for the AI assistant with side panels.
 * Auto-detects when to search the web for live content.
 * 
 * RULE: All AI responses MUST be rendered through MarkdownText
 * to ensure proper formatting (bold, italic, lists, etc.)
 */

import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Loader2, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { supabase } from '@/integrations/supabase/client';
import { MarkdownText } from '@/lib/markdown';
import { AI_ASSISTANT_STYLE_OPTIONS } from '@/constants/ai-styles.constants';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<string>('normal');
  const [styleSheetOpen, setStyleSheetOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentStyle = AI_ASSISTANT_STYLE_OPTIONS.find(s => s.id === selectedStyle) || AI_ASSISTANT_STYLE_OPTIONS[0];

  // Generate initial welcome message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        id: 'initial',
        role: 'assistant',
        content: `Hi! I'm your AI assistant. Ask me anything about DeHub, crypto, or general questions. I can also search the web for **live news and current events**! 🌐`
      }]);
    }
  }, []);

  // Scroll to bottom helper
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Auto-scroll to bottom on messages change or loading state
  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

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
      // Single unified endpoint that auto-detects when to search
      const { data, error } = await supabase.functions.invoke('general-ai-chat', {
        body: {
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          })),
          style: selectedStyle
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

  const handleStyleSelect = (styleId: string) => {
    setSelectedStyle(styleId);
    setStyleSheetOpen(false);
  };

  // Style options content - same pattern as PostActionBar enhance menu
  const styleMenuContent = (
    <div className="h-[50vh] overflow-y-auto">
      <div className="flex flex-col pb-4">
        {AI_ASSISTANT_STYLE_OPTIONS.map((style) => (
          <button
            key={style.id}
            type="button"
            onClick={() => handleStyleSelect(style.id)}
            className={`flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors ${
              selectedStyle === style.id ? 'bg-white/10' : ''
            }`}
          >
            <span className="text-lg">{style.emoji}</span>
            {style.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] max-h-[calc(100vh-3.5rem)] lg:h-screen lg:max-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">AI Assistant</h1>
            <p className="text-sm text-white/50">Ask me anything</p>
          </div>
        </div>

        {/* Style Selector Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setStyleSheetOpen(true)}
          className="rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white gap-2 px-3 h-8"
        >
          <span>{currentStyle.emoji}</span>
          <span className="hidden sm:inline">{currentStyle.label}</span>
          <ChevronDown className="w-3 h-3 text-white/50" />
        </Button>

        {/* Style Drawer */}
        <Drawer open={styleSheetOpen} onOpenChange={setStyleSheetOpen}>
          <DrawerContent glass className="border-t border-white/10">
            <DrawerHeader className="border-b border-white/10">
              <DrawerTitle className="text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-white" />
                AI Personality
              </DrawerTitle>
            </DrawerHeader>
            {styleMenuContent}
          </DrawerContent>
        </Drawer>
      </div>

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
                  {message.role === 'assistant' ? (
                    <MarkdownText content={message.content} className="text-sm" />
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
          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
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
            placeholder="Ask me anything..."
            className="flex-1 bg-white/10 border border-white/10 rounded-full px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          
          {/* Style toggle button - visible on mobile */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setStyleSheetOpen(true)}
            className="rounded-full shrink-0 border-white/20 bg-white/5 hover:bg-white/10 sm:hidden"
          >
            <span className="text-base">{currentStyle.emoji}</span>
          </Button>

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
}
