import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mintPost, type StreamInfo } from '@/lib/api/dehub';
import { 
  mintOnChain, 
  getWeb3AuthSigner,
  mintWithBounty,
  calculateTotalBounty,
  getDHBBalance,
  DHB_TOKEN,
  BASE_CHAIN_ID,
} from '@/lib/contracts';
import { extractAvatarPath, buildAvatarUrl } from '@/lib/media-url';
import { useOptimisticPosts } from '@/hooks/use-optimistic-posts';
import { useAuth } from '@/contexts/AuthContext';
import type { MediaFile, Currency, PostFormState, PostFormActions, PostFormComputed, AudioFile, LiveMode } from '../types';
import type { FilterSettings, CropSettings } from '../types/filters';
import type { Draft } from '../components/DraftsSheet';
import type { TextPost, ImagePost, VideoItem } from '@/types/feed.types';
import type { ChainId } from '@/components/app/ChainSelector';

// Storage key for drafts
const DRAFTS_STORAGE_KEY = 'post_drafts';

// Load drafts from localStorage
const loadDrafts = (): Draft[] => {
  try {
    const stored = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (stored) {
      const drafts = JSON.parse(stored);
      // Convert date strings back to Date objects
      return drafts.map((d: any) => ({ ...d, createdAt: new Date(d.createdAt) }));
    }
  } catch (e) {
    console.error('Failed to load drafts:', e);
  }
  return [];
};

// Save drafts to localStorage
const saveDrafts = (drafts: Draft[]) => {
  try {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  } catch (e) {
    console.error('Failed to save drafts:', e);
  }
};

interface UsePostFormReturn {
  state: PostFormState & {
    scheduledDate: Date | null;
    drafts: Draft[];
    isRecording: boolean;
    recordingTime: number;
    chainId: ChainId;
    isCameraModalOpen: boolean;
    selectedCategory: string;
  };
  actions: PostFormActions & {
    setScheduledDate: (date: Date | null) => void;
    saveDraft: () => void;
    loadDraft: (draft: Draft) => void;
    deleteDraft: (id: string) => void;
    startRecording: () => void;
    stopRecording: () => void;
    setChainId: (chainId: ChainId) => void;
    setSelectedCategory: (category: string) => void;
    insertEmoji: (emoji: string) => void;
    insertGif: (gifUrl: string) => void;
    openCameraCapture: () => void;
    closeCameraCapture: () => void;
    handleCameraVideoRecorded: (videoBlob: Blob) => void;
    handleCameraPhotoCaptured: (imageBlob: Blob) => void;
  };
  computed: PostFormComputed;
  refs: {
    imageInputRef: React.RefObject<HTMLInputElement>;
    videoInputRef: React.RefObject<HTMLInputElement>;
    audioInputRef: React.RefObject<HTMLInputElement>;
    editorRef: React.RefObject<HTMLDivElement>;
  };
}

