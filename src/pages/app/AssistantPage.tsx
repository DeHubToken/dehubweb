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
import { useTranslation as useI18n } from 'react-i18next';
import { Send, Sparkles, Loader2, ChevronDown, ImageIcon, X, Plus, Copy, Paperclip, Video, Settings, Download, Mic, Square, Volume2, VolumeX, LayoutDashboard, Check, XCircle, Lock, Zap, History } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useVoiceChat } from '@/hooks/use-voice-chat';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUserLanguage } from '@/hooks/use-user-language';
import { useMention } from '@/hooks/use-mention';
import { useAuth } from '@/contexts/AuthContext';
import dehubLogo from '@/assets/dehub-logo-white.png';
import ftvLogoSymbol from '@/assets/ftv-logo-symbol.png';
import assistantAvatar from '@/assets/ai-assistant-avatar.png';
import aiSparkleIcon from '@/assets/icons/ai-sparkle-icon.png';
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
import { CHAT_MODEL_OPTIONS, DEFAULT_CHAT_MODEL, type ChatModelKey } from '@/constants/chat-models.constants';
import { PostModal } from '@/features/post';
import { VideoPaywallModal } from '@/components/app/video/VideoPaywallModal';
import { OverviewTab } from '@/components/app/command-centre';
import { AuthPrompt } from '@/components/app/AuthPrompt';
import { AuthGate } from '@/components/app/AuthGate';
import { UserMentionDropdown, type MentionUser } from '@/components/app/mentions';
import { ConversationHistoryDrawer } from '@/components/app/assistant/ConversationHistoryDrawer';
import { useAIConversation } from '@/hooks/use-ai-conversation';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';

// Simulation data for token transactions
interface SimulationData {
  txHash: string;
  amount: string;
  recipient?: string;
  token: string;
  timestamp: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;       // For generated/edited images in responses
  videoUrl?: string;       // For generated videos
  attachedImage?: string;  // For user-attached images to edit
  isVideoGenerating?: boolean;
  videoPredictionId?: string;
  isSimulation?: boolean;  // For transaction simulations
  simulationType?: 'transfer' | 'purchase';
  simulationData?: SimulationData;
  simulationStatus?: 'pending' | 'approved' | 'rejected';
  isError?: boolean;
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
  'bring to life', 'make it move', 'make this move', 'animate this',
  'into a video', 'into video', 'turn into', 'as a video', 'turn this into'
];

// Keywords that indicate user wants to use the official logo in their image
const LOGO_KEYWORDS = [
  'dehub logo', 'the dehub logo', 'ftv logo', 'the ftv logo',
  'your logo', 'the logo', 'official logo', 'dehub brand', 
  'ftv brand', 'brand logo', 'company logo'
];

function requiresLogoAsset(message: string): boolean {
  const lower = message.toLowerCase();
  return LOGO_KEYWORDS.some(keyword => lower.includes(keyword));
}

// Check if logo request also wants something creative (not just "show me the logo")
function isCreativeLogoRequest(message: string): boolean {
  const lower = message.toLowerCase();
  // If it's just asking to see/show the logo without creative context, return false
  const simpleShowPatterns = [
    /^show\s*(me\s*)?(the\s*)?(dehub|ftv|your|official|brand|company)?\s*logo\.?$/,
    /^(dehub|ftv)\s*logo\.?$/,
    /^(the\s*)?(dehub|ftv|official)\s*logo\.?$/,
    /^display\s*(the\s*)?(dehub|ftv)?\s*logo\.?$/
  ];
  
  if (simpleShowPatterns.some(pattern => pattern.test(lower.trim()))) {
    return false;
  }
  
  // If it has additional context beyond just the logo, it's creative
  return true;
}

