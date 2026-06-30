import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import robotAvatar from '@/assets/robot-avatar.png';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

// Simple markdown parser for chat messages
const parseMarkdown = (text: string): React.ReactNode[] => {
  const parts: React.ReactNode[] = [];
  let key = 0;
  
  // Split by lines first to handle lists
  const lines = text.split('\n');
  
  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) {
      parts.push(<br key={`br-${key++}`} />);
    }
    
    // Handle bullet points
    if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
      const content = line.trim().slice(2);
      parts.push(
        <span key={`bullet-${key++}`} className="flex gap-1">
          <span>•</span>
          <span>{parseInlineMarkdown(content)}</span>
        </span>
      );
      return;
    }
    
    // Handle numbered lists
    const numberedMatch = line.trim().match(/^(\d+)\.\s+(.+)$/);
    if (numberedMatch) {
      parts.push(
        <span key={`num-${key++}`} className="flex gap-1">
          <span>{numberedMatch[1]}.</span>
          <span>{parseInlineMarkdown(numberedMatch[2])}</span>
        </span>
      );
      return;
    }
    
    // Regular line with inline formatting
    parts.push(<span key={`line-${key++}`}>{parseInlineMarkdown(line)}</span>);
  });
  
  return parts;
};

// Parse inline markdown (bold, italic, code)
const parseInlineMarkdown = (text: string): React.ReactNode[] => {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  
  while (remaining.length > 0) {
    // Bold: **text** or __text__
    const boldMatch = remaining.match(/^(.*?)(\*\*|__)(.+?)\2(.*)$/s);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(boldMatch[1]);
      parts.push(<strong key={`bold-${key++}`}>{boldMatch[3]}</strong>);
      remaining = boldMatch[4];
      continue;
    }
    
    // Italic: *text* or _text_ (not preceded by * or _)
    const italicMatch = remaining.match(/^(.*?)(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)(.*)$/s);
    if (italicMatch) {
      if (italicMatch[1]) parts.push(italicMatch[1]);
      parts.push(<em key={`italic-${key++}`}>{italicMatch[2]}</em>);
      remaining = italicMatch[3];
      continue;
    }
    
    // Inline code: `code`
    const codeMatch = remaining.match(/^(.*?)`([^`]+)`(.*)$/s);
    if (codeMatch) {
      if (codeMatch[1]) parts.push(codeMatch[1]);
      parts.push(
        <code key={`code-${key++}`} className="bg-slate-200 px-1 py-0.5 rounded text-xs font-mono">
          {codeMatch[2]}
        </code>
      );
      remaining = codeMatch[3];
      continue;
    }
    
    // No more matches, add remaining text
    parts.push(remaining);
    break;
  }
  
  return parts;
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/docs-chat`;

export const DocsChatBot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hi! I\'m DeHub\'s documentation assistant. Ask me anything about DeHub, the $DHB token, DePIN, governance, or any other platform features!' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOpen && chatWindowRef.current && !chatWindowRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const streamChat = async (userMessages: Message[]) => {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages: userMessages }),
    });

    if (resp.status === 429) {
      throw new Error("Rate limited. Please wait a moment and try again.");
    }
    if (resp.status === 402) {
      throw new Error("Service temporarily unavailable. Please try again later.");
    }
    if (!resp.ok || !resp.body) {
      throw new Error("Failed to get response");
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let assistantContent = "";
    let streamDone = false;

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") {
          streamDone = true;
          break;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) {
            assistantContent += content;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && prev.length > 1) {
                return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantContent } : m));
              }
              return [...prev, { role: "assistant", content: assistantContent }];
            });
          }
        } catch {
          textBuffer = line + "\n" + textBuffer;
          break;
        }
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      await streamChat(newMessages.slice(1)); // Skip the initial greeting
    } catch (error) {
      console.error('Chat error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message. Please try again.",
      });
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

  return (
    <>
      {/* Chat Toggle Button */}
      <div
        role="button"
        aria-label="Open chat"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-6 right-6 z-50 transition-all duration-300 hover:scale-110",
          isOpen && "scale-0 opacity-0"
        )}
      >
        <LiquidGlassBubble2
          label=""
          icon={<MessageCircle className="w-6 h-6" />}
          width="56px"
          height="56px"
        />
      </div>

      {/* Chat Window */}
      <div
        ref={chatWindowRef}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-48px)] h-[500px] max-h-[calc(100vh-120px)]",
          "bg-card rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden",
          "transition-all duration-300 transform origin-bottom-right",
          isOpen ? "scale-100 opacity-100" : "scale-0 opacity-0 pointer-events-none"
        )}
      >
        {/* Header */}
        <div className="p-3 flex items-center justify-between border-b border-border">
          <span className="text-sm font-semibold text-foreground">AI Assistant</span>
          <button
            onClick={() => setIsOpen(false)}
            className="w-8 h-8 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
            aria-label="Close chat"
          >
            <X className="w-4 h-4 text-foreground" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={cn(
                "flex gap-3",
                message.role === 'user' ? "flex-row-reverse" : "flex-row"
              )}
            >
              {message.role === 'user' ? (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-muted"
                >
                  <User className="w-4 h-4 text-foreground" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                  <img src={robotAvatar} alt="Assistant" className="w-full h-full object-cover" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  message.role === 'user'
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted text-foreground rounded-bl-md"
                )}
              >
                {message.role === 'assistant' ? parseMarkdown(message.content) : message.content}
              </div>
            </div>
          ))}
          {isLoading && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                <img src={robotAvatar} alt="Assistant" className="w-full h-full object-cover" />
              </div>
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5">
                <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border bg-muted/50">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about DeHub..."
              className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              disabled={isLoading}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="rounded-xl bg-background border border-border text-foreground hover:bg-muted w-10 h-10 disabled:opacity-100 disabled:bg-background disabled:text-foreground"
            >
              <Send className="w-4 h-4 text-foreground" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};
