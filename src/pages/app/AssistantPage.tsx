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
import { Send, Sparkles, Loader2, ChevronDown, ImageIcon, X, Plus, Copy, Paperclip, Video, Settings, Download, Mic, Square, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { useVoiceChat } from '@/hooks/use-voice-chat';
import { useIsMobile } from '@/hooks/use-mobile';
import dehubLogo from '@/assets/dehub-logo-white.png';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { supabase } from '@/integrations/supabase/client';
import { MarkdownText } from '@/lib/markdown';
import { addWatermarkClient } from '@/lib/watermark';
import { AI_ASSISTANT_STYLE_OPTIONS } from '@/constants/ai-styles.constants';
import { VIDEO_MODELS, VIDEO_MODEL_OPTIONS, type VideoModelKey, type VideoModel } from '@/constants/video-models.constants';
import { IMAGE_MODELS, IMAGE_MODEL_OPTIONS, type ImageModelKey } from '@/constants/image-models.constants';
import { VOICE_PREFERENCES, VOICE_PREFERENCE_OPTIONS, type VoicePreferenceKey } from '@/constants/voice-models.constants';
import { PostModal } from '@/features/post';
import { VideoPaywallModal } from '@/components/app/video/VideoPaywallModal';

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
  const [selectedVideoModel, setSelectedVideoModel] = useState<VideoModelKey>('kling-2.6-pro');
  const [selectedImageModel, setSelectedImageModel] = useState<ImageModelKey>('gemini-2.5-flash');
  const [selectedVoice, setSelectedVoice] = useState<VoicePreferenceKey>('female');
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false);
  const [styleSheetOpen, setStyleSheetOpen] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [postModalFiles, setPostModalFiles] = useState<FileList | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [pendingVideoRequest, setPendingVideoRequest] = useState<{
    prompt: string;
    model: VideoModelKey;
    sourceImage?: string;
  } | null>(null);
  const [voiceAutoReply, setVoiceAutoReply] = useState(true); // Auto-speak AI replies when using voice
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<Record<string, NodeJS.Timeout>>({});
  const pendingVoiceRef = useRef(false); // Track if last input was voice

  const isMobile = useIsMobile();
  const currentStyle = AI_ASSISTANT_STYLE_OPTIONS.find(s => s.id === selectedStyle) || AI_ASSISTANT_STYLE_OPTIONS[0];
  const currentVideoModel = VIDEO_MODEL_OPTIONS.find(m => m.id === selectedVideoModel) || VIDEO_MODEL_OPTIONS[0];
  const currentImageModel = IMAGE_MODEL_OPTIONS.find(m => m.id === selectedImageModel) || IMAGE_MODEL_OPTIONS[0];
  const currentVoice = VOICE_PREFERENCE_OPTIONS.find(v => v.id === selectedVoice) || VOICE_PREFERENCE_OPTIONS[0];

  // Voice chat hook - handles speech recognition and text-to-speech
  const {
    isRecording,
    isSpeaking,
    transcript,
    startRecording,
    stopRecording,
    speak,
    stopSpeaking,
    isSupported: isVoiceSupported,
  } = useVoiceChat({
    voicePreference: selectedVoice as 'female' | 'male' | 'neutral',
    onTranscript: (text) => {
      // When user finishes speaking, set the input and auto-send
      if (text.trim()) {
        setInput(text);
        pendingVoiceRef.current = true;
        // Auto-send after a small delay to allow UI to update
        setTimeout(() => {
          handleVoiceSend(text);
        }, 100);
      }
    },
    onError: (error) => {
      toast.error(error);
    },
  });

  // Voice send handler - separate from regular send to track voice input
  const handleVoiceSend = async (voiceText: string) => {
    if (!voiceText.trim() || isLoading) return;
    pendingVoiceRef.current = true;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: voiceText.trim(),
      attachedImage: attachedImage || undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setAttachedImage(null);
    setIsLoading(true);

    try {
      // Regular chat for voice - use general-ai-chat endpoint
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

      const responseText = data.response || 'I apologize, I couldn\'t generate a response.';
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Auto-speak the response if voice auto-reply is enabled
      if (voiceAutoReply && isMobile) {
        // Small delay to let the message render first
        setTimeout(() => {
          speak(responseText);
        }, 300);
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
      pendingVoiceRef.current = false;
    }
  };

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

  // Scroll to top on initial mount - ensures header is visible on mobile
  useEffect(() => {
    // Use a small delay to ensure the scroll area is rendered
    const timer = setTimeout(() => {
      if (scrollRef.current) {
        // ScrollArea uses a viewport div inside - scroll that to top
        const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
          viewport.scrollTop = 0;
        }
      }
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // Scroll to bottom helper
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Auto-scroll to bottom on messages change or loading state
  // Skip scrolling on initial welcome message so header stays visible
  useEffect(() => {
    if (messages.length > 1 || isLoading) {
      scrollToBottom();
    }
  }, [messages, isLoading]);

  // Focus input on mount - only on desktop to prevent mobile keyboard from pushing screen down
  useEffect(() => {
    if (!isMobile) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isMobile]);

  // Process image file helper
  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      setAttachedImage(event.target?.result as string);
      toast.success('Image attached');
    };
    reader.readAsDataURL(file);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Handle paste event for images
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) processImageFile(file);
        return;
      }
    }
  };

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if leaving the container
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    
    const imageFile = Array.from(files).find(f => f.type.startsWith('image/'));
    if (imageFile) processImageFile(imageFile);
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

  // Handle video generation after payment confirmation
  const handleVideoGenerationConfirm = async () => {
    if (!pendingVideoRequest) return;

    const { prompt, model, sourceImage } = pendingVideoRequest;
    const videoModel = VIDEO_MODELS[model];

    // Add user message if not already added
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: prompt,
      attachedImage: sourceImage
    };
    setMessages(prev => [...prev, userMessage]);

    setPaywallOpen(false);
    setIsVideoLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('generate-video', {
        body: {
          prompt,
          model,
          sourceImage,
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
        setPendingVideoRequest(null);
        return;
      }

      // Create placeholder message for video
      const messageId = (Date.now() + 1).toString();
      const assistantMessage: Message = {
        id: messageId,
        role: 'assistant',
        content: `🎬 Generating video with **${videoModel.name}**...\n\n_This may take 1-3 minutes_`,
        isVideoGenerating: true,
        videoPredictionId: data.predictionId
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Start polling for video status
      pollingRef.current[data.predictionId] = setInterval(() => {
        pollVideoStatus(data.predictionId, messageId);
      }, 5000);

      toast.success('Payment successful! Generating your video...');
    } catch (err) {
      console.error('Video generation error:', err);
      toast.error('Failed to start video generation');
      setIsVideoLoading(false);
    }

    setPendingVideoRequest(null);
  };

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
        // Validate Runway requires an image
        if (selectedVideoModel === 'runway-gen4' && !currentAttachedImage) {
          toast.error('Runway Gen-4 requires an image to animate. Please attach an image or select a different model.');
          setIsLoading(false);
          return;
        }
        
        // Show paywall instead of generating directly
        setPendingVideoRequest({
          prompt: currentInput,
          model: selectedVideoModel,
          sourceImage: currentAttachedImage || undefined,
        });
        setPaywallOpen(true);
        setIsLoading(false);
        return;
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

        // Apply client-side watermark
        const watermarkedImageUrl = await addWatermarkClient(data.imageUrl);
        
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '', // No text for image responses
          imageUrl: watermarkedImageUrl
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
  };

  const handleImageModelSelect = (modelId: ImageModelKey) => {
    setSelectedImageModel(modelId);
  };

  const handleVoiceSelect = (voiceId: VoicePreferenceKey) => {
    setSelectedVoice(voiceId);
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

  return (
    <div 
      className="flex flex-col h-full lg:h-screen relative overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center pointer-events-none"
          >
            <div className="flex flex-col items-center gap-3 p-8 rounded-2xl bg-white/10 border border-white/20">
              <ImageIcon className="w-12 h-12 text-white/80" />
              <p className="text-white text-lg font-medium">Drop image here</p>
              <p className="text-white/50 text-sm">to attach for editing</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
          {/* Settings Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettingsSheetOpen(true)}
            className="rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white gap-2 px-3 h-8"
          >
            <Settings className="w-3.5 h-3.5 text-white/70" />
            <span className="hidden sm:inline text-xs">Settings</span>
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

        {/* Unified Settings Drawer */}
        <Drawer open={settingsSheetOpen} onOpenChange={setSettingsSheetOpen}>
          <DrawerContent glass className="border-t border-white/10">
            <DrawerHeader className="border-b border-white/10">
              <DrawerTitle className="text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-white" />
                AI Settings
              </DrawerTitle>
            </DrawerHeader>
            <div className="h-[70vh] overflow-y-auto">
              {/* Image Model Section */}
              <div className="border-b border-white/10 pb-4">
                <div className="px-4 py-3 text-sm text-white/60 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  Image Model
                </div>
                {IMAGE_MODEL_OPTIONS.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => handleImageModelSelect(model.id as ImageModelKey)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors ${
                      selectedImageModel === model.id ? 'bg-white/10' : ''
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

              {/* Video Model Section */}
              <div className="border-b border-white/10 pb-4">
                <div className="px-4 py-3 text-sm text-white/60 flex items-center gap-2">
                  <Video className="w-4 h-4" />
                  Video Model
                </div>
                {/* Premium tier */}
                <div className="px-4 py-1 text-xs text-white/40 uppercase tracking-wider">Premium</div>
                {VIDEO_MODEL_OPTIONS.filter(m => m.tier === 'premium').map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => handleVideoModelSelect(model.id as VideoModelKey)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors ${
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
                <div className="px-4 py-1 text-xs text-white/40 uppercase tracking-wider mt-2">Standard</div>
                {VIDEO_MODEL_OPTIONS.filter(m => m.tier === 'standard').map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => handleVideoModelSelect(model.id as VideoModelKey)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors ${
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
                <div className="px-4 py-1 text-xs text-white/40 uppercase tracking-wider mt-2">Fast</div>
                {VIDEO_MODEL_OPTIONS.filter(m => m.tier === 'fast').map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => handleVideoModelSelect(model.id as VideoModelKey)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors ${
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

              {/* Voice Section */}
              <div className="pb-4">
                <div className="px-4 py-3 text-sm text-white/60 flex items-center gap-2">
                  <Volume2 className="w-4 h-4" />
                  AI Voice
                </div>
                {VOICE_PREFERENCE_OPTIONS.map((voice) => (
                  <button
                    key={voice.id}
                    type="button"
                    onClick={() => handleVoiceSelect(voice.id as VoicePreferenceKey)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors ${
                      selectedVoice === voice.id ? 'bg-white/10' : ''
                    }`}
                  >
                    <span className="text-lg">{voice.emoji}</span>
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{voice.name}</span>
                      <span className="text-xs text-white/50">{voice.description}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 pb-24 sm:pb-0 [&>div>div]:!block [&_[data-radix-scroll-area-scrollbar]]:hidden" ref={scrollRef}>
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

      {/* Input - Fixed above bottom nav on mobile, centered higher on desktop for first load */}
      <div className={`fixed bottom-[69px] left-0 right-0 px-2 z-40 sm:static sm:bottom-auto sm:z-auto sm:p-4 lg:relative ${
        messages.length <= 1 && !isLoading ? 'sm:mt-auto sm:mb-[15vh]' : ''
      }`}>
        <div className="mx-auto max-w-[95%] md:max-w-3xl lg:max-w-4xl">
          {/* Attached image preview */}
          {attachedImage && (
            <div className="mb-2 relative inline-block">
              <img 
                src={attachedImage} 
                alt="Attached" 
                className="max-h-20 rounded-lg object-contain"
              />
              <button
                onClick={() => setAttachedImage(null)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500/90 rounded-full flex items-center justify-center"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          )}
          
          {/* Clean input row with auto-expanding textarea */}
          <div className="flex items-end gap-2 bg-white/5 rounded-2xl px-3 py-2 border border-white/10">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            
            {/* Attach button - minimal */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-white/50 hover:text-white/80 transition-colors p-1 shrink-0 mb-0.5"
              title="Attach file"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            
            {/* Voice recording button - all devices */}
            {isVoiceSupported && (
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isLoading}
                className={`transition-colors p-1 disabled:opacity-30 shrink-0 mb-0.5 ${
                  isRecording 
                    ? 'text-red-500' 
                    : 'text-white/50 hover:text-white/80'
                }`}
                title={isRecording ? "Stop recording" : "Voice input"}
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
            
            {/* Auto-expanding textarea - supports multiline and formatting */}
            <textarea
              ref={inputRef}
              value={isRecording ? transcript : input}
              onChange={(e) => {
                if (!isRecording) {
                  setInput(e.target.value);
                  // Auto-resize the textarea
                  e.target.style.height = 'auto';
                  const maxHeight = window.innerHeight * 0.45; // Max 45% of viewport (about halfway up)
                  const newHeight = Math.min(e.target.scrollHeight, maxHeight);
                  e.target.style.height = `${newHeight}px`;
                }
              }}
              onKeyDown={(e) => {
                // Submit on Enter without Shift, allow Shift+Enter for new lines
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              onPaste={handlePaste}
              placeholder={isRecording ? "Listening..." : attachedImage ? "Describe edits..." : "Ask anything..."}
              className={`flex-1 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none min-w-0 resize-none overflow-y-auto leading-relaxed py-1 ${
                isRecording ? 'text-white/60 italic' : ''
              }`}
              style={{ 
                minHeight: '24px',
                maxHeight: '45vh'
              }}
              rows={1}
              readOnly={isRecording}
            />
            
            {/* Stop speaking button - shown when AI is speaking */}
            {isSpeaking && (
              <button
                type="button"
                onClick={stopSpeaking}
                className="text-cyan-400 hover:text-cyan-300 transition-colors p-1 animate-pulse shrink-0 mb-0.5"
                title="Stop speaking"
              >
                <VolumeX className="w-5 h-5" />
              </button>
            )}
            
            {/* Send button - minimal */}
            <button
              type="button"
              onClick={handleSend}
              disabled={(!input.trim() && !isRecording) || isLoading}
              className="text-white/50 hover:text-white transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed shrink-0 mb-0.5"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Post Modal */}
      <PostModal
        isOpen={postModalOpen}
        onClose={() => setPostModalOpen(false)}
        initialFiles={postModalFiles}
        onFilesProcessed={() => setPostModalFiles(null)}
      />

      {/* Video Paywall Modal */}
      {pendingVideoRequest && (
        <VideoPaywallModal
          open={paywallOpen}
          onOpenChange={(open) => {
            setPaywallOpen(open);
            if (!open) setPendingVideoRequest(null);
          }}
          model={VIDEO_MODELS[pendingVideoRequest.model]}
          selectedModelKey={pendingVideoRequest.model}
          onModelChange={(modelKey) => {
            setPendingVideoRequest(prev => prev ? { ...prev, model: modelKey } : null);
          }}
          onConfirm={handleVideoGenerationConfirm}
          isGenerating={isVideoLoading}
        />
      )}
    </div>
  );
}