// Convert an image URL to base64 data URL
async function imageUrlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

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
  const [selectedChatModel, setSelectedChatModel] = useState<string>(DEFAULT_CHAT_MODEL);
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
  const [alwaysSpeakReplies, setAlwaysSpeakReplies] = useState(false); // Speak ALL AI replies, not just voice responses
  const [inputGlow, setInputGlow] = useState(false); // Glow effect for input focus hint
  const [showCommandCentre, setShowCommandCentre] = useState(false); // Toggle between chat and command centre
  const [showAuthPrompt, setShowAuthPrompt] = useState(false); // Auth prompt for simulation approval
  const [transferPin, setTransferPin] = useState<string | null>(null); // PIN for transfer approval
  const [autoApproveMode, setAutoApproveMode] = useState(false); // Auto-approve transfers without confirmation
  const [showPinModal, setShowPinModal] = useState(false); // PIN setup modal
  const [pinInput, setPinInput] = useState(''); // PIN input value
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false); // History drawer state
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<Record<string, NodeJS.Timeout>>({});
  const pendingVoiceRef = useRef(false); // Track if last input was voice

  const { isAuthenticated } = useAuth();
  const isMobile = useIsMobile();
  const { language: userLanguage } = useUserLanguage();
  const { t } = useI18n();
  
  // Conversation persistence hook
  const { 
    conversationId, 
    isSaving, 
    queueMessage, 
    startNewConversation, 
    loadConversation 
  } = useAIConversation();

  // Block access for unauthenticated users (AuthGate handles loading state internally)
  if (!isAuthenticated) {
    return (
      <AuthGate description={t('assistant.loginRequired')} />
    );
  }
  
  // Mention hook for @mentions in input
  const mention = useMention({
    inputRef,
    onMentionInsert: (user, newText) => {
      setInput(newText);
    },
  });
  
  const currentStyle = AI_ASSISTANT_STYLE_OPTIONS.find(s => s.id === selectedStyle) || AI_ASSISTANT_STYLE_OPTIONS[0];
  const currentVideoModel = VIDEO_MODEL_OPTIONS.find(m => m.id === selectedVideoModel) || VIDEO_MODEL_OPTIONS[0];
  const currentImageModel = IMAGE_MODEL_OPTIONS.find(m => m.id === selectedImageModel) || IMAGE_MODEL_OPTIONS[0];
  const currentVoice = VOICE_PREFERENCE_OPTIONS.find(v => v.id === selectedVoice) || VOICE_PREFERENCE_OPTIONS[0];
  const currentChatModel = CHAT_MODEL_OPTIONS.find(m => m.id === selectedChatModel) || CHAT_MODEL_OPTIONS[0];

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
          style: selectedStyle,
          model: selectedChatModel,
          userLanguage
        }
      });

      if (error) throw error;

      // Show fallback toast if Grok was requested but not available
      if (data.fallbackUsed) {
        toast.info('Using DeHub AI - Grok API key not configured');
      }

      const responseText = data.response || t('assistant.noResponse');
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Auto-speak the response if voice auto-reply is enabled OR always speak replies is on
      if (voiceAutoReply || alwaysSpeakReplies) {
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
        content: t('assistant.errorGeneric')
      }]);
    } finally {
      setIsLoading(false);
      pendingVoiceRef.current = false;
    }
  };

  // Initialize with welcome message on mount
  useEffect(() => {
    setMessages([
      {
        id: 'initial',
        role: 'assistant',
        content: t('assistant.welcome')
      }
    ]);
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

  const handleSend = async (overrideMessage?: string) => {
    const messageToSend = overrideMessage || input.trim();
    if (!messageToSend || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageToSend,
      attachedImage: attachedImage || undefined
    };

    setMessages(prev => [...prev, userMessage]);
    // Save user message to conversation
    queueMessage(userMessage);
    
    const currentInput = messageToSend;
    const currentAttachedImage = attachedImage;
    setInput('');
    setAttachedImage(null);
    setIsLoading(true);
    
    // Reset textarea height to default
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      // Check if user wants to use the official logo in their image
      const wantsLogo = requiresLogoAsset(currentInput);
      const isCreativeLogo = wantsLogo && isCreativeLogoRequest(currentInput);
      
      // If just asking "show me the logo" without creative context, display it directly
      if (wantsLogo && !isCreativeLogo) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: t('assistant.officialLogo'),
          imageUrl: ftvLogoSymbol
        };
        setMessages(prev => [...prev, assistantMessage]);
        queueMessage(assistantMessage);
        setIsLoading(false);
        
        if (alwaysSpeakReplies) {
          setTimeout(() => speak("Here's the official DeHub logo!"), 300);
        }
        return;
      }
      
      // If creative logo request, convert logo to base64 and use as source image
      let effectiveSourceImage = currentAttachedImage;
      if (isCreativeLogo) {
        effectiveSourceImage = await imageUrlToBase64(ftvLogoSymbol);
      }

      // Check request type
      const isVideoRequest = requiresVideoGeneration(currentInput);
      const isImageRequest = isCreativeLogo || requiresImageGeneration(currentInput, !!currentAttachedImage);
      
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
            sourceImage: effectiveSourceImage || undefined,
            conversationHistory,
            model: selectedImageModel
          }
        });

        if (error) throw error;
        
        // Check for error in response (like safety blocks or content refusals)
        if (data.error) {
          const errorMessage = data.safetyBlocked 
            ? t('assistant.safetyBlocked')
            : data.error;
          
          // If clearHistory flag is set, reset to just the welcome message
          // This prevents previous inappropriate requests from affecting future normal requests
          if (data.clearHistory) {
            setMessages([
              {
                id: 'initial',
                role: 'assistant',
                content: t('assistant.welcomeAlt')
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
        queueMessage(assistantMessage);
      } else {
        // Regular chat - use general-ai-chat endpoint with retry
        const chatBody = {
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          })),
          style: selectedStyle,
          model: selectedChatModel,
          isAuthenticated,
          userLanguage
        };

        let data: any = null;
        let lastError: any = null;
        const maxRetries = 2;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const result = await supabase.functions.invoke('general-ai-chat', { body: chatBody });
            if (result.error) {
              // supabase.functions.invoke wraps non-2xx as FunctionsHttpError
              // Check if the response body has details
              const errBody = result.data;
              if (errBody?.errorCode) {
                const enrichedError = new Error(errBody.error || result.error.message);
                (enrichedError as any).errorCode = errBody.errorCode;
                (enrichedError as any).statusCode = errBody.statusCode;
                throw enrichedError;
              }
              throw result.error;
            }
            // Check for error in response body (e.g. 429, 504 forwarded as JSON)
            if (result.data?.error && !result.data?.response) {
              const bodyError = new Error(result.data.error);
              (bodyError as any).errorCode = result.data.errorCode;
              (bodyError as any).statusCode = result.data.statusCode;
              throw bodyError;
            }
            data = result.data;
            lastError = null;
            break;
          } catch (err: any) {
            lastError = err;
            const errorCode = err?.errorCode || 'UNKNOWN';
            console.warn(`[Assistant] Attempt ${attempt + 1}/${maxRetries + 1} failed [${errorCode}]:`, err?.message || err);
            // Don't retry rate limits or credit issues
            if (errorCode === 'RATE_LIMIT' || errorCode === 'CREDITS_EXHAUSTED') {
              break;
            }
            if (attempt < maxRetries) {
              await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // 1s, 2s backoff
            }
          }
        }

        if (lastError || !data) throw lastError || new Error('No response from AI');

        // Show fallback toast if Grok was requested but not available
        if (data.fallbackUsed) {
          toast.info('Using DeHub AI - Grok API key not configured');
        }

        // Check if this is a transaction simulation response
        if (data.isSimulation) {
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: data.response,
            isSimulation: true,
            simulationType: data.simulationType,
            simulationData: data.simulationData,
            simulationStatus: 'pending'
          };
          setMessages(prev => [...prev, assistantMessage]);
        } else {
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: data.response || t('assistant.noResponse')
          };

          setMessages(prev => [...prev, assistantMessage]);
          queueMessage(assistantMessage);
          
          // Auto-speak the response if always speak replies is enabled
          if (alwaysSpeakReplies) {
            setTimeout(() => {
              speak(assistantMessage.content);
            }, 300);
          }
        }
      }
    } catch (error: any) {
      console.error('AI chat error:', error);
      const errorCode = error?.errorCode || 'UNKNOWN';
      const statusCode = error?.statusCode;
      
      // Build user-facing error message based on error type
      let userErrorMessage: string;
      switch (errorCode) {
        case 'RATE_LIMIT':
          userErrorMessage = '⏳ Rate limit reached. Please wait a moment and try again.';
          break;
        case 'CREDITS_EXHAUSTED':
          userErrorMessage = '💳 AI credits exhausted. Please try again later.';
          break;
        case 'TIMEOUT':
          userErrorMessage = '⏱️ Request timed out. The AI service may be busy — please try again.';
          break;
        case 'UPSTREAM_ERROR':
          userErrorMessage = `🔧 AI service error (${statusCode || 'unknown'}). The AI provider is having issues. Please try again in a moment.`;
          break;
        default:
          userErrorMessage = `❌ Something went wrong: ${error?.message || 'Unknown error'}. Please try again.`;
          break;
      }
      
      // Log error details to backend for diagnostics
      try {
        await supabase.from('client_error_logs').insert({
          level: 'error',
          message: `Assistant error [${errorCode}]: ${error?.message || 'Unknown error'}`,
          component: 'AssistantPage',
          metadata: {
            userMessage: currentInput?.substring(0, 100),
            model: selectedChatModel,
            errorCode,
            statusCode,
            errorName: error?.name,
            errorStack: error?.stack?.substring(0, 500),
          },
          user_address: null,
        });
      } catch (logErr) {
        console.warn('[Assistant] Failed to log error:', logErr);
      }
      const errorId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, {
        id: errorId,
        role: 'assistant',
        content: userErrorMessage,
        isError: true,
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

  // Helper function to abbreviate transaction hash for mobile display
  const abbreviateHash = (hash: string) => {
    if (hash.length <= 20) return hash;
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
  };

  // Handle simulation approval - simulate successful transaction
  const handleSimulationApprove = (messageId: string) => {
    // Update the simulation status
    setMessages(prev => prev.map(m => 
      m.id === messageId ? { ...m, simulationStatus: 'approved' as const } : m
    ));
    
    toast.success(t('assistant.transferComplete'));
  };

  // Handle simulation rejection
  const handleSimulationReject = (messageId: string) => {
    setMessages(prev => prev.map(m => 
      m.id === messageId ? { ...m, simulationStatus: 'rejected' as const } : m
    ));
    toast.info('Transaction rejected');
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

  const handleChatModelSelect = (modelId: string) => {
    setSelectedChatModel(modelId);
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

  // Convert video URL to FileList for PostModal
  const handlePostVideo = async (videoUrl: string) => {
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const file = new File([blob], 'ai-generated-video.mp4', { type: 'video/mp4' });
      
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      
      setPostModalFiles(dataTransfer.files);
      setPostModalOpen(true);
    } catch (error) {
      console.error('Error preparing video for post:', error);
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
              <p className="text-white text-lg font-medium">{t('assistant.dropImageHere')}</p>
              <p className="text-white/50 text-sm">{t('assistant.toAttachForEditing')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <img src={aiSparkleIcon} alt="Assistant" className="w-10 h-10 object-contain" />
          <h1 className="text-lg font-semibold text-white leading-none mt-0.5">{t('assistant.title')}</h1>
        </div>

        <div className="flex items-center gap-4">
          {/* Command Centre Toggle */}
          <button
            onClick={() => setShowCommandCentre(!showCommandCentre)}
            className={`p-1.5 rounded-xl transition-colors ${
              showCommandCentre ? 'text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
          </button>

          {/* History Button */}
          <button
            onClick={() => setHistoryDrawerOpen(true)}
            className="p-1.5 rounded-xl text-white/60 hover:text-white transition-colors"
          >
            <History className="w-5 h-5" />
          </button>

          {/* Settings Button */}
          <button
            onClick={() => setSettingsSheetOpen(true)}
            className="p-1.5 rounded-xl text-white/60 hover:text-white transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>

          {/* Style Selector Button */}
          <button
            onClick={() => setStyleSheetOpen(true)}
            className="p-1.5 rounded-xl text-white/60 hover:text-white transition-colors text-xl"
          >
            {currentStyle.emoji}
          </button>
        </div>

        {/* Style Drawer */}
        <Drawer open={styleSheetOpen} onOpenChange={setStyleSheetOpen}>
          <DrawerContent glass className="border-t border-white/10">
            <DrawerHeader className="border-b border-white/10">
              <DrawerTitle className="text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-white" />
                {t('assistant.aiPersonality')}
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
                {t('assistant.aiSettings')}
              </DrawerTitle>
            </DrawerHeader>
            <div className="h-[70vh] overflow-y-auto">
              {/* Chat Model Section */}
              <div className="border-b border-white/10 pb-4">
                <div className="px-4 py-3 text-sm text-white/60 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  {t('assistant.chatModel')}
                </div>
                {CHAT_MODEL_OPTIONS.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => handleChatModelSelect(model.id)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors ${
                      selectedChatModel === model.id ? 'bg-white/10' : ''
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

              {/* Image Model Section */}
              <div className="border-b border-white/10 pb-4">
                <div className="px-4 py-3 text-sm text-white/60 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  {t('assistant.imageModel')}
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
                  {t('assistant.videoModel')}
                </div>
                {/* Premium tier */}
                <div className="px-4 py-1 text-xs text-white/40 uppercase tracking-wider">{t('assistant.premium')}</div>
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
                <div className="px-4 py-1 text-xs text-white/40 uppercase tracking-wider mt-2">{t('assistant.standard')}</div>
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
                <div className="px-4 py-1 text-xs text-white/40 uppercase tracking-wider mt-2">{t('assistant.fast')}</div>
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
                  {t('assistant.aiVoice')}
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
                
                {/* Always Speak Toggle */}
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm text-white">{t('assistant.alwaysSpeakReplies')}</span>
                    <span className="text-xs text-white/50">{t('assistant.alwaysSpeakRepliesDesc')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAlwaysSpeakReplies(!alwaysSpeakReplies)}
                    className={`relative w-11 h-6 rounded-lg transition-colors ${
                      alwaysSpeakReplies ? 'bg-white/50' : 'bg-white/20'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-lg bg-white transition-transform ${
                        alwaysSpeakReplies ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      {/* Conditional content: Command Centre or Chat */}
      {showCommandCentre ? (
        /* Command Centre View */
        <ScrollArea className="flex-1 px-4 pb-24 lg:pb-4">
          <OverviewTab />
        </ScrollArea>
      ) : (
        <>
          {/* Messages */}
          <ScrollArea className="flex-1 px-4 pb-24 sm:pb-0 [&>div>div]:!block [&_[data-radix-scroll-area-scrollbar]]:hidden scrollbar-hide [&_*]:scrollbar-hide" ref={scrollRef}>
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
                    {/* AI Avatar for assistant messages - hide for initial welcome message */}
                    {message.role === 'assistant' && message.id !== 'initial' && (
                      <img 
                        src={assistantAvatar} 
                        alt="" 
                        className="w-7 h-7 rounded-full shrink-0 mt-0.5"
                      />
                    )}
                    {message.role === 'assistant' && message.videoUrl ? (
                      /* Video messages */
                      <div className="max-w-[85%] flex flex-col gap-2">
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
                          {/* Action buttons */}
                          <div className="absolute bottom-12 right-3 flex items-center gap-2">
                            {/* Download button */}
                            <a
                              href={message.videoUrl}
                              download="dehub-video.mp4"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center w-10 h-10 rounded-xl text-white transition-all duration-300 hover:scale-110 active:scale-95
                                bg-gradient-to-br from-white/25 via-white/15 to-white/5
                                backdrop-blur-xl border border-white/30
                                shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_2px_0_rgba(255,255,255,0.3),0_0_0_1px_rgba(0,0,0,0.1)]
                                hover:shadow-[0_12px_40px_rgba(59,130,246,0.4),inset_0_2px_0_rgba(255,255,255,0.4)]
                                hover:border-blue-400/50 hover:from-blue-500/30 hover:via-blue-400/15 hover:to-transparent"
                            >
                              <Download className="w-5 h-5" />
                            </a>
                            {/* Post button */}
                            <button
                              onClick={() => handlePostVideo(message.videoUrl!)}
                              className="flex items-center justify-center w-10 h-10 rounded-xl text-white transition-all duration-300 hover:scale-110 active:scale-95
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
                                toast.success(t('assistant.imageAttached'));
                              }}
                              className="flex items-center justify-center w-10 h-10 rounded-xl text-white transition-all duration-300 hover:scale-110 active:scale-95
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
                                  toast.success(t('assistant.imageCopied'));
                                } catch (err) {
                                  toast.error(t('assistant.imageCopyFailed'));
                                }
                              }}
                              className="flex items-center justify-center w-10 h-10 rounded-xl text-white transition-all duration-300 hover:scale-110 active:scale-95
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
                              className="flex items-center justify-center w-10 h-10 rounded-xl text-white transition-all duration-300 hover:scale-110 active:scale-95
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
                    ) : message.isSimulation ? (
                      /* Transaction simulation card */
                      <div className="max-w-[85%] flex flex-col gap-2">
                        {/* Simulation content with markdown */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                          <MarkdownText content={message.content} className="text-sm text-white" />
                          
                          {/* Approve/Reject buttons - only show if pending */}
                          {message.simulationStatus === 'pending' && (
                            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-white/10">
                              <button
                                onClick={() => handleSimulationApprove(message.id)}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                                  bg-white/10 hover:bg-white/20
                                  border border-white/20 hover:border-white/40
                                  text-white font-medium text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                              >
                                <Check className="w-4 h-4" />
                                {t('assistant.approve')}
                              </button>
                              <button
                                onClick={() => handleSimulationReject(message.id)}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                                  bg-white/5 hover:bg-white/10
                                  border border-white/10 hover:border-white/20
                                  text-white/70 hover:text-white font-medium text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                              >
                                <XCircle className="w-4 h-4" />
                                {t('assistant.reject')}
                              </button>
                            </div>
                          )}
                          
                          {/* Status badge for approved/rejected */}
                          {message.simulationStatus === 'approved' && message.simulationData && (
                            <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-white/10">
                              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 border border-white/20 w-fit">
                                <Check className="w-4 h-4 text-white" />
                                <span className="text-sm text-white">{t('assistant.transferComplete')}</span>
                              </div>
                              <div className="text-xs text-white/60">
                                <span className="text-white/40">{t('assistant.hash')}: </span>
                                <code className="font-mono text-white/70">{abbreviateHash(message.simulationData.txHash)}</code>
                              </div>
                            </div>
                          )}
                          
                          {message.simulationStatus === 'rejected' && (
                            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/10">
                              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 border border-white/20">
                                <XCircle className="w-4 h-4 text-white/70" />
                                <span className="text-sm text-white/70">{t('assistant.transferCancelled')}</span>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {/* Action buttons below the card - only show for pending */}
                        {message.simulationStatus === 'pending' && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setShowPinModal(true)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                                ${transferPin 
                                  ? 'bg-white/10 text-white border border-white/20' 
                                  : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white'
                                }`}
                            >
                              <Lock className="w-3.5 h-3.5" />
                              {transferPin ? t('assistant.pinSet') : t('assistant.setPin')}
                            </button>
                            <button
                              onClick={() => {
                                setAutoApproveMode(!autoApproveMode);
                                toast.success(autoApproveMode ? t('assistant.autoModeDisabled') : t('assistant.autoModeEnabled'));
                              }}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                                ${autoApproveMode 
                                  ? 'bg-white/15 text-white border border-white/30' 
                                  : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white'
                                }`}
                            >
                              <Zap className="w-3.5 h-3.5" />
                              {t('assistant.autoMode')} {autoApproveMode ? t('assistant.on') : t('assistant.off')}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Text messages */
                      <div className={`max-w-[85%] flex flex-col gap-2 ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                        {/* Show attached image for user messages */}
                        {message.attachedImage && (
                          <img 
                            src={message.attachedImage} 
                            alt="Attached" 
                            className="max-w-full rounded-lg"
                          />
                        )}
                        {message.role === 'user' ? (
                          /* User message with liquid glass bubble */
                          <LiquidGlassBubble tail="right">
                            <p className="text-sm whitespace-pre-wrap text-white">{message.content}</p>
                          </LiquidGlassBubble>
                        ) : (
                          /* Assistant message - no bubble */
                          <div className="text-white">
                            <MarkdownText content={message.content} className="text-sm" />
                            {message.isError && (
                              <button
                                onClick={() => {
                                  const idx = messages.indexOf(message);
                                  const lastUserMsg = messages.slice(0, idx).reverse().find(m => m.role === 'user');
                                  if (lastUserMsg) {
                                    setMessages(prev => prev.filter(m => m.id !== message.id));
                                    handleSend(lastUserMsg.content);
                                  }
                                }}
                                className="mt-2 text-xs text-white/60 hover:text-white/90 underline transition-colors"
                              >
                                {t('assistant.retry', 'Retry')}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {/* Quick action buttons - show only on initial state */}
              {messages.length === 1 && messages[0].id === 'initial' && !isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative mt-4 -mx-4 px-4 lg:mx-0 lg:px-0"
                >
                  <div 
                    className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1 pr-8 lg:pr-0 lg:flex-wrap lg:overflow-visible lg:mask-none"
                    style={{
                      maskImage: 'linear-gradient(to right, black 85%, transparent 100%)',
                      WebkitMaskImage: 'linear-gradient(to right, black 85%, transparent 100%)'
                    }}
                  >
                    <button
                      onClick={() => {
                        handleSend(t('assistant.whatsHappeningNews'));
                      }}
                      className="px-3 py-1.5 text-xs rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all whitespace-nowrap shrink-0"
                    >
                      {t('assistant.whatsNew')}
                    </button>
                    <button
                      onClick={() => {
                        setInput(t('assistant.generateImageOf'));
                        inputRef.current?.focus();
                        setInputGlow(true);
                        setTimeout(() => setInputGlow(false), 2000);
                      }}
                      className="px-3 py-1.5 text-xs rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all whitespace-nowrap shrink-0"
                    >
                      {t('assistant.generateImage')}
                    </button>
                    <button
                      onClick={() => {
                        fileInputRef.current?.click();
                      }}
                      className="px-3 py-1.5 text-xs rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all whitespace-nowrap shrink-0"
                    >
                      {t('assistant.editImage')}
                    </button>
                    <button
                      onClick={() => {
                        setInput(t('assistant.generateVideoOf'));
                        inputRef.current?.focus();
                        setInputGlow(true);
                        setTimeout(() => setInputGlow(false), 2000);
                      }}
                      className="px-3 py-1.5 text-xs rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all whitespace-nowrap shrink-0"
                    >
                      {t('assistant.generateVideo')}
                    </button>
                  </div>
                </motion.div>
              )}
              {isImageLoading && (
                <ImageGenerationLoader startTime={imageLoadStartTime} />
              )}
              {isLoading && !isImageLoading && (
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
                    <span className="text-sm text-white/60">{t('assistant.thinking')}</span>
                  </div>
                </motion.div>
              )}
              {/* Scroll anchor */}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input - Fixed above bottom nav on mobile/tablet, fixed at bottom on desktop */}
          <div className="fixed bottom-[69px] md:bottom-[75px] left-0 right-0 px-2 z-40 lg:bottom-4 lg:left-auto lg:right-auto lg:px-4 lg:w-full lg:max-w-4xl lg:mx-auto lg:relative lg:z-auto lg:-translate-y-[5.3px]">
            <div className="mx-auto max-w-[72%] md:max-w-md lg:max-w-none">
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
              {/* Glow effect wrapper */}
              <div className={`relative flex flex-col lg:flex-row lg:items-end gap-0 lg:gap-2 bg-zinc-900/10 backdrop-blur-2xl rounded-2xl px-3 py-2 border shadow-xl transition-all duration-500 ${
                inputGlow 
                  ? 'border-white/60 shadow-[0_0_20px_rgba(255,255,255,0.3)]' 
                  : 'border-white/10'
              }`}>
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
                
                {/* Desktop: buttons inline left of textarea */}
                <div className="hidden lg:flex items-end gap-0">
                  {/* Attach button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-white hover:text-white/80 transition-colors p-1 shrink-0 mb-0.5"
                      >
                        <Paperclip className="w-5 h-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t('assistant.attachFile')}</TooltipContent>
                  </Tooltip>
                  
                  {/* Voice recording button */}
                  {isVoiceSupported && (
                    <Tooltip>
                      <TooltipTrigger asChild>
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
                      </TooltipTrigger>
                      <TooltipContent>{isRecording ? t('assistant.stopRecording') : t('assistant.voiceInput')}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                
                {/* Auto-expanding textarea */}
                <textarea
                  ref={inputRef}
                  value={isRecording ? transcript : input}
                  onChange={(e) => {
                    if (!isRecording) {
                      const newValue = e.target.value;
                      setInput(newValue);
                      mention.handleInput(newValue, e.target.selectionStart);
                      e.target.style.height = 'auto';
                      const maxHeight = window.innerHeight * 0.45;
                      const newHeight = Math.min(e.target.scrollHeight, maxHeight);
                      e.target.style.height = `${newHeight}px`;
                    }
                  }}
                  onKeyDown={(e) => {
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
                  }}
                  onPaste={handlePaste}
                  placeholder={isRecording ? t('assistant.listening') : attachedImage ? t('assistant.describeEdits') : t('assistant.askAnything')}
                  className={`flex-1 bg-transparent text-sm text-white placeholder:text-white/50 focus:outline-none min-w-0 resize-none overflow-y-auto leading-relaxed py-1 pr-20 lg:pr-0 ${
                    isRecording ? 'text-white/60 italic' : ''
                  }`}
                  style={{ 
                    minHeight: isMobile ? '48px' : '24px',
                    maxHeight: '45vh'
                  }}
                  rows={isMobile ? 2 : 1}
                  readOnly={isRecording}
                />
                
                {/* User Mention Dropdown */}
                <UserMentionDropdown
                  query={mention.query}
                  isOpen={mention.isOpen}
                  position={mention.position}
                  selectedIndex={mention.selectedIndex}
                  onSelectedIndexChange={mention.setSelectedIndex}
                  onSelect={mention.handleSelect}
                  onClose={mention.handleClose}
                />
                
                {/* Mobile: action buttons in bottom-right corner */}
                <div className="absolute bottom-2 right-2 flex items-center gap-1 lg:hidden">
                  {/* Attach button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-white/60 hover:text-white transition-colors p-1"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                  
                  {/* Voice recording button */}
                  {isVoiceSupported && (
                    <button
                      type="button"
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={isLoading}
                      className={`transition-colors p-1 disabled:opacity-30 ${
                        isRecording ? 'text-red-500' : 'text-white/60 hover:text-white'
                      }`}
                    >
                      {isRecording ? (
                        <div className="w-4 h-4 flex items-center justify-center">
                          <Square className="w-3 h-3 fill-current animate-pulse" />
                        </div>
                      ) : (
                        <Mic className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  
                  {/* Stop speaking button */}
                  {isSpeaking && (
                    <button
                      type="button"
                      onClick={stopSpeaking}
                      className="text-white hover:text-white/80 transition-colors p-1 animate-pulse"
                    >
                      <VolumeX className="w-4 h-4" />
                    </button>
                  )}
                  
                  {/* Send button */}
                  <button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={(!input.trim() && !isRecording) || isLoading}
                    className="text-white hover:text-white/80 transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                
                {/* Desktop: inline end buttons */}
                <div className="hidden lg:flex items-end gap-0">
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
                      <TooltipContent>{t('assistant.stopSpeaking')}</TooltipContent>
                    </Tooltip>
                  )}
                  
                  {/* Send button */}
                  <button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={(!input.trim() && !isRecording) || isLoading}
                    className="text-white hover:text-white/80 transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed shrink-0 mb-0.5"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

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

      {/* Conversation History Drawer */}
      <ConversationHistoryDrawer
        open={historyDrawerOpen}
        onOpenChange={setHistoryDrawerOpen}
        onLoadConversation={(id, loadedMessages) => {
          loadConversation(id);
          setMessages(loadedMessages);
        }}
        currentConversationId={conversationId}
      />

      {/* Auth Prompt for transaction simulation */}
      <AuthPrompt 
        isOpen={showAuthPrompt} 
        onClose={() => setShowAuthPrompt(false)} 
      />

      {/* PIN Setup Modal */}
      <AnimatePresence>
        {showPinModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowPinModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-zinc-900 border border-white/10 rounded-2xl p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <Lock className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">{t('assistant.setTransferPin')}</h3>
                  <p className="text-sm text-white/60">{t('assistant.requiredBeforeApproving')}</p>
                </div>
              </div>
              
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder={t('assistant.enterPin')}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-center text-xl tracking-[0.5em] placeholder:text-white/30 placeholder:tracking-normal focus:outline-none focus:border-white/30 mb-4"
              />
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowPinModal(false);
                    setPinInput('');
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 font-medium text-sm hover:bg-white/10 transition-all"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => {
                    if (pinInput.length >= 4) {
                      setTransferPin(pinInput);
                      setShowPinModal(false);
                      setPinInput('');
                      toast.success(t('assistant.pinSetSuccess'));
                    } else {
                      toast.error(t('assistant.pinTooShort'));
                    }
                  }}
                  disabled={pinInput.length < 4}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white font-medium text-sm hover:bg-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('assistant.setPinButton')}
                </button>
              </div>
              
              {transferPin && (
                <button
                  onClick={() => {
                    setTransferPin(null);
                    setShowPinModal(false);
                    setPinInput('');
                    toast.success(t('assistant.pinRemoved'));
                  }}
                  className="w-full mt-3 px-4 py-2 rounded-xl text-white/50 text-sm hover:text-white/70 transition-colors"
                >
                  {t('assistant.removeExistingPin')}
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