export function usePostForm(onClose: () => void): UsePostFormReturn {
  const navigate = useNavigate();
  const { addOptimisticPost } = useOptimisticPosts();
  const { user } = useAuth();
  
  // Form state
  const [text, setText] = useState('');
  const [description, setDescription] = useState('');
  const [showDescription, setShowDescription] = useState(false);
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [isSubscribersOnly, setIsSubscribersOnly] = useState(false);
  const [isPPV, setIsPPV] = useState(false);
  const [ppvAmount, setPpvAmount] = useState('');
  const [ppvCurrency, setPpvCurrency] = useState<Currency>('USD');
  const [isWatch2Earn, setIsWatch2Earn] = useState(false);
  const [w2eViews, setW2eViews] = useState('');
  const [w2eComments, setW2eComments] = useState('');
  const [w2eTotal, setW2eTotal] = useState('');
  const [w2eCurrency, setW2eCurrency] = useState<Currency>('USD');
  const [isTokenGated, setIsTokenGated] = useState(false);
  const [tokenContract, setTokenContract] = useState('');
  const [tokenAmount, setTokenAmount] = useState('');
  const [liveMode, setLiveMode] = useState<LiveMode>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>(loadDrafts);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [chainId, setChainId] = useState<ChainId>(BASE_CHAIN_ID as ChainId);
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    try {
      return localStorage.getItem('post_default_categories') || '';
    } catch { return ''; }
  });

  // Refs
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Computed values
  const hasVideo = media.some(m => m.type === 'video');
  const hasImage = media.some(m => m.type === 'image');
  const hasAudio = media.some(m => m.type === 'audio');
  const isShort = hasVideo && media.some(m => m.type === 'video' && m.duration && m.duration < 90);
  const hasMusicVideo = media.some(m => m.type === 'video' && m.isMusicVideo);
  const isLive = liveMode !== null;

  const getPostDestinations = useCallback(() => {
    const destinations: string[] = ['Home'];
    if (hasImage) destinations.push('Images');
    if (hasAudio) destinations.push('Music');
    if (hasVideo) {
      destinations.push('Videos');
      if (isShort) destinations.push('Shorts');
      if (hasMusicVideo) destinations.push('Music');
    }
    if (isLive) destinations.push('Live');
    // Remove duplicate Music entries
    return [...new Set(destinations)];
  }, [hasImage, hasAudio, hasVideo, isShort, hasMusicVideo, isLive]);

  const destinations = getPostDestinations();
  const canPost = Boolean(text.trim() || media.length > 0 || isLive);

  // Actions
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    processImageFiles(Array.from(files));
    e.target.value = '';
  }, []);

  const processImageFiles = useCallback((files: File[]) => {
    // Can't add images if there's already a video
    if (hasVideo) {
      toast.error('Remove the video first to add images');
      return;
    }

    const currentImageCount = media.filter(m => m.type === 'image').length;
    const availableSlots = 4 - currentImageCount;
    
    if (availableSlots <= 0) {
      toast.error('Maximum 4 images allowed');
      return;
    }

    const filesToAdd = files.filter(f => f.type.startsWith('image/')).slice(0, availableSlots);
    
    if (files.length > availableSlots) {
      toast.info(`Only ${availableSlots} image${availableSlots > 1 ? 's' : ''} added (max 4)`);
    }

    filesToAdd.forEach(file => {
      const preview = URL.createObjectURL(file);
      setMedia(prev => [...prev, { file, preview, type: 'image' }]);
    });
  }, [hasVideo, media]);
    
  const handleVideoSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processVideoFile(files[0]);
    e.target.value = '';
  }, []);

  const processVideoFile = useCallback(async (file: File) => {
    // Can't add video if there are already images
    if (hasImage) {
      toast.error('Remove images first to add a video');
      return;
    }

    // Can't add more than 1 video
    if (hasVideo) {
      toast.error('Only 1 video allowed per post');
      return;
    }

    const preview = URL.createObjectURL(file);
    
    // Instantly show the video in the media list with a loading state
    // This makes the UI feel fast while heavy thumbnail generation runs in background
    setMedia([{ 
      file, 
      preview, 
      type: 'video', 
    }]);

    // Background: load metadata + generate thumbnail, then update the entry
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.crossOrigin = 'anonymous';
    video.src = preview;
    
    try {
      // Wait for video metadata
      const duration = await new Promise<number>((resolve, reject) => {
        video.onloadedmetadata = () => resolve(video.duration);
        video.onerror = () => reject(new Error('Failed to load video'));
      });

      // Generate thumbnail from video frame
      let thumbnailUrl: string | undefined;
      let thumbnailBlob: Blob | undefined;
      
      try {
        const seekTime = Math.min(1, duration * 0.1);
        
        await new Promise<void>((resolve, reject) => {
          video.onseeked = () => resolve();
          video.onerror = () => reject(new Error('Failed to seek video'));
          video.currentTime = seekTime;
        });
        
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        
        if (ctx && canvas.width > 0 && canvas.height > 0) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/jpeg', 0.85);
          });
          
          if (blob) {
            thumbnailBlob = blob;
            thumbnailUrl = URL.createObjectURL(blob);
            console.log('[Video] Auto-generated thumbnail:', { width: canvas.width, height: canvas.height, size: blob.size });
          }
        }
      } catch (err) {
        console.warn('[Video] Failed to generate thumbnail:', err);
      }

      // Update the media entry with duration + thumbnail
      setMedia(prev => prev.map(m => 
        m.file === file ? { 
          ...m, 
          duration,
          thumbnail: thumbnailUrl,
          thumbnailBlob,
          isAutoThumbnail: !!thumbnailUrl,
        } : m
      ));
    } catch (err) {
      console.warn('[Video] Failed to load video metadata:', err);
    }
  }, [hasImage, hasVideo]);

  const removeMedia = useCallback((index: number) => {
    setMedia(prev => {
      const item = prev[index];
      URL.revokeObjectURL(item.preview);
      if (item.audio) URL.revokeObjectURL(item.audio.url);
      if (item.thumbnail) URL.revokeObjectURL(item.thumbnail);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const processAudioFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    
    // Create audio element to get duration
    const audioEl = new Audio(url);
    audioEl.onloadedmetadata = () => {
      const duration = Math.round(audioEl.duration);
      
      if (hasImage) {
        // Add audio to all images
        setMedia(prev => prev.map(m => 
          m.type === 'image' ? { ...m, audio: { blob: file, url, duration } } : m
        ));
        toast.success('Audio added to images');
      } else {
        // Standalone audio post
        setMedia(prev => [...prev, { file, preview: url, type: 'audio', duration }]);
        toast.success('Audio uploaded');
      }
    };
  }, [hasImage]);

  const handleFileDrop = useCallback((files: FileList) => {
    const fileArray = Array.from(files);
    
    // Separate files by type
    const imageFiles = fileArray.filter(f => f.type.startsWith('image/'));
    const videoFiles = fileArray.filter(f => f.type.startsWith('video/'));
    const audioFiles = fileArray.filter(f => f.type.startsWith('audio/'));
    
    // Process based on what was dropped
    if (videoFiles.length > 0) {
      processVideoFile(videoFiles[0]);
    } else if (imageFiles.length > 0) {
      processImageFiles(imageFiles);
    }
    
    // Audio can be added alongside images
    if (audioFiles.length > 0 && (hasImage || imageFiles.length > 0)) {
      // Wait a tick for images to be added first
      setTimeout(() => processAudioFile(audioFiles[0]), 100);
    } else if (audioFiles.length > 0 && !hasVideo && !videoFiles.length) {
      processAudioFile(audioFiles[0]);
    }
  }, [processVideoFile, processImageFiles, processAudioFile, hasImage, hasVideo]);

  const addAudioToMedia = useCallback((index: number, audio: AudioFile) => {
    setMedia(prev => prev.map((m, i) => 
      i === index ? { ...m, audio } : m
    ));
  }, []);

  const removeAudioFromMedia = useCallback((index: number) => {
    setMedia(prev => prev.map((m, i) => {
      if (i === index && m.audio) {
        URL.revokeObjectURL(m.audio.url);
        return { ...m, audio: undefined };
      }
      return m;
    }));
  }, []);

  const toggleMusicVideo = useCallback((index: number) => {
    setMedia(prev => prev.map((m, i) => 
      i === index && m.type === 'video' ? { ...m, isMusicVideo: !m.isMusicVideo } : m
    ));
  }, []);

  const addThumbnailToMedia = useCallback(async (index: number, thumbnailUrl: string) => {
    // Fetch the blob from URL for upload and create a NEW blob URL
    // This prevents issues where the original blob URL might be revoked elsewhere
    let thumbnailBlob: Blob | undefined;
    let newThumbnailUrl = thumbnailUrl;
    
    try {
      const response = await fetch(thumbnailUrl);
      thumbnailBlob = await response.blob();
      // Create a new blob URL that we own and control
      newThumbnailUrl = URL.createObjectURL(thumbnailBlob);
    } catch (err) {
      console.warn('[Thumbnail] Failed to fetch blob:', err);
    }
    
    setMedia(prev => prev.map((m, i) => {
      if (i === index && m.type === 'video') {
        // Only revoke if we have a previous thumbnail that we created
        if (m.thumbnail && m.thumbnailBlob) {
          URL.revokeObjectURL(m.thumbnail);
        }
        return { 
          ...m, 
          thumbnail: newThumbnailUrl, 
          thumbnailBlob,
          isAutoThumbnail: false, // Custom upload, not auto-generated
        };
      }
      return m;
    }));
  }, []);

  const removeThumbnailFromMedia = useCallback((index: number) => {
    setMedia(prev => prev.map((m, i) => {
      if (i === index && m.thumbnail) {
        URL.revokeObjectURL(m.thumbnail);
        return { ...m, thumbnail: undefined, thumbnailBlob: undefined, isAutoThumbnail: false };
      }
      return m;
    }));
  }, []);

  const applyFilterToMedia = useCallback((index: number, settings: FilterSettings, presetId?: string) => {
    setMedia(prev => prev.map((m, i) => 
      i === index ? { ...m, filterSettings: settings, filterPresetId: presetId } : m
    ));
  }, []);

  const clearFilterFromMedia = useCallback((index: number) => {
    setMedia(prev => prev.map((m, i) => 
      i === index ? { ...m, filterSettings: undefined, filterPresetId: undefined } : m
    ));
  }, []);

  const applyCropToMedia = useCallback((index: number, settings: CropSettings) => {
    setMedia(prev => prev.map((m, i) => 
      i === index ? { ...m, cropSettings: settings } : m
    ));
  }, []);

  const clearCropFromMedia = useCallback((index: number) => {
    setMedia(prev => prev.map((m, i) => 
      i === index ? { ...m, cropSettings: undefined } : m
    ));
  }, []);

  const applyTrimToMedia = useCallback((index: number, trimStart: number, trimEnd: number) => {
    setMedia(prev => prev.map((m, i) => 
      i === index ? { ...m, trimStart, trimEnd } : m
    ));
  }, []);

  const handleAudioSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    processAudioFile(files[0]);
    e.target.value = '';
  }, [processAudioFile]);

  const handleEnhanceWithAI = useCallback(async (mode: 'spellcheck' | 'grammar' | 'style' = 'spellcheck', style?: string) => {
    if (!text.trim()) {
      toast.error('Enter some text first');
      return;
    }
    setIsEnhancing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('enhance-text', {
        body: { text: text.trim(), mode, style }
      });

      if (error) {
        console.error('Enhancement error:', error);
        toast.error(error.message || 'Failed to process text');
        return;
      }

      if (data?.enhancedText) {
        setText(data.enhancedText);
        // Update the editor content as well
        if (editorRef.current) {
          editorRef.current.innerText = data.enhancedText;
        }
        toast.success(mode === 'spellcheck' ? 'Spell checked!' : 'Style applied!');
      } else if (data?.error) {
        toast.error(data.error);
      }
    } catch (err) {
      console.error('Enhancement error:', err);
      toast.error('Failed to process text');
    } finally {
      setIsEnhancing(false);
    }
  }, [text]);

  const insertFormatting = useCallback((format: 'bold' | 'italic' | 'mention') => {
    const editor = editorRef.current;
    if (!editor) return;

    // Focus the editor first
    editor.focus();

    // Use execCommand for WYSIWYG formatting
    switch (format) {
      case 'bold':
        document.execCommand('bold', false);
        break;
      case 'italic':
        document.execCommand('italic', false);
        break;
      case 'mention':
        document.execCommand('insertText', false, '@');
        break;
    }

    // Update the text state with plain text
    const plainText = editor.innerText;
    setText(plainText);
  }, []);

  const insertEmoji = useCallback((emoji: string) => {
    const editor = editorRef.current;
    if (!editor) {
      // Fallback: just append to text
      setText(prev => prev + emoji);
      return;
    }

    // Focus and insert at cursor position
    editor.focus();
    document.execCommand('insertText', false, emoji);

    // Update the text state
    const plainText = editor.innerText;
    setText(plainText);
  }, []);

  const insertGif = useCallback((gifUrl: string) => {
    // For now, GIFs can be added as media attachments
    // We'll create a temporary image file from the GIF URL
    toast.info('GIF support coming soon!');
    // TODO: Download GIF and add as media
  }, []);

  // Camera modal state
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);

  const openCameraCapture = useCallback(() => {
    setIsCameraModalOpen(true);
  }, []);

  const closeCameraCapture = useCallback(() => {
    setIsCameraModalOpen(false);
  }, []);

  const handleCameraVideoRecorded = useCallback(async (videoBlob: Blob) => {
    // Create a File from the blob for processVideoFile
    const videoFile = new File([videoBlob], `camera-recording-${Date.now()}.webm`, { 
      type: videoBlob.type || 'video/webm' 
    });
    await processVideoFile(videoFile);
  }, [processVideoFile]);

  const handleCameraPhotoCaptured = useCallback((imageBlob: Blob) => {
    // Create a File from the blob for processImageFiles
    const imageFile = new File([imageBlob], `camera-photo-${Date.now()}.png`, { 
      type: 'image/png' 
    });
    processImageFiles([imageFile]);
  }, [processImageFiles]);

  const resetForm = useCallback(() => {
    setText('');
    setDescription('');
    setShowDescription(false);
    setMedia([]);
    setIsSubscribersOnly(false);
    setIsPPV(false);
    setPpvAmount('');
    setPpvCurrency('USD');
    setIsWatch2Earn(false);
    setW2eViews('');
    setW2eComments('');
    setW2eTotal('');
    setW2eCurrency('USD');
    setIsTokenGated(false);
    setTokenContract('');
    setTokenAmount('');
    setLiveMode(null);
    setScheduledDate(null);
    setChainId(BASE_CHAIN_ID as ChainId);
  }, []);

  // Drafts actions
  const saveDraft = useCallback(() => {
    const newDraft: Draft = {
      id: Date.now().toString(),
      text,
      createdAt: new Date(),
      hasImage: hasImage,
      hasVideo: hasVideo,
      hasAudio: hasAudio,
    };
    const updatedDrafts = [newDraft, ...drafts].slice(0, 10); // Keep max 10 drafts
    setDrafts(updatedDrafts);
    saveDrafts(updatedDrafts);
  }, [text, hasImage, hasVideo, hasAudio, drafts]);

  const loadDraft = useCallback((draft: Draft) => {
    setText(draft.text);
    // Update editor content
    if (editorRef.current) {
      editorRef.current.innerText = draft.text;
    }
  }, []);

  const deleteDraft = useCallback((id: string) => {
    const updatedDrafts = drafts.filter(d => d.id !== id);
    setDrafts(updatedDrafts);
    saveDrafts(updatedDrafts);
  }, [drafts]);

  // Audio recording functions
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // Create audio element to get duration
        const audioEl = new Audio(audioUrl);
        audioEl.onloadedmetadata = () => {
          const duration = Math.round(audioEl.duration);
          
          if (hasImage) {
            // Add audio to all images
            setMedia(prev => prev.map(m => 
              m.type === 'image' ? { ...m, audio: { blob: audioBlob, url: audioUrl, duration } } : m
            ));
            toast.success('Audio added to images');
          } else {
            // Standalone audio post - create a File from the blob
            const audioFile = new File([audioBlob], `recording-${Date.now()}.webm`, { type: 'audio/webm' });
            setMedia(prev => [...prev, { file: audioFile, preview: audioUrl, type: 'audio', duration }]);
            toast.success('Audio recorded');
          }
        };

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());

        // Clear recording interval
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
          recordingIntervalRef.current = null;
        }
        setRecordingTime(0);
      };

      mediaRecorder.start();
      setIsRecording(true);

      // Start timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      toast.success('Recording started');
    } catch (err) {
      console.error('Failed to start recording:', err);
      toast.error('Could not access microphone. Please check permissions.');
    }
  }, [hasImage]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const handlePost = useCallback(async () => {
    if (isPosting) return;
    
    // Validate required fields
    if (!text.trim() && media.length === 0 && !liveMode) {
      toast.error('Add some content first');
      return;
    }

    setIsPosting(true);
    
    try {
      // Determine post type based on media
      let postType: 'video' | 'feed-images' | 'feed-simple' | 'live' = 'feed-simple';
      if (liveMode) {
        postType = 'live';
      } else if (hasVideo) {
        postType = 'video';
      } else if (hasImage) {
        postType = 'feed-images';
      }

      // Get user's wallet address for signature generation
      const minterAddress = await getWeb3AuthSigner();
      console.log('[Mint] User wallet address (minter):', minterAddress);

      // Build streamInfo for monetization - ONLY DHB on Base chain
      const streamInfo: StreamInfo = {
        isLockContent: false,
        isPayPerView: false,
        isAddBounty: false,
      };

      // Add Lock/Subscribers settings (Token Gated)
      if (isTokenGated && tokenAmount) {
        streamInfo.isLockContent = true;
        streamInfo.lockContentContractAddress = DHB_TOKEN.address;
        streamInfo.lockContentTokenSymbol = 'DHB';
        streamInfo.lockContentAmount = parseFloat(tokenAmount);
        streamInfo.lockContentChainIds = [BASE_CHAIN_ID];
      } else if (isSubscribersOnly) {
        streamInfo.isLockContent = true;
        streamInfo.lockContentContractAddress = DHB_TOKEN.address;
        streamInfo.lockContentTokenSymbol = 'DHB';
        streamInfo.lockContentChainIds = [BASE_CHAIN_ID];
      }

      // Add PPV settings
      if (isPPV && ppvAmount) {
        const ppvValue = parseFloat(ppvAmount);
        if (ppvValue > 0) {
          streamInfo.isPayPerView = true;
          streamInfo.payPerViewTokenSymbol = ppvCurrency;
          streamInfo.payPerViewAmount = ppvValue;
          if (ppvCurrency === 'DHB') {
            streamInfo.payPerViewContractAddress = DHB_TOKEN.address;
            streamInfo.payPerViewChainIds = [BASE_CHAIN_ID];
          }
        }
      }

      // Add Bounty (W2E) settings - DHB only
      const hasBounty = isWatch2Earn && w2eTotal && w2eViews;
      if (hasBounty) {
        const bountyAmount = parseFloat(w2eTotal);
        const viewerCount = parseInt(w2eViews) || 10;
        const commentCount = parseInt(w2eComments) || 0;
        
        if (bountyAmount > 0 && (viewerCount > 0 || commentCount > 0)) {
          // Calculate total bounty needed
          const totalBounty = calculateTotalBounty(bountyAmount, viewerCount, commentCount);
          
          // Check DHB balance
          const balance = await getDHBBalance(minterAddress);
          const balanceNum = Number(balance) / 1e18;
          
          if (balanceNum < totalBounty) {
            toast.error(`Insufficient DHB balance. Need ${totalBounty} DHB but have ${balanceNum.toFixed(2)} DHB`);
            setIsPosting(false);
            return;
          }
          
          streamInfo.isAddBounty = true;
          streamInfo.addBountyTokenSymbol = 'DHB';
          streamInfo.addBountyAmount = bountyAmount;
          streamInfo.addBountyFirstXViewers = viewerCount;
          streamInfo.addBountyFirstXComments = commentCount;
          streamInfo.addBountyChainId = BASE_CHAIN_ID;
        }
      }

      // Get media files
      const files = media.map(m => m.file);
      
      // Get thumbnail for video posts - use stored blob if available
      let thumbnail: Blob | undefined;
      if (hasVideo && media[0]) {
        if (media[0].thumbnailBlob) {
          thumbnail = media[0].thumbnailBlob;
        } else if (media[0].thumbnail) {
          // Fallback: convert thumbnail URL to blob
          const thumbResponse = await fetch(media[0].thumbnail);
          thumbnail = await thumbResponse.blob();
        }
      }

      console.log('[Mint] Minting post:', {
        name: text.trim().slice(0, 100) || 'Untitled',
        description: description.trim(),
        postType,
        streamInfo,
        filesCount: files.length,
        hasThumbnail: !!thumbnail,
        hasBounty,
        minterAddress,
      });

      // Step 1: Call the mint API to get signature
      // Dismiss any existing toast to avoid overlap
      toast.dismiss('mint-progress');
      toast.loading('Uploading content', { id: 'mint-progress', duration: Infinity });
      
      // Determine title and description based on post type
      let postTitle = '';
      let postDescription = '';

      if (postType === 'video') {
        // Video: first line = title, rest = description
        const lines = text.trim().split('\n');
        postTitle = (lines[0] || '').trim().slice(0, 100) || 'Untitled';
        postDescription = lines.slice(1).join('\n').trim();
      } else {
        // Image/Text posts: title blank, everything goes to description
        postTitle = '';
        postDescription = text.trim();
      }

      const mintResponse = await mintPost({
        name: postTitle,
        description: postDescription,
        postType,
        chainId,
        category: selectedCategory ? selectedCategory.split('|||').filter(Boolean) : ['General'],
        streamInfo,
        files: files.length > 0 ? files : undefined,
        thumbnail,
        minterAddress,
      });

      console.log('[Mint] API response:', JSON.stringify(mintResponse, null, 2));

      // Validate signature data from API
      if (!mintResponse.v || !mintResponse.r || !mintResponse.s) {
        console.error('[Mint] Missing signature components in API response');
        throw new Error('Invalid signature data from backend - missing v, r, or s');
      }
      
      if (!mintResponse.createdTokenId) {
        console.error('[Mint] Missing token ID in API response');
        throw new Error('Invalid response from backend - missing token ID');
      }

      // Handle scheduled posts (skip on-chain minting)
      if (scheduledDate) {
        toast.success(`Post scheduled for ${scheduledDate.toLocaleString()}`, { id: 'mint-progress' });
        resetForm();
        onClose();
        return;
      }

      // Step 2: Execute on-chain minting
      toast.loading('Publishing to decentralized database', { id: 'mint-progress', duration: Infinity });
      
      let txHash: string;
      
      if (hasBounty) {
        // Use StreamController for bounty minting
        toast.loading('Approving tokens', { id: 'mint-progress', duration: Infinity });
        
        txHash = await mintWithBounty({
          tokenId: mintResponse.createdTokenId,
          timestamp: mintResponse.timestamp,
          v: mintResponse.v,
          r: mintResponse.r,
          s: mintResponse.s,
          bountyAmount: parseFloat(w2eTotal),
          countOfViewers: parseInt(w2eViews) || 10,
          countOfCommentors: parseInt(w2eComments) || 0,
          chainId,
        });
      } else {
        // Use StreamCollection for standard minting
        txHash = await mintOnChain({
          tokenId: mintResponse.createdTokenId,
          timestamp: mintResponse.timestamp,
          v: mintResponse.v,
          r: mintResponse.r,
          s: mintResponse.s,
          chainId,
        });
      }

      console.log('[Mint] Transaction hash:', txHash);

      toast.dismiss('mint-progress');
      toast.success('Posted successfully');
      
      // Create optimistic post to show immediately in feed
      const optimisticId = `optimistic-${Date.now()}`;
      const username = user?.username || user?.displayName || 'You';
      // Use proper avatar resolution - extract path from all possible fields and build CDN URL
      // This matches the exact pattern used in ProfilePage and other components
      const rawAvatarPath = extractAvatarPath(user as Record<string, any>);
      const avatar = buildAvatarUrl(user?.address || '', rawAvatarPath);
      
      if (hasVideo && media[0]) {
        // Video post
        const videoPost: VideoItem = {
          id: optimisticId,
          type: 'video',
          thumbnail: media[0].thumbnail || media[0].preview,
          videoUrl: media[0].preview,
          duration: media[0].duration ? `${Math.floor(media[0].duration / 60)}:${String(Math.floor(media[0].duration % 60)).padStart(2, '0')}` : '0:00',
          title: text.trim().split('\n')[0] || 'Untitled',
          channel: username,
          channelAvatar: avatar || '', // Must be string for VideoItem type
          verified: false,
          views: '0',
          uploadedAgo: 'Just now',
          creatorId: user?.address,
          creatorUsername: username,
          createdAt: new Date().toISOString(),
          isLiked: false,
          likeCount: 0,
          dislikeCount: 0,
          commentCount: 0,
          isOptimistic: true,
        };
        addOptimisticPost({ id: optimisticId, type: 'video', data: videoPost, createdAt: new Date() });
      } else if (hasImage && media[0]) {
        // Image post
        const imagePost: ImagePost = {
          id: optimisticId,
          type: 'image',
          username,
          verified: false,
          avatar: avatar || '', // Must be string for ImagePost type
          image: media[0].preview,
          imageUrls: media.filter(m => m.type === 'image').map(m => m.preview),
          title: text.trim().split('\n')[0] || '',
          description: text.trim(),
          likes: 0,
          caption: text.trim(),
          comments: 0,
          views: '0',
          timeAgo: 'Just now',
          creatorId: user?.address,
          creatorUsername: username,
          isLiked: false,
          createdAt: new Date().toISOString(),
          isOptimistic: true,
        };
        addOptimisticPost({ id: optimisticId, type: 'image', data: imagePost, createdAt: new Date() });
      } else {
        // Text post
        const textPost: TextPost = {
          id: optimisticId,
          type: 'post',
          author: {
            id: user?.address || '',
            name: user?.displayName || username,
            handle: `@${username}`,
            verified: false,
            avatarSeed: avatar || undefined,
          },
          content: text.trim(),
          views: '0',
          createdAt: new Date().toISOString(),
          stats: {
            comments: 0,
            reposts: 0,
            likes: 0,
          },
          isOptimistic: true,
        };
        addOptimisticPost({ id: optimisticId, type: 'post', data: textPost, createdAt: new Date() });
      }
      
      resetForm();
      onClose();
      
      // Navigate to home to show the new post
      navigate('/app');
    } catch (error) {
      console.error('[Mint] Failed to mint post:', error);
      try { console.error('[Mint] Error details:', JSON.stringify(error, null, 2)); } catch {}
      toast.dismiss('mint-progress');
      // Extract nested error messages from wallet/provider errors
      let errorMsg = 'Unknown error';
      if (error instanceof Error) {
        errorMsg = error.message;
      } else if (typeof error === 'string') {
        errorMsg = error;
      } else if (error && typeof error === 'object') {
        const e = error as Record<string, any>;
        errorMsg = e.message || e.shortMessage || e.reason || 
                   e.error?.message || e.data?.message || 
                   (() => { try { return JSON.stringify(error).slice(0, 200); } catch { return 'Unknown error'; } })();
      }
      toast.error(`Post failed: ${errorMsg}`);
    } finally {
      setIsPosting(false);
    }
  }, [
    text, description, media, isSubscribersOnly, isPPV, ppvAmount,
    isWatch2Earn, w2eViews, w2eComments, w2eTotal,
    isTokenGated, tokenAmount, liveMode, scheduledDate,
    hasVideo, hasImage, isPosting, resetForm, onClose, navigate, addOptimisticPost, user
  ]);

  return {
    state: {
      text,
      description,
      showDescription,
      media,
      isSubscribersOnly,
      isPPV,
      ppvAmount,
      ppvCurrency,
      isWatch2Earn,
      w2eViews,
      w2eComments,
      w2eTotal,
      w2eCurrency,
      isTokenGated,
      tokenContract,
      tokenAmount,
      liveMode,
      isEnhancing,
      isPosting,
      scheduledDate,
      drafts,
      isRecording,
      recordingTime,
      chainId,
      isCameraModalOpen,
      selectedCategory,
    },
    actions: {
      setText,
      setDescription,
      setShowDescription,
      setMedia,
      setIsSubscribersOnly,
      setIsPPV,
      setPpvAmount,
      setPpvCurrency,
      setIsWatch2Earn,
      setW2eViews,
      setW2eComments,
      setW2eTotal,
      setW2eCurrency,
      setIsTokenGated,
      setTokenContract,
      setTokenAmount,
      setLiveMode,
      handleImageSelect,
      handleVideoSelect,
      handleFileDrop,
      removeMedia,
      handleAudioSelect,
      addAudioToMedia,
      removeAudioFromMedia,
      toggleMusicVideo,
      addThumbnailToMedia,
      removeThumbnailFromMedia,
      applyFilterToMedia,
      clearFilterFromMedia,
      applyCropToMedia,
      clearCropFromMedia,
      applyTrimToMedia,
      handleEnhanceWithAI,
      insertFormatting,
      handlePost,
      resetForm,
      setScheduledDate,
      saveDraft,
      loadDraft,
      deleteDraft,
      startRecording,
      stopRecording,
      setChainId,
      setSelectedCategory,
      insertEmoji,
      insertGif,
      openCameraCapture,
      closeCameraCapture,
      handleCameraVideoRecorded,
      handleCameraPhotoCaptured,
    },
    computed: {
      hasVideo,
      hasImage,
      hasAudio,
      isShort,
      destinations,
      canPost,
    },
    refs: {
      imageInputRef,
      videoInputRef,
      audioInputRef,
      editorRef,
    },
  };
}
