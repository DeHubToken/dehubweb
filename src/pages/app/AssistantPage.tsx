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
import { createPortal } from 'react-dom';
import { useTranslation as useI18n } from 'react-i18next';
import { Send, Sparkles, Loader2, ChevronDown, ImageIcon, X, Plus, Copy, Paperclip, Video, Settings, Download, Mic, Square, Volume2, VolumeX, LayoutDashboard, Check, XCircle, Lock, Zap, History, AudioLines } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useVoiceChat } from '@/hooks/use-voice-chat';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUserLanguage } from '@/hooks/use-user-language';
import { useMention } from '@/hooks/use-mention';
import { useAuth } from '@/contexts/AuthContext';
import dehubLogo from '@/assets/dehub-logo-white.png';
import dehubLogoPrimary from '@/assets/dehub-logo-primary.png.asset.json';
import dehubLogoIcon from '@/assets/dehub-logo-icon.png.asset.json';
import assistantAvatar from '@/assets/ai-assistant-avatar.png';
import aiSparkleIcon from '@/assets/icons/ai-sparkle-icon.png';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';
import { MarkdownText } from '@/lib/markdown';

import { AI_ASSISTANT_STYLE_OPTIONS } from '@/constants/ai-styles.constants';
import { VIDEO_MODELS, VIDEO_MODEL_OPTIONS, type VideoModelKey, type VideoModel } from '@/constants/video-models.constants';
import { IMAGE_MODELS, IMAGE_MODEL_OPTIONS, type ImageModelKey } from '@/constants/image-models.constants';
import { VOICE_PREFERENCES, VOICE_PREFERENCE_OPTIONS, type VoicePreferenceKey } from '@/constants/voice-models.constants';
import { ElevenLabsVoicePicker } from '@/components/app/shared/ElevenLabsVoicePicker';
import { VoiceTrainingDrawer } from '@/components/app/shared/VoiceTrainingDrawer';
import { CHAT_MODEL_OPTIONS, DEFAULT_CHAT_MODEL, type ChatModelKey } from '@/constants/chat-models.constants';
import { PostModal } from '@/features/post';
import { getBadgeName } from '@/lib/staking-badges';
import { VideoPaywallModal, type VideoGenerationOptions } from '@/components/app/video/VideoPaywallModal';
import { ImagePaywallModal } from '@/components/app/image/ImagePaywallModal';
import { AiToolPaywallModal } from '@/components/app/ai-tools/AiToolPaywallModal';
import { AI_TOOL_MODELS, type AiToolCategory, type AiToolModel } from '@/constants/ai-tools.constants';
import { OverviewTab } from '@/components/app/command-centre';
import { AuthPrompt } from '@/components/app/AuthPrompt';
import { useUserSkills, incrementSkillUsage, type UserSkill } from '@/hooks/use-user-skills';
import { matchSkill, extractSlashSkill } from '@/lib/skills/matchTriggerPhrases';
import { SlashSkillDropdown, filterSkills } from '@/components/app/skills/SlashSkillDropdown';
import { SkillsBrowserModal } from '@/components/app/skills/SkillsBrowserModal';
import { useUserCharacters, incrementCharacterUsage } from '@/hooks/use-user-characters';
import { parseCharacterMentions, buildCharacterPersonaBlock } from '@/lib/characters/parseCharacterMentions';
import { AuthGate } from '@/components/app/AuthGate';
import { UserMentionDropdown, type MentionUser } from '@/components/app/mentions';
import { ConversationHistoryDrawer } from '@/components/app/assistant/ConversationHistoryDrawer';
import { GeneratedAudioPlayer } from '@/components/app/assistant/GeneratedAudioPlayer';
import { MusicConfirmDialog, type MusicParams } from '@/components/app/assistant/MusicConfirmDialog';
import { PosterConfigDialog, type PosterConfig } from '@/components/app/assistant/PosterConfigDialog';
import { SkillsHubModal } from '@/components/app/assistant/SkillsHubModal';
import { SwapActionCard } from '@/components/app/chat/SwapActionCard';
import { useAIConversation } from '@/hooks/use-ai-conversation';
import { streamChat } from '@/lib/stream-chat';
import { useVoiceAssistant } from '@/hooks/use-voice-assistant';
import { VoiceAssistantOverlay } from '@/components/app/assistant/VoiceAssistantOverlay';
import { useVoiceCredits } from '@/hooks/use-voice-credits';
import { VoiceCreditPurchaseModal } from '@/components/app/assistant/VoiceCreditPurchaseModal';
import { AiToolProcessingSkeleton } from '@/components/app/assistant/AiToolProcessingSkeleton';
import { useAssistantUserContext } from '@/hooks/use-assistant-user-context';
import { LiquidGlassBubble } from '@/components/ui/liquid-glass-bubble';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';

const DEHUB_BRAND_IMAGE_MODEL: ImageModelKey = 'gemini-3.1-flash-image';
const DEHUB_BRAND_IMAGE_KEYWORDS = [
  'poster', 'banner', 'thumbnail', 'content', 'card', 'announce', 'announcement',
  'flyer', 'artwork', 'social', 'cover', 'graphic', 'ad', 'advert', 'image',
  'wallpaper', 'meme', 'creative', 'promo', 'promotion', 'campaign'
];

// Simulation data for token transactions
interface SimulationData {
  txHash: string;
  amount: string;
  recipient?: string;
  token: string;
  timestamp: string;
}

