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
import { Send, Sparkles, Loader2, ChevronDown, ImageIcon, X } from 'lucide-react';
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
  imageUrl?: string;       // For generated/edited images in responses
  attachedImage?: string;  // For user-attached images to edit
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

function requiresImageGeneration(message: string, hasAttachedImage: boolean): boolean {
  const lower = message.toLowerCase();
  // If user attached an image, any instruction likely means they want to edit it
  if (hasAttachedImage) return true;
  return IMAGE_KEYWORDS.some(keyword => lower.includes(keyword));
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<string>('normal');
  const [styleSheetOpen, setStyleSheetOpen] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      setAttachedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
    
    // Reset input
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
      // Check if this is an image generation/editing request
      const isImageRequest = requiresImageGeneration(currentInput, !!currentAttachedImage);
      
      if (isImageRequest) {
        // Use generate-image endpoint
        const { data, error } = await supabase.functions.invoke('generate-image', {
          body: {
            prompt: currentInput,
            sourceImage: currentAttachedImage || undefined
          }
        });

        if (error) throw error;

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.text || (currentAttachedImage ? 'Here\'s your edited image!' : 'Here\'s your generated image!'),
          imageUrl: data.imageUrl
        };

        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // Regular chat - use general-ai-chat endpoint
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
      }
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
                        <div className="mt-2">
                          <img 
                            src={message.imageUrl} 
                            alt="Generated" 
                            className="max-w-full rounded-lg"
                          />
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
          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
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
        
        <div className="flex gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />
          
          {/* Image upload button */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full shrink-0 border-white/20 bg-white/5 hover:bg-white/10"
            title="Attach image to edit"
          >
            <ImageIcon className="w-4 h-4 text-white/70" />
          </Button>
          
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={attachedImage ? "Describe how to edit this image..." : "Ask me anything or generate an image..."}
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
