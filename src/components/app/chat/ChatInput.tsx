import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Image, Send, Sparkles, Loader2, X, DollarSign } from 'lucide-react';
import { EmojiGifPicker } from './EmojiGifPicker';
import { VoiceRecorder } from './VoiceRecorder';
import { UserMentionDropdown } from '@/components/app/mentions';
import { useMention } from '@/hooks/use-mention';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ChatInputSendArgs {
  content: string;
  type: 'msg' | 'media' | 'gif' | 'voice';
  mediaFile?: File;
  gifUrl?: string;
  duration?: number;
}

interface ChatInputProps {
  onSendMessage: (args: ChatInputSendArgs) => void;
  onTipClick?: () => void;
}

export function ChatInput({ onSendMessage }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [audioPreview, setAudioPreview] = useState<{ file: File; blob: Blob; duration: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mention = useMention({
    inputRef: textareaRef,
    onMentionInsert: (_user, newText) => setMessage(newText),
  });

  const handleSend = () => {
    if (audioPreview) {
      onSendMessage({
        content: '',
        type: 'voice',
        mediaFile: audioPreview.file,
        duration: audioPreview.duration,
      });
      setAudioPreview(null);
      setMessage('');
      return;
    }

    if (imageFile) {
      onSendMessage({
        content: message.trim(),
        type: 'media',
        mediaFile: imageFile,
      });
      clearImage();
      setMessage('');
      return;
    }

    if (!message.trim()) return;
    onSendMessage({ content: message.trim(), type: 'msg' });
    setMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mention.isOpen) {
      const handled = mention.handleKeyDown(e);
      if (handled) {
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const liveResults = (window as any).__mentionResults || [];
          if (liveResults[mention.selectedIndex]) {
            mention.handleSelect(liveResults[mention.selectedIndex]);
          }
        }
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    const newVal = message + emoji;
    setMessage(newVal);
    mention.handleInput(newVal, newVal.length);
    textareaRef.current?.focus();
  };

  const handleGifSelect = (gifUrl: string) => {
    onSendMessage({ content: '', type: 'gif', gifUrl });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be less than 10MB');
      return;
    }

    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setAudioPreview(null);
  };

  const handleVoiceRecordingComplete = (blob: Blob, duration: number) => {
    const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type || 'audio/webm' });
    setAudioPreview({ file, blob, duration });
    clearImage();
    toast.success(`Recording saved (${duration}s)`);
  };

  const handleEnhanceText = async () => {
    if (!message.trim()) {
      toast.error('Enter some text to enhance');
      return;
    }

    setIsEnhancing(true);
    try {
      const { data, error } = await supabase.functions.invoke('enhance-text', {
        body: { text: message.trim() }
      });

      if (error) {
        toast.error(error.message || 'Failed to enhance text');
        return;
      }

      if (data?.enhancedText) {
        setMessage(data.enhancedText);
        toast.success('Text enhanced!');
      } else if (data?.error) {
        toast.error(data.error);
      }
    } catch (err) {
      toast.error('Failed to enhance text');
    } finally {
      setIsEnhancing(false);
      textareaRef.current?.focus();
    }
  };

  const clearImage = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(null);
    setImagePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAudioPreview = () => setAudioPreview(null);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-3 lg:pl-4 border-t border-transparent bg-zinc-900">
      {/* Image Preview */}
      {imagePreviewUrl && (
        <div className="mb-2 relative inline-block">
          <img
            src={imagePreviewUrl}
            alt="Preview"
            className="h-20 rounded-lg object-cover"
          />
          <button
            onClick={clearImage}
            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      )}

      {/* Audio Preview */}
      {audioPreview && (
        <div className="mb-2 relative inline-flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-sm text-white">
            🎤 Voice message ({formatDuration(audioPreview.duration)})
          </span>
          <button
            onClick={removeAudioPreview}
            className="ml-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          placeholder="Type a message..."
          value={message}
          onChange={(e) => {
            const val = e.target.value;
            setMessage(val);
            mention.handleInput(val, e.target.selectionStart);
          }}
          onKeyDown={handleKeyDown}
          className="min-h-[56px] max-h-32 resize-none bg-transparent border-none text-white placeholder:text-zinc-500 p-0 pt-1 pr-28 focus-visible:ring-0 focus-visible:ring-offset-0"
          rows={2}
        />

        <UserMentionDropdown
          query={mention.query}
          isOpen={mention.isOpen}
          position={mention.position}
          selectedIndex={mention.selectedIndex}
          onSelectedIndexChange={mention.setSelectedIndex}
          onSelect={mention.handleSelect}
          onClose={mention.handleClose}
        />

        {/* Action buttons */}
        <div className="absolute bottom-0 right-0 flex items-center gap-0.5">
          <EmojiGifPicker
            onEmojiSelect={handleEmojiSelect}
            onGifSelect={handleGifSelect}
          />

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

          <VoiceRecorder
            onRecordingComplete={handleVoiceRecordingComplete}
            disabled={!!imagePreviewUrl}
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
                onClick={handleEnhanceText}
                disabled={isEnhancing}
              >
                {isEnhancing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Sparkles className="w-5 h-5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>AI Enhance - Fix spelling & grammar</TooltipContent>
          </Tooltip>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
            onClick={handleSend}
            disabled={!message.trim() && !imageFile && !audioPreview}
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