interface SwapAction {
  tokenIn: string;
  tokenOut: string;
  tokenInSymbol: string;
  tokenOutSymbol: string;
  amount: string;
  amountType: 'input' | 'output';
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;       // For generated/edited images in responses
  videoUrl?: string;       // For generated videos
  audioUrl?: string;       // For generated audio (music/TTS)
  attachedImage?: string;  // For user-attached images to edit
  isVideoGenerating?: boolean;
  videoPredictionId?: string;
  isToolProcessing?: boolean;   // For async AI tool processing
  toolRequestId?: string;       // fal.ai request ID for polling
  toolAppId?: string;           // fal.ai app ID for polling
  toolType?: string;            // tool identifier
  isSimulation?: boolean;  // For transaction simulations
  simulationType?: 'transfer' | 'purchase';
  simulationData?: SimulationData;
  simulationStatus?: 'pending' | 'approved' | 'rejected';
  isError?: boolean;
  swapAction?: SwapAction;
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

function isDeHubBrandedImageRequest(message: string): boolean {
  const lower = message.toLowerCase();
  const mentionsDeHub = /\bde\s*hub\b/.test(lower) || /\bdhb\b/.test(lower);
  return mentionsDeHub && DEHUB_BRAND_IMAGE_KEYWORDS.some(keyword => lower.includes(keyword));
}

function buildDeHubBrandPrompt(userRequest: string): string {
  return `DEHUB BRAND SYSTEM (mandatory):
- The attached image is the official DeHub wordmark. Composite it prominently, crisp, unaltered, pure white, with clear space around it. Do not redraw, recolor, gradient-fill, warp, or replace it.
- Palette: deep black / charcoal backgrounds, white text, subtle white-opacity accents. Never use blue.
- Aesthetic: liquid glass, frosted blur, cinematic, premium, decentralized-tech, lots of negative space, strong focal hierarchy.
- Typography if any: use the Exo / Exo 2 typeface family (geometric technical sans-serif) for ALL rendered text — Light/Regular for body and links, Medium/SemiBold for headings, Bold only for short display words. Pure white, generous letter-spacing. Never Inter, Poppins, DM Sans, serifs, or script. Fallbacks: Eurostile, Michroma, Rajdhani. No emoji. No generic AI clichés.

OFFICIAL DEHUB LINKS (render ONLY if the user explicitly asks for socials, links, website, QR, or contact info — otherwise omit entirely):
- Website: dehub.io
- X / Twitter: x.com/dehub_official
- Telegram (main): t.me/dehub_dhb
- Discord: discord.gg/dehub
- Regional Telegrams: Turkish t.me/Dehub_Turkish · Arabic t.me/Dehub_Arabic · Hindi t.me/dehub_hindi · China t.me/dehub_china · Indonesia t.me/dehub_indonesia · Germany t.me/dehub_dach · Vietnam t.me/dehub_vietnam · Philippines t.me/DeHub_Philippines
When rendering links: pure white, Exo / Exo 2 (Light or Regular), small size, bottom of composition, generous letter-spacing, no icons unless requested. Only include the specific links the user asked for (e.g. "with socials" = X + Telegram + Discord + Website; "with website" = just dehub.io).

USER REQUEST: ${userRequest}`;
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

// ─── AI Tool Keywords ───


const MUSIC_KEYWORDS = [
  'generate music', 'create music', 'make music', 'compose', 'song',
  'create a song', 'make a song', 'generate a song', 'write a song',
  'music for', 'beat', 'track', 'melody', 'instrumental',
  'make me a beat', 'create a beat', 'generate a beat',
  'write music', 'compose music', 'create a track'
];

const TTS_KEYWORDS = [
  'text to speech', 'text-to-speech', 'tts', 'read this aloud',
  'say this', 'speak this', 'convert to speech', 'voice over',
  'voiceover', 'narrate', 'narration', 'read out loud',
  'generate speech', 'create speech', 'make speech',
  'dialogue', 'voice this', 'read this text'
];

const BG_REMOVAL_KEYWORDS = [
  'remove background', 'remove the background', 'remove bg',
  'background removal', 'cut out', 'cutout', 'transparent background',
  'make transparent', 'isolate subject', 'extract subject',
  'no background', 'delete background', 'erase background'
];

const UPSCALE_KEYWORDS = [
  'upscale', 'upscale this', 'enhance image', 'increase resolution',
  'make higher resolution', 'make hd', 'make 4k', 'sharpen image',
  'improve quality', 'super resolution', 'enlarge image',
  'make bigger', 'enhance this', 'enhance quality'
];

const STT_KEYWORDS = [
  'transcribe', 'transcription', 'speech to text', 'speech-to-text',
  'stt', 'convert audio', 'audio to text', 'what does this say',
  'what is being said', 'convert speech', 'transcribe audio',
  'transcribe this'
];

function detectAiToolRequest(message: string, hasImage: boolean): AiToolCategory | null {
  const lower = message.toLowerCase();
  if (MUSIC_KEYWORDS.some(k => lower.includes(k))) return 'music';
  if (TTS_KEYWORDS.some(k => lower.includes(k))) return 'tts';
  if (STT_KEYWORDS.some(k => lower.includes(k))) return 'speech-to-text';
  if (hasImage && BG_REMOVAL_KEYWORDS.some(k => lower.includes(k))) return 'background-removal';
  if (hasImage && UPSCALE_KEYWORDS.some(k => lower.includes(k))) return 'upscale';
  return null;
}

const DEFAULT_TOOL_FOR_CATEGORY: Record<AiToolCategory, string> = {
  'music': 'minimax-music',
  'tts': 'dia-tts',
  'background-removal': 'birefnet',
  'upscale': 'creative-upscaler',
  'speech-to-text': 'whisper',
};
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
  // Slash-command skill picker
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashRange, setSlashRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [slashSelected, setSlashSelected] = useState(0);
  const [skillsBrowserOpen, setSkillsBrowserOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  useEffect(() => {
    if (!lightboxImage) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxImage(null); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [lightboxImage]);
  const { data: userSkills = [] } = useUserSkills();
  const { data: userCharacters = [] } = useUserCharacters();
  // Prefill input from ?skill=slug (deep-link from Skills library)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('skill');
    if (slug) {
      setInput((prev) => prev || `/${slug} `);
      // clean URL so it doesn't re-trigger
      const url = new URL(window.location.href);
      url.searchParams.delete('skill');
      window.history.replaceState({}, '', url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [imageLoadStartTime, setImageLoadStartTime] = useState<number>(0);
  const [selectedStyle, setSelectedStyle] = useState<string>('normal');
  const [selectedVideoModel, setSelectedVideoModel] = useState<VideoModelKey>('kling-2.6-pro');
  const [selectedImageModel, setSelectedImageModel] = useState<ImageModelKey>('gemini-2.5-flash');
  const [selectedVoice, setSelectedVoice] = useState<VoicePreferenceKey>('female');
  // ElevenLabs voice selection: { type: 'browser', preset } or { type: 'elevenlabs', voiceId }
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('dehub-assistant-voice');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.type === 'elevenlabs') return parsed.voiceId;
      }
    } catch {}
    return '';
  });
  const [voiceTrainingOpen, setVoiceTrainingOpen] = useState(false);
  const [showApiKeyPrompt, setShowApiKeyPrompt] = useState(false);
  const [customElevenLabsKey, setCustomElevenLabsKey] = useState(() => {
    try { return localStorage.getItem('dehub-custom-elevenlabs-key') || ''; } catch { return ''; }
  });
  const [apiKeyInput, setApiKeyInput] = useState('');
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
  const [imagePaywallOpen, setImagePaywallOpen] = useState(false);
  const [pendingImageRequest, setPendingImageRequest] = useState<{
    prompt: string;
    model: ImageModelKey;
    sourceImage?: string;
  } | null>(null);
  // DeHub poster config drawer
  const [posterConfigOpen, setPosterConfigOpen] = useState(false);
  const [pendingPosterPrompt, setPendingPosterPrompt] = useState<string>('');
  // Skills hub modal
  const [skillsHubOpen, setSkillsHubOpen] = useState(false);

