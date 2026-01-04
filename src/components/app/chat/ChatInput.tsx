import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Image, Send, Sparkles, Loader2, X } from 'lucide-react';
import { EmojiPicker } from './EmojiPicker';
import { GifPicker } from './GifPicker';
import { toast } from 'sonner';

interface ChatInputProps {
  onSendMessage: (content: string, type: 'text' | 'image' | 'gif', imageUrl?: string) => void;
}

export function ChatInput({ onSendMessage }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (imagePreview) {
      onSendMessage(message.trim(), 'image', imagePreview);
      setImagePreview(null);
      setMessage('');
      return;
    }
    
    if (!message.trim()) return;
    onSendMessage(message.trim(), 'text');
    setMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setMessage(prev => prev + emoji);
    textareaRef.current?.focus();
  };

  const handleGifSelect = (gifUrl: string) => {
    onSendMessage('', 'gif', gifUrl);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be less than 5MB');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEnhanceText = async () => {
    if (!message.trim()) {
      toast.error('Enter some text to enhance');
      return;
    }
    
    setIsEnhancing(true);
    
    // Simulate AI enhancement - in production, call an API
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simple mock enhancement: capitalize first letter, fix common typos, add punctuation
    let enhanced = message.trim();
    
    // Capitalize first letter of sentences
    enhanced = enhanced.replace(/(^|[.!?]\s+)([a-z])/g, (match, p1, p2) => p1 + p2.toUpperCase());
    
    // Ensure first letter is capitalized
    enhanced = enhanced.charAt(0).toUpperCase() + enhanced.slice(1);
    
    // Add period if missing punctuation at end
    if (!/[.!?]$/.test(enhanced)) {
      enhanced += '.';
    }
    
    // Common typo fixes
    const typoFixes: Record<string, string> = {
      'teh': 'the',
      'dont': "don't",
      'cant': "can't",
      'wont': "won't",
      'im': "I'm",
      'youre': "you're",
      'theyre': "they're",
      'thats': "that's",
      'whats': "what's",
      'heres': "here's",
      'ur': 'your',
      'u': 'you',
      'r': 'are',
      'thx': 'thanks',
      'pls': 'please',
      'bc': 'because',
      'b4': 'before',
      'w/': 'with',
    };
    
    Object.entries(typoFixes).forEach(([typo, fix]) => {
      const regex = new RegExp(`\\b${typo}\\b`, 'gi');
      enhanced = enhanced.replace(regex, fix);
    });
    
    setMessage(enhanced);
    setIsEnhancing(false);
    toast.success('Text enhanced!');
    textareaRef.current?.focus();
  };

  const removeImagePreview = () => {
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="p-3 border-t border-zinc-700 bg-zinc-900">
      {/* Image Preview */}
      {imagePreview && (
        <div className="mb-2 relative inline-block">
          <img 
            src={imagePreview} 
            alt="Preview" 
            className="h-20 rounded-lg object-cover"
          />
          <button
            onClick={removeImagePreview}
            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      )}
      
      {/* Input Area */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Textarea
            ref={textareaRef}
            placeholder="Type a message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[32px] max-h-32 resize-none bg-transparent border-none text-white placeholder:text-zinc-500 p-0 pt-[2px] focus-visible:ring-0 focus-visible:ring-offset-0"
            rows={1}
          />
        </div>
        
        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <EmojiPicker onEmojiSelect={handleEmojiSelect} />
          
          <GifPicker onGifSelect={handleGifSelect} />
          
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
            onClick={() => fileInputRef.current?.click()}
          >
            <Image className="w-5 h-5" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
            onClick={handleEnhanceText}
            disabled={isEnhancing}
            title="AI Enhance - Fix spelling & grammar"
          >
            {isEnhancing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Sparkles className="w-5 h-5" />
            )}
          </Button>
          
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
            onClick={handleSend}
            disabled={!message.trim() && !imagePreview}
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
