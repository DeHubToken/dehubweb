/**
 * AI Assistant Page
 * =================
 * Dedicated page for the AI assistant with side panels.
 * Auto-detects when to search the web for live content.
 * Supports image generation and video generation with model selection.
 * 
 * RULE: All AI responses MUST be rendered through MarkdownText
 * to ensure proper formatting (bold, italic, lists, etc.)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, Loader2, ChevronDown, ImageIcon, X, Plus, Copy, Paperclip, Video, Download } from 'lucide-react';
import { toast } from 'sonner';
import dehubLogo from '@/assets/dehub-logo-white.png';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { supabase } from '@/integrations/supabase/client';
import { MarkdownText } from '@/lib/markdown';
import { AI_ASSISTANT_STYLE_OPTIONS } from '@/constants/ai-styles.constants';
import { VIDEO_MODEL_OPTIONS, type VideoModelKey } from '@/constants/video-models.constants';
import { PostModal } from '@/features/post';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;       // For generated/edited images in responses
  videoUrl?: string;       // For generated videos
  attachedImage?: string;  // For user-attached images to edit
  isVideoGenerating?: boolean;
  videoPredictionId?: string;
}

// Keywords that indicate image generation/editing request
const IMAGE_KEYWORDS = [
  'generate image', 'create image', 'make image', 'draw', 'design',
  'create a picture', 'make a picture', 'generate a picture',
  'create artwork', 'make art', 'edit this image', 'modify this',
  'change this image', 'put', 'add to this image', 'remove from',
  'generate an image', 'create an image', 'make an image',
  'generate a', 'create a', 'draw a', 'draw me', 'make me',
  'photo of', 'picture of', 'image of', 'illustration of',
  'show me', 'show a', 'give me', 'i want', 'can you show',
  'what does', 'look like', 'visualize', 'render', 'depict'
];

// Keywords that indicate video generation request
const VIDEO_KEYWORDS = [
  'generate video', 'create video', 'make video', 'make a video',
  'generate a video', 'create a video', 'animate', 'animation',
  'video of', 'clip of', 'footage of', 'motion', 'moving',
  'bring to life', 'make it move', 'animate this'
];

function requiresImageGeneration(message: string, hasAttachedImage: boolean): boolean {
  const lower = message.toLowerCase();
  // Don't trigger image gen if it's a video request
  if (VIDEO_KEYWORDS.some(keyword => lower.includes(keyword))) return false;
  // If user attached an image, any instruction likely means they want to edit it
  if (hasAttachedImage) return true;
  return IMAGE_KEYWORDS.some(keyword => lower.includes(keyword));
}

function requiresVideoGeneration(message: string): boolean {
  const lower = message.toLowerCase();
  return VIDEO_KEYWORDS.some(keyword => lower.includes(keyword));
}

// Image generation loading animation component
function ImageGenerationLoader({ startTime }: { startTime: number }) {
  const [phase, setPhase] = useState<'spinner' | 'skeleton'>('spinner');
  const [progress, setProgress] = useState(0);
  
  useEffect(() => {
    // Switch to skeleton phase after 2 seconds
    const phaseTimer = setTimeout(() => {
      setPhase('skeleton');
    }, 2000);
    
    return () => clearTimeout(phaseTimer);
  }, []);
  
  useEffect(() => {
    if (phase === 'skeleton') {
      // Continuously animate - never stops until component unmounts
      const interval = setInterval(() => {
        setProgress(prev => {
          // Keep cycling - when it reaches 100, slow down dramatically but never fully stop
          // This creates an infinite growing effect
          if (prev >= 95) {
            // Very slow increment after 95% - gives illusion of "almost there"
            return Math.min(99.5, prev + 0.05);
          }
          // Normal pace growth
          const increment = Math.max(0.5, (100 - prev) / 30);
          return prev + increment;
        });
      }, 100);
      
      return () => clearInterval(interval);
    }
  }, [phase]);
  
  if (phase === 'spinner') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex justify-start"
      >
        <div className="bg-white/10 rounded-2xl px-4 py-3 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-white/60" />
          <span className="text-sm text-white/60">Generating image...</span>
        </div>
      </motion.div>
    );
  }
  
  // Calculate skeleton size - starts small, grows toward full available width
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const isTablet = typeof window !== 'undefined' && window.innerWidth < 1024;
  const maxSize = isMobile ? 320 : isTablet ? 650 : 800;
  const minSize = 60;
  const currentScale = progress / 100;
  // Use easeOutQuint (power of 5) for very slow deceleration - keeps growing much longer
  const easedScale = 1 - Math.pow(1 - currentScale, 5);
  const size = Math.round(minSize + (maxSize - minSize) * easedScale);
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex justify-start"
    >
      {/* Growing skeleton with colorful smoky shimmer */}
      <motion.div
        animate={{ width: size, height: size }}
        transition={{ type: 'spring', stiffness: 100, damping: 20 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900/80 to-gray-800/60"
      >
        {/* Base ambient glow */}
        <div 
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at 30% 40%, rgba(139, 92, 246, 0.15) 0%, transparent 50%), radial-gradient(ellipse at 70% 60%, rgba(59, 130, 246, 0.15) 0%, transparent 50%)',
          }}
        />
        
        {/* Primary color wave - purple/violet */}
        <motion.div 
          className="absolute inset-0"
          animate={{ 
            opacity: [0.1, 0.3, 0.1],
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background: 'radial-gradient(ellipse at 20% 30%, rgba(168, 85, 247, 0.4) 0%, transparent 60%)',
            filter: 'blur(20px)',
          }}
        />
        
        {/* Secondary color wave - cyan/blue */}
        <motion.div 
          className="absolute inset-0"
          animate={{ 
            opacity: [0.15, 0.35, 0.15],
            scale: [1.1, 1, 1.1],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
          style={{
            background: 'radial-gradient(ellipse at 80% 70%, rgba(34, 211, 238, 0.4) 0%, transparent 60%)',
            filter: 'blur(25px)',
          }}
        />
        
        {/* Tertiary color wave - pink/magenta */}
        <motion.div 
          className="absolute inset-0"
          animate={{ 
            opacity: [0.2, 0.1, 0.25, 0.1],
            x: [0, 10, -5, 0],
            y: [0, -10, 5, 0],
          }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          style={{
            background: 'radial-gradient(ellipse at 50% 50%, rgba(236, 72, 153, 0.35) 0%, transparent 55%)',
            filter: 'blur(30px)',
          }}
        />
        
        {/* Warm accent - orange/amber */}
        <motion.div 
          className="absolute inset-0"
          animate={{ 
            opacity: [0.1, 0.25, 0.1],
            rotate: [0, 5, -5, 0],
          }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
          style={{
            background: 'radial-gradient(ellipse at 60% 20%, rgba(251, 146, 60, 0.3) 0%, transparent 50%)',
            filter: 'blur(20px)',
          }}
        />
        
        {/* Traveling shimmer highlight */}
        <motion.div 
          className="absolute inset-0"
          animate={{ 
            x: ['-100%', '200%'],
          }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
            width: '50%',
          }}
        />
        
        {/* Subtle progress indicator at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5">
          <motion.div 
            className="h-full bg-gradient-to-r from-violet-500/60 via-cyan-400/60 to-pink-500/60"
            animate={{ width: `${progress}%` }}
            transition={{ ease: 'linear' }}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [imageLoadStartTime, setImageLoadStartTime] = useState<number>(0);
  const [selectedStyle, setSelectedStyle] = useState<string>('normal');
  const [selectedVideoModel, setSelectedVideoModel] = useState<VideoModelKey>('kling-1.6-pro');
  const [styleSheetOpen, setStyleSheetOpen] = useState(false);
  const [videoModelSheetOpen, setVideoModelSheetOpen] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [postModalFiles, setPostModalFiles] = useState<FileList | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<Record<string, NodeJS.Timeout>>({});

  const currentStyle = AI_ASSISTANT_STYLE_OPTIONS.find(s => s.id === selectedStyle) || AI_ASSISTANT_STYLE_OPTIONS[0];
  const currentVideoModel = VIDEO_MODEL_OPTIONS.find(m => m.id === selectedVideoModel) || VIDEO_MODEL_OPTIONS[0];

  // Generate initial welcome message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        id: 'initial',
        role: 'assistant',
        content: `Hi! Ask me anything, whether it's DeHub related or not, I can help.`
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

  // Poll for video generation status
  const pollVideoStatus = useCallback(async (predictionId: string, messageId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('generate-video', {
        body: { predictionId }
      });

      if (error) throw error;

      if (data.status === 'succeeded' && data.videoUrl) {
        // Clear polling
        if (pollingRef.current[predictionId]) {
          clearInterval(pollingRef.current[predictionId]);
          delete pollingRef.current[predictionId];
        }

        // Update message with video URL
        setMessages(prev => prev.map(m => 
          m.id === messageId 
            ? { ...m, videoUrl: data.videoUrl, isVideoGenerating: false }
            : m
        ));
        setIsVideoLoading(false);
        toast.success('Video generated!');
      } else if (data.status === 'failed') {
        // Clear polling
        if (pollingRef.current[predictionId]) {
          clearInterval(pollingRef.current[predictionId]);
          delete pollingRef.current[predictionId];
        }

        // Update message with error
        setMessages(prev => prev.map(m => 
          m.id === messageId 
            ? { ...m, content: `Video generation failed: ${data.error || 'Unknown error'}`, isVideoGenerating: false }
            : m
        ));
        setIsVideoLoading(false);
        toast.error('Video generation failed');
      }
      // If still processing, keep polling
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      Object.values(pollingRef.current).forEach(clearInterval);
    };
  }, []);

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
      // Check request type
      const isVideoRequest = requiresVideoGeneration(currentInput);
      const isImageRequest = requiresImageGeneration(currentInput, !!currentAttachedImage);
      
      if (isVideoRequest) {
        // Video generation
        setIsVideoLoading(true);
        
        const { data, error } = await supabase.functions.invoke('generate-video', {
          body: {
            prompt: currentInput,
            model: selectedVideoModel,
            sourceImage: currentAttachedImage || undefined,
            duration: '5s',
            aspectRatio: '16:9'
          }
        });

        if (error) throw error;

        if (data.error) {
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `Video generation failed: ${data.error}`
          }]);
          setIsVideoLoading(false);
          return;
        }

        // Create placeholder message for video
        const messageId = (Date.now() + 1).toString();
        const assistantMessage: Message = {
          id: messageId,
          role: 'assistant',
          content: `🎬 Generating video with **${currentVideoModel.name}**...\n\n_This may take 1-3 minutes_`,
          isVideoGenerating: true,
          videoPredictionId: data.predictionId
        };

        setMessages(prev => [...prev, assistantMessage]);

        // Start polling for video status
        pollingRef.current[data.predictionId] = setInterval(() => {
          pollVideoStatus(data.predictionId, messageId);
        }, 5000);

        // Don't set isLoading to false yet - video is still generating
        setIsLoading(false);
        
      } else if (isImageRequest) {
        // Set image-specific loading state
        setIsImageLoading(true);
        setImageLoadStartTime(Date.now());
        
        // Build conversation history for context
        const conversationHistory = messages
          .filter(m => m.id !== 'initial') // Exclude welcome message
          .map(m => ({
            role: m.role,
            content: m.content
          }));
        
        // Use generate-image endpoint with conversation context
        const { data, error } = await supabase.functions.invoke('generate-image', {
          body: {
            prompt: currentInput,
            sourceImage: currentAttachedImage || undefined,
            conversationHistory
          }
        });

        if (error) throw error;
        
        // Check for error in response (like safety blocks or content refusals)
        if (data.error) {
          const errorMessage = data.safetyBlocked 
            ? "This content can't be generated on DeHub - we're a family-friendly platform! Try something else 🎨"
            : data.error;
          
          // If clearHistory flag is set, reset to just the welcome message
          // This prevents previous inappropriate requests from affecting future normal requests
          if (data.clearHistory) {
            setMessages([
              {
                id: 'initial',
                role: 'assistant',
                content: `Hi! Ask me anything, whether it's DeHub related or not, I can help.`
              },
              {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: errorMessage
              }
            ]);
          } else {
            setMessages(prev => [...prev, {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: errorMessage
            }]);
          }
          return;
        }

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '', // No text for image responses
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
      setIsImageLoading(false);
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

  const handleVideoModelSelect = (modelId: VideoModelKey) => {
    setSelectedVideoModel(modelId);
    setVideoModelSheetOpen(false);
  };

  // Convert base64 image to FileList for PostModal
  const handlePostImage = async (imageUrl: string) => {
    try {
      // Extract base64 data
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], 'ai-generated-image.png', { type: 'image/png' });
      
      // Create a DataTransfer to build FileList
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      
      setPostModalFiles(dataTransfer.files);
      setPostModalOpen(true);
    } catch (error) {
      console.error('Error preparing image for post:', error);
    }
  };

  // Style options content
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

  // Video model options content
  const videoModelMenuContent = (
    <div className="h-[60vh] overflow-y-auto">
      <div className="flex flex-col pb-4">
        {/* Premium tier */}
        <div className="px-4 py-2 text-xs text-white/40 uppercase tracking-wider">Premium</div>
        {VIDEO_MODEL_OPTIONS.filter(m => m.tier === 'premium').map((model) => (
          <button
            key={model.id}
            type="button"
            onClick={() => handleVideoModelSelect(model.id as VideoModelKey)}
            className={`flex items-start gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors ${
              selectedVideoModel === model.id ? 'bg-white/10' : ''
            }`}
          >
            <span className="text-lg">{model.emoji}</span>
            <div className="flex flex-col items-start">
              <span className="font-medium">{model.name}</span>
              <span className="text-xs text-white/50">{model.description}</span>
            </div>
          </button>
        ))}
        
        {/* Standard tier */}
        <div className="px-4 py-2 text-xs text-white/40 uppercase tracking-wider mt-2">Standard</div>
        {VIDEO_MODEL_OPTIONS.filter(m => m.tier === 'standard').map((model) => (
          <button
            key={model.id}
            type="button"
            onClick={() => handleVideoModelSelect(model.id as VideoModelKey)}
            className={`flex items-start gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors ${
              selectedVideoModel === model.id ? 'bg-white/10' : ''
            }`}
          >
            <span className="text-lg">{model.emoji}</span>
            <div className="flex flex-col items-start">
              <span className="font-medium">{model.name}</span>
              <span className="text-xs text-white/50">{model.description}</span>
            </div>
          </button>
        ))}
        
        {/* Fast tier */}
        <div className="px-4 py-2 text-xs text-white/40 uppercase tracking-wider mt-2">Fast</div>
        {VIDEO_MODEL_OPTIONS.filter(m => m.tier === 'fast').map((model) => (
          <button
            key={model.id}
            type="button"
            onClick={() => handleVideoModelSelect(model.id as VideoModelKey)}
            className={`flex items-start gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors ${
              selectedVideoModel === model.id ? 'bg-white/10' : ''
            }`}
          >
            <span className="text-lg">{model.emoji}</span>
            <div className="flex flex-col items-start">
              <span className="font-medium">{model.name}</span>
              <span className="text-xs text-white/50">{model.description}</span>
            </div>
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

        <div className="flex items-center gap-2">
          {/* Video Model Selector Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setVideoModelSheetOpen(true)}
            className="rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white gap-2 px-3 h-8"
          >
            <Video className="w-3.5 h-3.5 text-white/70" />
            <span className="hidden sm:inline text-xs">{currentVideoModel.name}</span>
            <ChevronDown className="w-3 h-3 text-white/50" />
          </Button>

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
        </div>

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

        {/* Video Model Drawer */}
        <Drawer open={videoModelSheetOpen} onOpenChange={setVideoModelSheetOpen}>
          <DrawerContent glass className="border-t border-white/10">
            <DrawerHeader className="border-b border-white/10">
              <DrawerTitle className="text-white flex items-center gap-2">
                <Video className="w-5 h-5 text-white" />
                Video Model
              </DrawerTitle>
            </DrawerHeader>
            {videoModelMenuContent}
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
                {message.role === 'assistant' && message.videoUrl ? (
                  /* Video messages */
                  <div className="max-w-[85%] flex flex-col gap-2">
                    {/* Video container with controls */}
                    <div className="relative rounded-lg overflow-hidden">
                      <video 
                        src={message.videoUrl}
                        controls
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="max-w-full rounded-lg"
                      />
                      {/* DeHub watermark */}
                      <img 
                        src={dehubLogo} 
                        alt="" 
                        className="absolute bottom-12 left-3 h-5 opacity-60 pointer-events-none"
                      />
                      {/* Download button */}
                      <div className="absolute bottom-12 right-3 flex items-center gap-2">
                        <a
                          href={message.videoUrl}
                          download="dehub-video.mp4"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center w-10 h-10 rounded-full text-white transition-all duration-300 hover:scale-110 active:scale-95
                            bg-gradient-to-br from-white/25 via-white/15 to-white/5
                            backdrop-blur-xl border border-white/30
                            shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_2px_0_rgba(255,255,255,0.3),0_0_0_1px_rgba(0,0,0,0.1)]
                            hover:shadow-[0_12px_40px_rgba(59,130,246,0.4),inset_0_2px_0_rgba(255,255,255,0.4)]
                            hover:border-blue-400/50 hover:from-blue-500/30 hover:via-blue-400/15 hover:to-transparent"
                        >
                          <Download className="w-5 h-5" />
                        </a>
                      </div>
                    </div>
                  </div>
                ) : message.role === 'assistant' && message.isVideoGenerating ? (
                  /* Video generating placeholder */
                  <div className="max-w-[85%] flex flex-col gap-2">
                    <div className="bg-white/10 text-white rounded-2xl px-4 py-2.5">
                      <MarkdownText content={message.content} className="text-sm" />
                    </div>
                    {/* Video generation loader */}
                    <div className="relative w-full aspect-video max-w-md rounded-lg overflow-hidden bg-gradient-to-br from-gray-900/80 to-gray-800/60">
                      {/* Animated gradient background */}
                      <motion.div 
                        className="absolute inset-0"
                        animate={{ 
                          background: [
                            'linear-gradient(45deg, rgba(139,92,246,0.3) 0%, rgba(59,130,246,0.3) 50%, rgba(236,72,153,0.3) 100%)',
                            'linear-gradient(45deg, rgba(236,72,153,0.3) 0%, rgba(139,92,246,0.3) 50%, rgba(59,130,246,0.3) 100%)',
                            'linear-gradient(45deg, rgba(59,130,246,0.3) 0%, rgba(236,72,153,0.3) 50%, rgba(139,92,246,0.3) 100%)',
                          ]
                        }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                      />
                      {/* Pulsing video icon */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <motion.div
                          animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        >
                          <Video className="w-16 h-16 text-white/40" />
                        </motion.div>
                      </div>
                      {/* Progress bar at bottom */}
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
                        <motion.div 
                          className="h-full bg-gradient-to-r from-violet-500 via-cyan-400 to-pink-500"
                          animate={{ width: ['0%', '100%'] }}
                          transition={{ duration: 60, ease: 'linear' }}
                        />
                      </div>
                    </div>
                  </div>
                ) : message.role === 'assistant' && message.imageUrl ? (
                  /* Image-only messages - no bubble wrapper */
                  <div className="max-w-[85%] flex flex-col gap-2">
                    {message.content && (
                      <div className="bg-white/10 text-white rounded-2xl px-4 py-2.5">
                        <MarkdownText content={message.content} className="text-sm" />
                      </div>
                    )}
                    {/* Image container with watermark + button overlay */}
                    <div className="relative">
                      <img 
                        src={message.imageUrl} 
                        alt="Generated" 
                        className="max-w-full rounded-lg"
                      />
                      {/* DeHub watermark */}
                      <img 
                        src={dehubLogo} 
                        alt="" 
                        className="absolute bottom-3 left-3 h-5 opacity-60 pointer-events-none"
                      />
                      {/* Action buttons row */}
                      <div className="absolute bottom-3 right-3 flex items-center gap-2">
                        {/* Attach to edit button */}
                        <button
                          onClick={() => {
                            setAttachedImage(message.imageUrl!);
                            inputRef.current?.focus();
                            toast.success('Image attached - describe your edits');
                          }}
                          className="flex items-center justify-center w-10 h-10 rounded-full text-white transition-all duration-300 hover:scale-110 active:scale-95
                            bg-gradient-to-br from-white/25 via-white/15 to-white/5
                            backdrop-blur-xl border border-white/30
                            shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_2px_0_rgba(255,255,255,0.3),0_0_0_1px_rgba(0,0,0,0.1)]
                            hover:shadow-[0_12px_40px_rgba(168,85,247,0.4),inset_0_2px_0_rgba(255,255,255,0.4)]
                            hover:border-purple-400/50 hover:from-purple-500/30 hover:via-purple-400/15 hover:to-transparent"
                        >
                          <Paperclip className="w-5 h-5" />
                        </button>
                        {/* Copy button */}
                        <button
                          onClick={async () => {
                            try {
                              const response = await fetch(message.imageUrl!);
                              const blob = await response.blob();
                              await navigator.clipboard.write([
                                new ClipboardItem({ [blob.type]: blob })
                              ]);
                              toast.success('Image copied to clipboard');
                            } catch (err) {
                              toast.error('Failed to copy image');
                            }
                          }}
                          className="flex items-center justify-center w-10 h-10 rounded-full text-white transition-all duration-300 hover:scale-110 active:scale-95
                            bg-gradient-to-br from-white/25 via-white/15 to-white/5
                            backdrop-blur-xl border border-white/30
                            shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_2px_0_rgba(255,255,255,0.3),0_0_0_1px_rgba(0,0,0,0.1)]
                            hover:shadow-[0_12px_40px_rgba(34,197,94,0.4),inset_0_2px_0_rgba(255,255,255,0.4)]
                            hover:border-green-400/50 hover:from-green-500/30 hover:via-green-400/15 hover:to-transparent"
                        >
                          <Copy className="w-5 h-5" />
                        </button>
                        {/* Post button */}
                        <button
                          onClick={() => handlePostImage(message.imageUrl!)}
                          className="flex items-center justify-center w-10 h-10 rounded-full text-white transition-all duration-300 hover:scale-110 active:scale-95
                            bg-gradient-to-br from-white/25 via-white/15 to-white/5
                            backdrop-blur-xl border border-white/30
                            shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_2px_0_rgba(255,255,255,0.3),0_0_0_1px_rgba(0,0,0,0.1)]
                            hover:shadow-[0_12px_40px_rgba(59,130,246,0.4),inset_0_2px_0_rgba(255,255,255,0.4)]
                            hover:border-blue-400/50 hover:from-blue-500/30 hover:via-blue-400/15 hover:to-transparent"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Text messages - with bubble wrapper */
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
                      <MarkdownText content={message.content} className="text-sm" />
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {isImageLoading && (
            <ImageGenerationLoader startTime={imageLoadStartTime} />
          )}
          {isLoading && !isImageLoading && (
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

      {/* Post Modal */}
      <PostModal
        isOpen={postModalOpen}
        onClose={() => setPostModalOpen(false)}
        initialFiles={postModalFiles}
        onFilesProcessed={() => setPostModalFiles(null)}
      />
    </div>
  );
}