  // Handle preset hash (?/# from /creator tiles): e.g. #preset=image | poster | skills | video | song | edit | chat
  useEffect(() => {
    const applyPreset = () => {
      const hash = typeof window !== 'undefined' ? window.location.hash : '';
      const match = hash.match(/preset=([a-z]+)/i);
      if (!match) return;
      const preset = match[1].toLowerCase();
      // Clear hash so re-navigation re-triggers cleanly
      if (typeof window !== 'undefined' && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      switch (preset) {
        case 'skills':
          setSkillsHubOpen(true);
          break;
        case 'poster':
          setPendingPosterPrompt('');
          setPosterConfigOpen(true);
          break;
        case 'song':
          setPendingMusicPrompt('');
          setMusicConfirmOpen(true);
          break;
        case 'edit':
          fileInputRef.current?.click();
          break;
        case 'image':
          setInput(t('assistant.generateImageOf'));
          inputRef.current?.focus();
          setInputGlow(true);
          setTimeout(() => setInputGlow(false), 2000);
          break;
        case 'video':
          setInput(t('assistant.generateVideoOf'));
          inputRef.current?.focus();
          setInputGlow(true);
          setTimeout(() => setInputGlow(false), 2000);
          break;
        case 'voice':
        case 'chat':
        default:
          inputRef.current?.focus();
          break;
      }
    };
    applyPreset();
    window.addEventListener('hashchange', applyPreset);
    return () => window.removeEventListener('hashchange', applyPreset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // AI Tools state
  const [aiToolPaywallOpen, setAiToolPaywallOpen] = useState(false);
  const [selectedAiToolId, setSelectedAiToolId] = useState<string>('minimax-music');
  const [aiToolCategory, setAiToolCategory] = useState<AiToolCategory>('music');
  const [isAiToolProcessing, setIsAiToolProcessing] = useState(false);
  const [pendingAiToolRequest, setPendingAiToolRequest] = useState<{
    prompt: string;
    tool: string;
    category: AiToolCategory;
    sourceImage?: string;
    audioUrl?: string;
  } | null>(null);
  const [musicConfirmOpen, setMusicConfirmOpen] = useState(false);
  const [pendingMusicPrompt, setPendingMusicPrompt] = useState('');

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

  // Persist/restore pending AI tool requests across reloads
  const PENDING_TOOL_KEY = 'dehub-pending-ai-tool';
  const savePendingTool = useCallback((data: {
    requestId: string; appId: string; messageId: string; toolKey: string;
    statusUrl?: string; responseUrl?: string; content: string;
  }) => {
    try { localStorage.setItem(PENDING_TOOL_KEY, JSON.stringify(data)); } catch {}
  }, []);
  const clearPendingTool = useCallback(() => {
    try { localStorage.removeItem(PENDING_TOOL_KEY); } catch {}
  }, []);

  // Persist/restore pending video generation across reloads
  const PENDING_VIDEO_KEY = 'dehub-pending-video';
  const savePendingVideo = useCallback((data: {
    predictionId: string; messageId: string; provider?: string; falAppId?: string; content: string;
  }) => {
    try { localStorage.setItem(PENDING_VIDEO_KEY, JSON.stringify(data)); } catch {}
  }, []);
  const clearPendingVideo = useCallback(() => {
    try { localStorage.removeItem(PENDING_VIDEO_KEY); } catch {}
  }, []);
  const pendingVoiceRef = useRef(false); // Track if last input was voice

  const { isAuthenticated, walletAddress, user } = useAuth();
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
  
  // User context for AI assistant personalization
  const userContext = useAssistantUserContext();

  // Voice credits (prepaid bundles)
  const voiceCredits = useVoiceCredits(walletAddress);
  const [voiceCreditModalOpen, setVoiceCreditModalOpen] = useState(false);
  const voiceCreditDeductRef = useRef(voiceCredits.deductCredit);
  const voiceStopRef = useRef<(() => void) | null>(null);
  useEffect(() => { voiceCreditDeductRef.current = voiceCredits.deductCredit; }, [voiceCredits.deductCredit]);

  // Voice Assistant hook (Whisper STT + Dia TTS via fal.ai)
  const voiceAssistant = useVoiceAssistant({
    onTranscript: (text) => {
      // Deduct a voice credit per exchange
      const hasCredit = voiceCreditDeductRef.current();
      if (!hasCredit) {
        voiceStopRef.current?.();
        toast.error('Voice credits exhausted — purchase more to continue');
        setVoiceCreditModalOpen(true);
        return;
      }
      voiceTranscriptHandlerRef.current?.(text);
    },
    isChatLoading: isLoading,
  });
  const voiceTranscriptHandlerRef = useRef<((text: string) => void) | null>(null);
  voiceStopRef.current = voiceAssistant.stopVoiceMode;

  // Auth gate is rendered in JSX below (do NOT early-return here — it changes
  // hook count between renders and triggers React error #310 on login/logout).


  
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

  // ElevenLabs TTS speak function - routes through edge function when an ElevenLabs voice is selected
  const elevenLabsSpeak = useCallback(async (text: string) => {
    if (!elevenLabsVoiceId) {
      // Fallback to browser TTS
      speak(text);
      return;
    }
    try {
      // Clean text for TTS
      const cleanText = text
        .replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '')
        .replace(/#{1,6}\s/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\n+/g, '. ').trim().slice(0, 500);
      if (!cleanText) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text: cleanText, voiceId: elevenLabsVoiceId }),
        }
      );
      if (!response.ok) throw new Error('TTS failed');
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      await audio.play();
    } catch (err) {
      console.error('ElevenLabs TTS error:', err);
      // Fallback to browser TTS
      speak(text);
    }
  }, [elevenLabsVoiceId, speak]);


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
          userLanguage,
          userContext
        }
      });

      if (error) throw error;

      // Show fallback toast if Grok was requested but not available
      if (data.fallbackUsed) {
        toast.info(t('assistant.fallbackGrokNotConfigured'));
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
          elevenLabsSpeak(responseText);
        }, 300);
      }
    } catch (error: any) {
      console.error('AI chat error (voice):', error);
      const errorCode = error?.errorCode || 'UNKNOWN';
      let msg = errorCode === 'RATE_LIMIT' ? t('assistant.errorRateLimit')
        : errorCode === 'TIMEOUT' ? t('assistant.errorTimeout')
        : `❌ ${error?.message || t('assistant.errorGeneric')}`;
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: msg,
        isError: true,
      }]);
    } finally {
      setIsLoading(false);
      pendingVoiceRef.current = false;
    }
  };

  // Wire up voice assistant transcript handler
  // When voice assistant gets a transcript, send it through the regular chat flow
  // and then speak the response with Dia TTS
  voiceTranscriptHandlerRef.current = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
    };

    setMessages(prev => [...prev, userMessage]);
    queueMessage(userMessage);
    setInput('');
    setIsLoading(true);

    try {
      const chatBody = {
        messages: [...messages, userMessage].map(m => ({
          role: m.role,
          content: m.content,
        })),
        style: selectedStyle,
        model: selectedChatModel,
        isAuthenticated,
        userLanguage,
        userContext,
        dehubToken: localStorage.getItem('dehub_token') || undefined,
      };

      const streamingMsgId = (Date.now() + 1).toString();
      let streamedContent = '';
      let isFirstToken = true;

      await streamChat({
        body: chatBody,
        onDelta: (delta) => {
          streamedContent += delta;
          if (isFirstToken) {
            isFirstToken = false;
            setMessages(prev => [...prev, {
              id: streamingMsgId,
              role: 'assistant',
              content: streamedContent,
            }]);
          } else {
            setMessages(prev => {
              const updated = [...prev];
              const lastIdx = updated.length - 1;
              if (lastIdx >= 0 && updated[lastIdx].id === streamingMsgId) {
                updated[lastIdx] = { ...updated[lastIdx], content: streamedContent };
              }
              return updated;
            });
          }
        },
        onDone: () => {
          const finalMessage: Message = {
            id: streamingMsgId,
            role: 'assistant',
            content: streamedContent || 'No response',
          };
          queueMessage(finalMessage);
          setIsLoading(false);

          // Speak the response via Dia TTS
          if (streamedContent && voiceAssistant.isVoiceMode) {
            voiceAssistant.speakResponse(streamedContent);
          }
        },
        onError: (err) => {
          setMessages(prev => [...prev, {
            id: (Date.now() + 2).toString(),
            role: 'assistant',
            content: `❌ ${err?.message || 'Voice chat error'}`,
            isError: true,
          }]);
          setIsLoading(false);
          // Restart listening even on error
          if (voiceAssistant.isVoiceMode) {
            voiceAssistant.speakResponse('Sorry, I encountered an error. Please try again.');
          }
        },
      });
    } catch (error: any) {
      console.error('[VoiceAssistant] Chat error:', error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ ${error?.message || 'Unknown error'}`,
        isError: true,
      }]);
      setIsLoading(false);
    }
  }, [messages, selectedStyle, selectedChatModel, isAuthenticated, userLanguage, userContext, isLoading, voiceAssistant]);


  useEffect(() => {
    setMessages([]);
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

  // Restore pending AI tool request on mount (survives reload)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PENDING_TOOL_KEY);
      if (!raw) return;
      const pending = JSON.parse(raw) as {
        requestId: string; appId: string; messageId: string; toolKey: string;
        statusUrl?: string; responseUrl?: string; content: string;
      };
      // Re-inject the processing message
      const restoredMessage: Message = {
        id: pending.messageId,
        role: 'assistant',
        content: pending.content || '⏳ Resuming processing...',
        isToolProcessing: true,
        toolRequestId: pending.requestId,
        toolAppId: pending.appId,
        toolType: pending.toolKey,
      };
      setMessages(prev => {
        // Avoid duplicates
        if (prev.some(m => m.id === pending.messageId)) return prev;
        return [...prev, restoredMessage];
      });
      setIsAiToolProcessing(true);

      // Resume polling
      if (!pollingRef.current[pending.requestId]) {
        pollingRef.current[pending.requestId] = setInterval(() => {
          pollAiToolStatus(pending.requestId, pending.appId, pending.messageId, pending.toolKey, pending.statusUrl, pending.responseUrl);
        }, 5000);
        // Fire one immediately
        pollAiToolStatus(pending.requestId, pending.appId, pending.messageId, pending.toolKey, pending.statusUrl, pending.responseUrl);
      }
      console.log('[AI Tool] Restored pending request from localStorage:', pending.requestId);
    } catch {}

    // Restore pending video generation
    try {
      const rawVideo = localStorage.getItem(PENDING_VIDEO_KEY);
      if (rawVideo) {
        const pending = JSON.parse(rawVideo) as {
          predictionId: string; messageId: string; provider?: string; falAppId?: string; content: string;
        };
        const restoredMsg: Message = {
          id: pending.messageId,
          role: 'assistant',
          content: pending.content || '🎬 Resuming video generation...',
          isVideoGenerating: true,
          videoPredictionId: pending.predictionId,
        };
        setMessages(prev => {
          if (prev.some(m => m.id === pending.messageId)) return prev;
          return [...prev, restoredMsg];
        });
        setIsVideoLoading(true);

        if (!pollingRef.current[pending.predictionId]) {
          pollingRef.current[pending.predictionId] = setInterval(() => {
            pollVideoStatus(pending.predictionId, pending.messageId, pending.provider, pending.falAppId);
          }, 5000);
          pollVideoStatus(pending.predictionId, pending.messageId, pending.provider, pending.falAppId);
        }
        console.log('[Video] Restored pending video from localStorage:', pending.predictionId);
      }
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


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
  const pollVideoStatus = useCallback(async (predictionId: string, messageId: string, provider?: string, falAppId?: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('generate-video', {
        body: { predictionId, provider, falAppId }
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
        clearPendingVideo();
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
            ? { ...m, content: t('assistant.videoGenFailedDetail', { error: data.error || 'Unknown error' }), isVideoGenerating: false }
            : m
        ));
        setIsVideoLoading(false);
        clearPendingVideo();
        toast.error(t('assistant.errorVideoGenFailed'));
      }
      // If still processing, keep polling
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, [clearPendingVideo]);

  // Handle video generation after payment confirmation
  const handleVideoGenerationConfirm = async (options?: VideoGenerationOptions) => {
    if (!pendingVideoRequest) return;

    const { prompt, model, sourceImage } = pendingVideoRequest;
    const videoModel = VIDEO_MODELS[model];

    // User message was already added by handleSend before paywall opened
    // Don't add it again

    setPaywallOpen(false);
    setIsVideoLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('generate-video', {
        body: {
          prompt,
          model,
          sourceImage,
          duration: options?.duration ? `${options.duration}s` : '5s',
          aspectRatio: '16:9',
          ...(options?.negativePrompt && { negativePrompt: options.negativePrompt }),
          ...(options?.resolution && { resolution: options.resolution }),
          ...(options?.referenceImageUrls && options.referenceImageUrls.length > 0 && { referenceImageUrls: options.referenceImageUrls }),
          ...(options?.endFrameUrl && { endFrameUrl: options.endFrameUrl }),
          ...(options?.audioUrls && options.audioUrls.length > 0 && { audioUrls: options.audioUrls }),
          ...(options?.videoUrls && options.videoUrls.length > 0 && { videoUrls: options.videoUrls }),
          ...(options?.seed !== undefined && { seed: options.seed }),
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
        pollVideoStatus(data.predictionId, messageId, data.provider, data.falAppId);
      }, 5000);

      // Persist so it survives reloads
      savePendingVideo({
        predictionId: data.predictionId,
        messageId,
        provider: data.provider,
        falAppId: data.falAppId,
        content: `🎬 Generating video with **${videoModel.name}**...\n\n_This may take 1-3 minutes_`,
      });

      toast.success(t('assistant.paymentSuccessGenerating'));
    } catch (err) {
      console.error('Video generation error:', err);
      toast.error(t('assistant.errorVideoGenStart'));
      setIsVideoLoading(false);
    }

    setPendingVideoRequest(null);
  };

  // Handle image generation after payment confirmation
  const handleImageGenerationConfirm = async (override?: { prompt: string; model: string; sourceImage?: string; logoImage?: string }) => {
    const req = override ?? pendingImageRequest;
    if (!req) return;

    const { prompt, model, sourceImage } = req;
    const logoImage = override?.logoImage;
    const imageModel = IMAGE_MODELS[model];

    // User message was already added by handleSend before paywall opened
    // Don't add it again

    setImagePaywallOpen(false);
    setIsImageLoading(true);
    setImageLoadStartTime(Date.now());

    try {
      const conversationHistory = messages
        .filter(m => m.id !== 'initial')
        .map(m => ({ role: m.role, content: m.content }));

      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: {
          prompt,
          sourceImage: sourceImage || undefined,
          logoImage: logoImage || undefined,
          conversationHistory,
          model
        }
      });

      if (error) throw error;

      if (data.error) {
        const errorMessage = data.safetyBlocked
          ? t('assistant.safetyBlocked')
          : data.error;

        if (data.clearHistory) {
          setMessages([
            { id: (Date.now() + 1).toString(), role: 'assistant', content: errorMessage }
          ]);
        } else {
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: errorMessage
          }]);
        }
        setPendingImageRequest(null);
        return;
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        imageUrl: data.imageUrl
      };

      setMessages(prev => [...prev, assistantMessage]);
      queueMessage(assistantMessage);
      toast.success(t('assistant.imageGenerated'));
    } catch (err) {
      console.error('Image generation error:', err);
      toast.error(t('assistant.errorImageGenFailed'));
    } finally {
      setIsImageLoading(false);
      setPendingImageRequest(null);
    }
  };

  // ─── AI Tool Handlers ───

  const pollAiToolStatus = useCallback(async (requestId: string, appId: string, messageId: string, toolKey: string, statusUrl?: string, responseUrl?: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('fal-ai-tools', {
        body: { requestId, appId, statusUrl, responseUrl }
      });

      if (error) throw error;

      if (data.status === 'succeeded') {
        clearInterval(pollingRef.current[requestId]);
        delete pollingRef.current[requestId];
        clearPendingTool();

        const toolModel = AI_TOOL_MODELS[toolKey];

        // Regular completion
        const completedMessage: Message = {
          id: messageId,
          role: 'assistant',
          content: '',
          isToolProcessing: false,
        };
        if (data.audioUrl) {
          completedMessage.audioUrl = data.audioUrl;
        } else if (data.imageUrl) {
          completedMessage.imageUrl = data.imageUrl;
        }
        if (data.text) completedMessage.content = `📝 **Transcription:**\n\n${data.text}`;
        if (!data.audioUrl && !data.imageUrl && !data.text) {
          completedMessage.content = `✅ ${toolModel?.name || 'Tool'} completed successfully.`;
        }

        setMessages(prev => prev.map(m => m.id !== messageId ? m : completedMessage));

        // Persist to conversation history
        queueMessage(completedMessage);

        setIsAiToolProcessing(false);
        toast.success(`${toolModel?.name || 'AI Tool'} completed!`);
      } else if (data.status === 'failed') {
        clearInterval(pollingRef.current[requestId]);
        delete pollingRef.current[requestId];
        clearPendingTool();

        setMessages(prev => prev.map(m =>
          m.id === messageId ? { ...m, isToolProcessing: false, content: `❌ Processing failed: ${data.error || 'Unknown error'}` } : m
        ));
        setIsAiToolProcessing(false);
      }
    } catch (err) {
      console.error('[AI Tool] Polling error:', err);
    }
  }, [pollVideoStatus, clearPendingTool, clearPendingVideo, savePendingVideo, queueMessage]);

  const handleAiToolConfirm = async () => {
    if (!pendingAiToolRequest) return;

    const { prompt, tool, category, sourceImage } = pendingAiToolRequest;
    const toolModel = AI_TOOL_MODELS[tool];

    setAiToolPaywallOpen(false);
    setIsAiToolProcessing(true);

    try {
      const actualTool = tool;
      const body: Record<string, unknown> = { tool: actualTool, prompt };
      if (sourceImage) body.image_url = sourceImage;
      if (category === 'tts') body.text = prompt;
      // Pass lyrics separately for music tools
      if ((pendingAiToolRequest as any)?.lyrics) {
        body.lyrics = (pendingAiToolRequest as any).lyrics;
      }

      const { data, error } = await supabase.functions.invoke('fal-ai-tools', { body });

      if (error) throw error;

      if (data.error) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `❌ ${data.error}`
        }]);
        setIsAiToolProcessing(false);
        setPendingAiToolRequest(null);
        return;
      }

      if (data.status === 'succeeded') {
        // Synchronous tool — result is ready
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '',
          ...(data.audioUrl ? { audioUrl: data.audioUrl } : data.imageUrl ? { imageUrl: data.imageUrl } : {}),
          ...(data.text && { content: `📝 **Transcription:**\n\n${data.text}` }),
        };
        if (!assistantMessage.audioUrl && !assistantMessage.imageUrl && !assistantMessage.content) {
          assistantMessage.content = `✅ ${toolModel.name} completed.`;
        }
        setMessages(prev => [...prev, assistantMessage]);
        queueMessage(assistantMessage);
        setIsAiToolProcessing(false);
        toast.success(`${toolModel.name} completed!`);
      } else {
        // Async tool — start polling
        const messageId = (Date.now() + 1).toString();
        const label = toolModel.name;
        const desc = 'This may take a minute';
        const assistantMessage: Message = {
          id: messageId,
          role: 'assistant',
          content: `${toolModel.emoji} Processing with **${label}**...\n\n_${desc}_`,
          isToolProcessing: true,
          toolRequestId: data.requestId,
          toolAppId: data.appId,
          toolType: tool,
        };
        setMessages(prev => [...prev, assistantMessage]);


        // Persist pending request for reload recovery
        savePendingTool({
          requestId: data.requestId, appId: data.appId, messageId,
          toolKey: tool,
          statusUrl: data.statusUrl, responseUrl: data.responseUrl,
          content: assistantMessage.content,
        });

        pollingRef.current[data.requestId] = setInterval(() => {
          pollAiToolStatus(data.requestId, data.appId, messageId, tool, data.statusUrl, data.responseUrl);
        }, 5000);
      }
    } catch (err) {
      console.error('[AI Tool] Error:', err);
      toast.error('AI tool processing failed.');
      setIsAiToolProcessing(false);
    }

    setPendingAiToolRequest(null);
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

    // ── Skill matching: slash command wins, otherwise auto-trigger ──
    const slash = extractSlashSkill(messageToSend, userSkills);
    const matchedSkill: UserSkill | null = slash.skill ?? matchSkill(messageToSend, userSkills);
    const skillCleanedInput = slash.skill ? slash.cleaned : messageToSend;
    let skillSourceImage: string | null = null;
    if (matchedSkill) {
      // Use first asset as reference image when generating an image skill
      if (matchedSkill.kind === 'image' && matchedSkill.asset_urls.length > 0) {
        try {
          skillSourceImage = await imageUrlToBase64(matchedSkill.asset_urls[0]);
        } catch {
          // non-fatal
        }
      }
      void incrementSkillUsage(matchedSkill.id);
      toast(`Using skill: ${matchedSkill.name}`, { duration: 2000 });
    }

    // ── Character mention matching ──
    const charMatch = parseCharacterMentions(skillCleanedInput, userCharacters);
    let characterSourceImage: string | null = null;
    if (charMatch.hasMentions) {
      const primary = charMatch.characters[0].primary_image_url
        ?? charMatch.characters[0].reference_image_urls[0];
      if (primary) {
        try { characterSourceImage = await imageUrlToBase64(primary); } catch { /* non-fatal */ }
      }
      charMatch.characters.forEach((c) => void incrementCharacterUsage(c.id));
      const names = charMatch.characters.map((c) => c.name).join(', ');
      toast(`Using character${charMatch.characters.length > 1 ? 's' : ''}: ${names}`, { duration: 2000 });
    }

    const personaBlock = buildCharacterPersonaBlock(charMatch.characters);
    const promptCore = charMatch.cleanedPrompt;
    const effectiveInput = matchedSkill
      ? `${matchedSkill.system_prompt}${personaBlock ? `\n\n${personaBlock}` : ''}\n\nUser request: ${promptCore}`
      : personaBlock
        ? `${personaBlock}\n\nUser request: ${promptCore}`
        : messageToSend;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageToSend,
      attachedImage: attachedImage || undefined
    };

    setMessages(prev => [...prev, userMessage]);
    // Save user message to conversation
    queueMessage(userMessage);
    
    const currentInput = effectiveInput;
    const currentAttachedImage = attachedImage || skillSourceImage || characterSourceImage;
    setInput('');
    setAttachedImage(null);
    setIsLoading(true);
    
    // Reset textarea height to default
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      // Check if user wants to use the official logo in their image
      const wantsDeHubBrand = matchedSkill?.slug === 'dehub-poster' || isDeHubBrandedImageRequest(messageToSend) || isDeHubBrandedImageRequest(currentInput);
      const wantsLogo = wantsDeHubBrand || requiresLogoAsset(currentInput);
      const isCreativeLogo = wantsLogo && isCreativeLogoRequest(currentInput);
      
      // If just asking "show me the logo" without creative context, display it directly
      if (wantsLogo && !isCreativeLogo) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: t('assistant.officialLogo'),
          imageUrl: dehubLogo
        };
        setMessages(prev => [...prev, assistantMessage]);
        queueMessage(assistantMessage);
        setIsLoading(false);
        
        if (alwaysSpeakReplies) {
          setTimeout(() => elevenLabsSpeak("Here's the official DeHub logo!"), 300);
        }
        return;
      }
      
      // If creative logo request, convert logo to base64 and use as source image
      let effectiveSourceImage = currentAttachedImage;
      if (wantsDeHubBrand || isCreativeLogo) {
        effectiveSourceImage = await imageUrlToBase64(dehubLogo);
      }

      // Check request type — AI tools first, then video/image
      const aiToolCategory = detectAiToolRequest(currentInput, !!currentAttachedImage);
      const isVideoRequest = !aiToolCategory && requiresVideoGeneration(currentInput);
      const isImageRequest = !aiToolCategory && (isCreativeLogo || matchedSkill?.kind === 'image' || charMatch.hasMentions || requiresImageGeneration(currentInput, !!currentAttachedImage));
      
      if (aiToolCategory) {
        // For music requests, show confirm dialog first
        if (aiToolCategory === 'music') {
          setPendingMusicPrompt(currentInput);
          setAiToolCategory(aiToolCategory);
          setIsAiToolProcessing(false); // Reset in case previous request got stuck
          setMusicConfirmOpen(true);
          setIsLoading(false);
          return;
        }
        const defaultTool = DEFAULT_TOOL_FOR_CATEGORY[aiToolCategory];
        setPendingAiToolRequest({
          prompt: currentInput,
          tool: defaultTool,
          category: aiToolCategory,
          sourceImage: currentAttachedImage || undefined,
        });
        setSelectedAiToolId(defaultTool);
        setAiToolCategory(aiToolCategory);
        setIsAiToolProcessing(false); // Reset in case previous request got stuck
        setAiToolPaywallOpen(true);
        return;
      } else if (isVideoRequest) {
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
        // DeHub-branded posters get the poster studio drawer first
        // (dimensions, style archetype, roadmap feature spotlight, tagline, links).
        if (wantsDeHubBrand) {
          setPendingPosterPrompt(messageToSend);
          setPosterConfigOpen(true);
          setIsLoading(false);
          return;
        }
        const imgReq = {
          prompt: currentInput,
          model: selectedImageModel,
          sourceImage: effectiveSourceImage || currentAttachedImage || undefined,
        };
        // Show image paywall instead of generating directly
        setPendingImageRequest(imgReq);
        setImagePaywallOpen(true);
        setIsLoading(false);
        return;
      } else {
        // Regular chat - use streaming for token-by-token rendering
        const chatBody = {
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          })),
          style: selectedStyle,
          model: selectedChatModel,
          isAuthenticated,
          userLanguage,
          userContext,
          dehubToken: localStorage.getItem('dehub_token') || undefined,
        };

        const streamingMsgId = (Date.now() + 1).toString();
        let streamedContent = '';
        let isFirstToken = true;

        await streamChat({
          body: chatBody,
          onDelta: (text) => {
            streamedContent += text;
            if (isFirstToken) {
              // Create the assistant message on first token
              isFirstToken = false;
              setMessages(prev => [...prev, {
                id: streamingMsgId,
                role: 'assistant',
                content: streamedContent,
              }]);
            } else {
              // Update the last assistant message content
              setMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (lastIdx >= 0 && updated[lastIdx].id === streamingMsgId) {
                  updated[lastIdx] = { ...updated[lastIdx], content: streamedContent };
                }
                return updated;
              });
            }
          },
          onMeta: (meta) => {
            if (meta.fallbackUsed) {
              toast.info(t('assistant.fallbackGrokNotConfigured'));
            }
          },
          onDone: () => {
            // Save to conversation history
            const finalMessage: Message = {
              id: streamingMsgId,
              role: 'assistant',
              content: streamedContent || t('assistant.noResponse'),
            };
            queueMessage(finalMessage);

            // Auto-speak if enabled
            if (alwaysSpeakReplies && streamedContent) {
              setTimeout(() => {
                elevenLabsSpeak(streamedContent);
              }, 300);
            }
          },
          onError: (err) => {
            // Surface error to the UI
            const errorCode = (err as any)?.errorCode || 'UNKNOWN';
            let userErrorMessage: string;
            switch (errorCode) {
              case 'RATE_LIMIT':
                userErrorMessage = t('assistant.errorRateLimit');
                break;
              case 'CREDITS_EXHAUSTED':
                userErrorMessage = t('assistant.errorCreditsExhausted');
                break;
              case 'TIMEOUT':
                userErrorMessage = t('assistant.errorTimeout');
                break;
              default:
                userErrorMessage = t('assistant.errorUnknown', { message: err?.message || 'Unknown error' });
                break;
            }
            const errorId = (Date.now() + 2).toString();
            setMessages(prev => [...prev, {
              id: errorId,
              role: 'assistant',
              content: userErrorMessage,
              isError: true,
            }]);
            setIsLoading(false);
          },
        });
      }
    } catch (error: any) {
      console.error('AI chat error:', error);
      const errorCode = error?.errorCode || 'UNKNOWN';
      const statusCode = error?.statusCode;
      
      // Build user-facing error message based on error type
      let userErrorMessage: string;
      switch (errorCode) {
        case 'RATE_LIMIT':
          userErrorMessage = t('assistant.errorRateLimit');
          break;
        case 'CREDITS_EXHAUSTED':
          userErrorMessage = t('assistant.errorCreditsExhausted');
          break;
        case 'TIMEOUT':
          userErrorMessage = t('assistant.errorTimeout');
          break;
        case 'UPSTREAM_ERROR':
          userErrorMessage = t('assistant.errorUpstream', { status: statusCode || 'unknown' });
          break;
        default:
          userErrorMessage = t('assistant.errorUnknown', { message: error?.message || 'Unknown error' });
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

  if (!isAuthenticated) {
    return <AuthGate description={t('assistant.loginRequired')} />;
  }

  return (
    <div 
      className="flex flex-col h-full lg:h-screen relative overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <SEOHead title="AI Assistant — Chat, Generate Images & Video" description="Chat with DeHub's AI assistant. Generate images, create videos, get web search results, and explore AI capabilities — all in one place." url="https://dehub.io/app/assistant" jsonLd={{ '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'DeHub AI Assistant', url: 'https://dehub.io/app/assistant', applicationCategory: 'UtilitiesApplication', description: 'AI assistant for chat, image generation, video creation and web search.', operatingSystem: 'Web', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }} />
      <h1 className="sr-only">DeHub AI Assistant — Decentralised Social Media, Censorship Resistant & Freedom of Speech</h1>
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
        <button
          onClick={() => {
            startNewConversation();
            setMessages([]);
            setInput('');
            setAttachedImage(null);
          }}
          className="flex items-center gap-3 group"
        >
          <img src={aiSparkleIcon} alt="Assistant" className="w-10 h-10 object-contain group-hover:scale-110 transition-transform" />
          <h1 className="text-lg font-semibold text-white leading-none mt-0.5">{t('assistant.title')}</h1>
        </button>

        <div className="flex items-center gap-4">
          {/* New Chat Button */}
          <button
            onClick={() => {
              startNewConversation();
              setMessages([]);
              setInput('');
              setAttachedImage(null);
            }}
            className="p-1.5 rounded-xl text-white/60 hover:text-white transition-colors"
            title="New chat"
          >
            <Plus className="w-5 h-5" />
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
                
                {/* System default voice option */}
                <button
                  type="button"
                  onClick={() => {
                    setElevenLabsVoiceId('');
                    localStorage.setItem('dehub-assistant-voice', JSON.stringify({ type: 'browser', preset: selectedVoice }));
                  }}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors ${
                    !elevenLabsVoiceId ? 'bg-white/10' : ''
                  }`}
                >
                  <span className="text-lg">🤖</span>
                  <div className="flex flex-col items-start">
                    <span className="font-medium">System Default</span>
                    <span className="text-xs text-white/50">Browser built-in voice</span>
                  </div>
                </button>

                {/* ElevenLabs Voice Picker */}
                <div className="px-4 py-2">
                  <ElevenLabsVoicePicker
                    selectedVoiceId={elevenLabsVoiceId}
                    onSelect={(voiceId) => {
                      setElevenLabsVoiceId(voiceId);
                      localStorage.setItem('dehub-assistant-voice', JSON.stringify({ type: 'elevenlabs', voiceId }));
                    }}
                    onTrainVoice={() => {
                      const badgeName = getBadgeName(user?.badgeBalance, user?.username);
                      const allowed = badgeName === 'Meglodon' || badgeName === 'Blue Whale';

                      setSettingsSheetOpen(false);

                      if (!allowed) {
                        // Check if user already has a saved custom key
                        if (customElevenLabsKey) {
                          setVoiceTrainingOpen(true);
                        } else {
                          setApiKeyInput('');
                          setShowApiKeyPrompt(true);
                        }
                        return;
                      }

                      setVoiceTrainingOpen(true);
                    }}
                  />
                </div>
                
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

      {/* Voice Training Drawer */}
      <VoiceTrainingDrawer
        open={voiceTrainingOpen}
        onOpenChange={setVoiceTrainingOpen}
        onSuccess={() => {
          // Picker will refetch custom voices automatically
        }}
        customApiKey={(() => {
          const badgeName = getBadgeName(user?.badgeBalance, user?.username);
          const isWhale = badgeName === 'Meglodon' || badgeName === 'Blue Whale';
          return isWhale ? undefined : customElevenLabsKey || undefined;
        })()}
      />

      {/* API Key Prompt for non-whale users */}
      {showApiKeyPrompt && createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowApiKeyPrompt(false)}
        >
          <div 
            className="w-[90%] max-w-md rounded-2xl bg-black/95 border border-white/10 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-white">Voice Cloning Access</h3>
              <p className="text-sm text-white/60">
                Voice cloning is free for <span className="font-bold text-white">Blue Whale</span> and <span className="font-bold text-white">Megalodon</span> badge holders.
              </p>
              <p className="text-sm text-white/60">
                You can still clone voices by providing your own ElevenLabs API key. Get one free at{' '}
                <a href="https://elevenlabs.io" target="_blank" rel="noopener noreferrer" className="text-white/80 underline hover:text-white">elevenlabs.io</a>
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-white/50">ElevenLabs API Key</label>
              <Input
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="xi_..."
                type="password"
                className="bg-white/10 border-white/10 text-white placeholder:text-white/30 font-mono text-sm"
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => setShowApiKeyPrompt(false)}
                variant="outline"
                className="flex-1 bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
              >
                Cancel
              </Button>
              <LiquidGlassBubble
                shimmer
                noBorder
                onClick={() => {
                  if (!apiKeyInput.trim()) {
                    toast.error('Please enter your ElevenLabs API key');
                    return;
                  }
                  setCustomElevenLabsKey(apiKeyInput.trim());
                  localStorage.setItem('dehub-custom-elevenlabs-key', apiKeyInput.trim());
                  setShowApiKeyPrompt(false);
                  setVoiceTrainingOpen(true);
                }}
                className="flex-1 cursor-pointer [&>div]:!rounded-xl [&>div]:!h-full [&>div]:before:!rounded-xl [&>div]:after:!rounded-xl"
                style={{ height: '40px' }}
              >
                <span className="flex items-center justify-center text-white text-sm font-medium h-full">
                  Continue
                </span>
              </LiquidGlassBubble>
            </div>

            <p className="text-[10px] text-white/25 text-center">
              Your key is stored locally and never shared. It's only used for voice cloning requests.
            </p>
          </div>
        </div>,
        document.body
      )}


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
                    {message.role === 'assistant' && message.audioUrl ? (
                      /* Audio messages (music/TTS) */
                      <div className="w-full min-w-0 flex-1 flex flex-col gap-2">
                        {message.content && (
                          <div className="rounded-2xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] px-4 py-2.5 text-white">
                            <MarkdownText content={message.content} className="text-sm" />
                          </div>
                        )}
                        <GeneratedAudioPlayer audioUrl={message.audioUrl} />
                      </div>
                    ) : message.role === 'assistant' && message.isToolProcessing ? (
                      /* AI tool processing skeleton */
                      <AiToolProcessingSkeleton content={message.content} />
                    ) : message.role === 'assistant' && message.videoUrl ? (
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
                            {...{"webkit-playsinline": ""}}
                            className="max-w-full rounded-lg"
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
                        {/* Image container with button overlay */}
                        <div className="relative">
                          <img 
                            src={message.imageUrl} 
                            alt="Generated" 
                            className="max-w-full rounded-lg cursor-zoom-in"
                            onClick={() => setLightboxImage(message.imageUrl!)}
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
                            {/* Swap action card */}
                            {message.swapAction && (
                              <SwapActionCard action={message.swapAction} autoQuote />
                            )}
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
              
              {/* Quick action buttons - show when not loading */}
              {!isLoading && !isImageLoading && !isVideoLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative mt-4 -mx-4 px-4 lg:mx-0 lg:px-0"
                >
                  <div 
                    className="flex gap-1.5 overflow-x-auto scrollbar-hide pt-2.5 pb-1 pr-8 lg:pr-0 lg:flex-wrap lg:overflow-visible lg:mask-none"
                    style={{
                      maskImage: 'linear-gradient(to right, black 85%, transparent 100%)',
                      WebkitMaskImage: 'linear-gradient(to right, black 85%, transparent 100%)'
                    }}
                  >
                    
                    <div className="relative shrink-0">
                      <LiquidGlassBubble2
                        label="🧠 Skills"
                        onClick={() => setSkillsHubOpen(true)}
                        width="auto"
                        height="32px"
                        className="[&>div]:!py-1 [&>div]:!px-3 [&>div]:from-zinc-900/90 [&>div]:to-white/5 [&>div]:before:from-transparent [&>div]:after:from-transparent [&_span]:!text-xs"
                      />
                      <span className="pointer-events-none absolute -top-1.5 -right-1.5 text-[8px] font-bold tracking-wider bg-white text-black rounded px-1 py-[1px] leading-none">TEST</span>
                    </div>
                    <div className="relative shrink-0">
                      <LiquidGlassBubble2
                        label="🎨 Make DeHub Poster"
                        onClick={() => {
                          setPendingPosterPrompt('');
                          setPosterConfigOpen(true);
                        }}
                        width="auto"
                        height="32px"
                        className="[&>div]:!py-1 [&>div]:!px-3 [&>div]:from-zinc-900/90 [&>div]:to-white/5 [&>div]:before:from-transparent [&>div]:after:from-transparent [&_span]:!text-xs"
                      />
                      <span className="pointer-events-none absolute -top-1.5 -right-1.5 text-[8px] font-bold tracking-wider bg-white text-black rounded px-1 py-[1px] leading-none">TEST</span>
                    </div>
                    <LiquidGlassBubble2
                      label={`🖼️ ${t('assistant.generateImage')}`}
                      onClick={() => {
                        setInput(t('assistant.generateImageOf'));
                        inputRef.current?.focus();
                        setInputGlow(true);
                        setTimeout(() => setInputGlow(false), 2000);
                      }}
                      width="auto"
                      height="32px"
                      className="shrink-0 [&>div]:!py-1 [&>div]:!px-3 [&>div]:from-zinc-900/90 [&>div]:to-white/5 [&>div]:before:from-transparent [&>div]:after:from-transparent [&_span]:!text-xs"
                    />
                    <LiquidGlassBubble2
                      label={`✏️ ${t('assistant.editImage')}`}
                      onClick={() => fileInputRef.current?.click()}
                      width="auto"
                      height="32px"
                      className="shrink-0 [&>div]:!py-1 [&>div]:!px-3 [&>div]:from-zinc-900/90 [&>div]:to-white/5 [&>div]:before:from-transparent [&>div]:after:from-transparent [&_span]:!text-xs"
                    />
                    <LiquidGlassBubble2
                      label={`🎥 ${t('assistant.generateVideo')}`}
                      onClick={() => {
                        setInput(t('assistant.generateVideoOf'));
                        inputRef.current?.focus();
                        setInputGlow(true);
                        setTimeout(() => setInputGlow(false), 2000);
                      }}
                      width="auto"
                      height="32px"
                      className="shrink-0 [&>div]:!py-1 [&>div]:!px-3 [&>div]:from-zinc-900/90 [&>div]:to-white/5 [&>div]:before:from-transparent [&>div]:after:from-transparent [&_span]:!text-xs"
                    />
                    <LiquidGlassBubble2
                      label="🎵 Create a song"
                      onClick={() => {
                        setPendingMusicPrompt('');
                        setMusicConfirmOpen(true);
                      }}
                      width="auto"
                      height="32px"
                      className="shrink-0 [&>div]:!py-1 [&>div]:!px-3 [&>div]:from-zinc-900/90 [&>div]:to-white/5 [&>div]:before:from-transparent [&>div]:after:from-transparent [&_span]:!text-xs"
                    />
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
                  
                  {/* Voice recording button (browser Web Speech API) */}
                  {isVoiceSupported && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={isRecording ? stopRecording : startRecording}
                          disabled={isLoading || voiceAssistant.isVoiceMode}
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
                  
                  {/* Voice Assistant Mode (Whisper + Dia TTS) */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={voiceAssistant.isVoiceMode ? voiceAssistant.stopVoiceMode : () => {
                          if (!voiceCredits.hasCredits) {
                            setVoiceCreditModalOpen(true);
                            return;
                          }
                          voiceAssistant.startVoiceMode();
                        }}
                        disabled={isLoading && !voiceAssistant.isVoiceMode}
                        className={`transition-colors p-1 disabled:opacity-30 shrink-0 mb-0.5 ${
                          voiceAssistant.isVoiceMode
                            ? 'text-cyan-400 animate-pulse'
                            : 'text-white hover:text-white/80'
                        }`}
                      >
                        <AudioLines className="w-5 h-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{voiceAssistant.isVoiceMode ? 'Stop Voice Chat' : 'Voice Chat (AI)'}</TooltipContent>
                  </Tooltip>
                </div>
                
                {/* Auto-expanding textarea */}
                <textarea
                  ref={inputRef}
                  value={isRecording ? transcript : input}
                  onChange={(e) => {
                    if (!isRecording) {
                      const newValue = e.target.value;
                      const caret = e.target.selectionStart ?? newValue.length;
                      setInput(newValue);
                      mention.handleInput(newValue, caret);
                      // Slash-skill detection: `/` at start or after whitespace, followed by [a-z0-9-]*
                      const before = newValue.slice(0, caret);
                      const m = before.match(/(?:^|\s)\/([a-z0-9-]{0,32})$/i);
                      if (m) {
                        const tokenStart = caret - m[1].length - 1; // include the `/`
                        setSlashRange({ start: tokenStart, end: caret });
                        setSlashQuery(m[1]);
                        // Auto-open once user types >=2 chars after `/`
                        setSlashOpen(m[1].length >= 2);
                      } else {
                        setSlashOpen(false);
                      }
                      const t = e.target;
                      requestAnimationFrame(() => {
                        t.style.height = 'auto';
                        const maxHeight = window.innerHeight * 0.45;
                        t.style.height = `${Math.min(t.scrollHeight, maxHeight)}px`;
                      });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (slashOpen) {
                      const results = filterSkills(slashQuery, userSkills);
                      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashSelected((i) => Math.min(i + 1, Math.max(0, results.length - 1))); return; }
                      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashSelected((i) => Math.max(i - 1, 0)); return; }
                      if (e.key === 'Escape') { e.preventDefault(); setSlashOpen(false); return; }
                      if ((e.key === 'Enter' || e.key === 'Tab') && results[slashSelected]) {
                        e.preventDefault();
                        const skill = results[slashSelected];
                        const before = input.slice(0, slashRange.start);
                        const after = input.slice(slashRange.end);
                        const insert = `/${skill.slug} `;
                        const next = before + insert + after;
                        setInput(next);
                        setSlashOpen(false);
                        requestAnimationFrame(() => {
                          const pos = (before + insert).length;
                          inputRef.current?.focus();
                          inputRef.current?.setSelectionRange(pos, pos);
                        });
                        return;
                      }
                    }
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

                {/* Slash Skill Dropdown */}
                <SlashSkillDropdown
                  isOpen={slashOpen}
                  query={slashQuery}
                  skills={userSkills}
                  selectedIndex={slashSelected}
                  onSelectedIndexChange={setSlashSelected}
                  onSelect={(skill) => {
                    const before = input.slice(0, slashRange.start);
                    const after = input.slice(slashRange.end);
                    const insert = `/${skill.slug} `;
                    const next = before + insert + after;
                    setInput(next);
                    setSlashOpen(false);
                    requestAnimationFrame(() => {
                      const pos = (before + insert).length;
                      inputRef.current?.focus();
                      inputRef.current?.setSelectionRange(pos, pos);
                    });
                  }}
                  onOpenAll={() => { setSlashOpen(false); setSkillsBrowserOpen(true); }}
                  onClose={() => setSlashOpen(false)}
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
                      disabled={isLoading || voiceAssistant.isVoiceMode}
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
                  
                  {/* Voice Assistant Mode (mobile) */}
                  <button
                    type="button"
                    onClick={voiceAssistant.isVoiceMode ? voiceAssistant.stopVoiceMode : () => {
                      if (!voiceCredits.hasCredits) {
                        setVoiceCreditModalOpen(true);
                        return;
                      }
                      voiceAssistant.startVoiceMode();
                    }}
                    disabled={isLoading && !voiceAssistant.isVoiceMode}
                    className={`transition-colors p-1 disabled:opacity-30 ${
                      voiceAssistant.isVoiceMode
                        ? 'text-cyan-400 animate-pulse'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    <AudioLines className="w-4 h-4" />
                  </button>
                  
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

      {/* Voice Assistant Overlay */}
      <VoiceAssistantOverlay
        isActive={voiceAssistant.isVoiceMode}
        status={voiceAssistant.status}
        recordingDuration={voiceAssistant.recordingDuration}
        onStop={voiceAssistant.stopVoiceMode}
        onStopSpeaking={voiceAssistant.stopSpeaking}
        remainingCredits={voiceCredits.credits}
      />

      {/* Voice Credit Purchase Modal */}
      <VoiceCreditPurchaseModal
        open={voiceCreditModalOpen}
        onOpenChange={setVoiceCreditModalOpen}
        currentCredits={voiceCredits.credits}
        onPurchaseComplete={(bundleSize) => {
          voiceCredits.addCredits(bundleSize);
        }}
      />

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

      {/* Image Paywall Modal */}
      {pendingImageRequest && (
        <ImagePaywallModal
          open={imagePaywallOpen}
          onOpenChange={(open) => {
            setImagePaywallOpen(open);
            if (!open) setPendingImageRequest(null);
          }}
          model={IMAGE_MODELS[pendingImageRequest.model]}
          selectedModelKey={pendingImageRequest.model}
          onModelChange={(modelKey) => {
            setPendingImageRequest(prev => prev ? { ...prev, model: modelKey as ImageModelKey } : null);
          }}
          onConfirm={handleImageGenerationConfirm}
          isGenerating={isImageLoading}
        />
      )}

      {/* Skills library */}
      <SkillsHubModal
        open={skillsHubOpen}
        onOpenChange={setSkillsHubOpen}
        onUseSkill={(skill) => {
          const seed = skill.trigger_phrases[0] || skill.name.toLowerCase();
          setInput(`/${seed} `);
          inputRef.current?.focus();
          setInputGlow(true);
          setTimeout(() => setInputGlow(false), 2000);
          incrementSkillUsage(skill.id).catch(() => {});
          toast.success(`Loaded skill: ${skill.name}`);
        }}
      />

      {/* DeHub Poster Studio */}
      <PosterConfigDialog
        open={posterConfigOpen}
        onOpenChange={(open) => {
          setPosterConfigOpen(open);
          if (!open) setPendingPosterPrompt('');
        }}
        userPrompt={pendingPosterPrompt}
        onConfirm={async (cfg: PosterConfig) => {
          setPosterConfigOpen(false);
          try {
            // Pick the right source logo based on user's variant choice
            const logoUrl =
              cfg.logoVariant === 'icon' ? dehubLogoIcon.url
              : cfg.logoVariant === 'both' ? dehubLogoPrimary.url // primary wordmark; "both" is expressed in the prompt
              : dehubLogoPrimary.url;
            const logoBase64 = await imageUrlToBase64(logoUrl).catch(() => imageUrlToBase64(dehubLogo));
            await handleImageGenerationConfirm({
              prompt: buildDeHubBrandPrompt(cfg.finalPrompt),
              model: DEHUB_BRAND_IMAGE_MODEL,
              logoImage: logoBase64,
            });
          } catch (err) {
            console.error('Poster generation error:', err);
            toast.error('Failed to start poster generation');
          } finally {
            setPendingPosterPrompt('');
          }
        }}
      />

      {/* Music Confirm Dialog */}
      <MusicConfirmDialog
        open={musicConfirmOpen}
        onOpenChange={(open) => {
          setMusicConfirmOpen(open);
          if (!open) setPendingMusicPrompt('');
        }}
        userPrompt={pendingMusicPrompt}
        onConfirm={(params: MusicParams) => {
          setMusicConfirmOpen(false);
          // Build a structured prompt from the confirmed params
          const parts: string[] = [];
          if (params.title) parts.push(`Title: ${params.title}`);
          if (params.style) parts.push(`Style: ${params.style}`);
          if (params.voiceGender !== 'auto') parts.push(`Voice: ${params.voiceGender}`);
          const structuredPrompt = parts.join('. ') || pendingMusicPrompt;
          const lyricsValue = params.lyrics || '';

          const defaultTool = DEFAULT_TOOL_FOR_CATEGORY[aiToolCategory];
          setPendingAiToolRequest({
            prompt: structuredPrompt,
            tool: defaultTool,
            category: aiToolCategory,
            // Pass lyrics separately so edge function uses them correctly
            ...(lyricsValue && { lyrics: lyricsValue }),
          } as any);
          setSelectedAiToolId(defaultTool);
          setAiToolPaywallOpen(true);
        }}
      />

      {/* AI Tool Paywall Modal */}
      {pendingAiToolRequest && (
        <AiToolPaywallModal
          open={aiToolPaywallOpen}
          onOpenChange={(open) => {
            setAiToolPaywallOpen(open);
            if (!open) setPendingAiToolRequest(null);
          }}
          model={AI_TOOL_MODELS[selectedAiToolId]}
          selectedModelId={selectedAiToolId}
          onModelChange={(modelId) => {
            setSelectedAiToolId(modelId);
            setPendingAiToolRequest(prev => prev ? { ...prev, tool: modelId } : null);
          }}
          onConfirm={handleAiToolConfirm}
          isProcessing={isAiToolProcessing}
          category={aiToolCategory}
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

      {/* Skills Browser Modal (from slash `/` menu "Show all") */}
      <SkillsBrowserModal open={skillsBrowserOpen} onOpenChange={setSkillsBrowserOpen} />

      {/* Fullscreen image lightbox for AI-generated images */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setLightboxImage(null)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 cursor-zoom-out"
          >
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxImage(null); }}
              aria-label="Close"
              className="absolute top-4 right-4 flex items-center justify-center w-11 h-11 rounded-xl text-white bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
            <motion.img
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ duration: 0.2 }}
              src={lightboxImage}
              alt="Generated (fullscreen)"
              onClick={(e) => e.stopPropagation()}
              className="max-w-full max-h-full object-contain rounded-lg cursor-default"
            />
          </motion.div>
        )}
      </AnimatePresence>




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
