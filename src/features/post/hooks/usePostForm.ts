import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { mintPost, type StreamInfo } from '@/lib/api/dehub';
import { mintOnChain } from '@/lib/contracts/stream-collection';
import type { MediaFile, Currency, PostFormState, PostFormActions, PostFormComputed, AudioFile, LiveMode } from '../types';
import type { FilterSettings, CropSettings } from '../types/filters';
import type { Draft } from '../components/DraftsSheet';

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
  };
  actions: PostFormActions & {
    setScheduledDate: (date: Date | null) => void;
    saveDraft: () => void;
    loadDraft: (draft: Draft) => void;
    deleteDraft: (id: string) => void;
    startRecording: () => void;
    stopRecording: () => void;
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
    
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = preview;
    
    const duration = await new Promise<number>((resolve) => {
      video.onloadedmetadata = () => {
        resolve(video.duration);
      };
    });

    setMedia([{ file, preview, type: 'video', duration }]);
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

  const addThumbnailToMedia = useCallback((index: number, thumbnailUrl: string) => {
    setMedia(prev => prev.map((m, i) => {
      if (i === index && m.type === 'video') {
        if (m.thumbnail) URL.revokeObjectURL(m.thumbnail);
        return { ...m, thumbnail: thumbnailUrl };
      }
      return m;
    }));
  }, []);

  const removeThumbnailFromMedia = useCallback((index: number) => {
    setMedia(prev => prev.map((m, i) => {
      if (i === index && m.thumbnail) {
        URL.revokeObjectURL(m.thumbnail);
        return { ...m, thumbnail: undefined };
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

      // Build streamInfo for monetization
      const streamInfo: StreamInfo = {
        isLockContent: isSubscribersOnly,
        isPayPerView: isPPV,
        isAddBounty: isWatch2Earn,
      };

      // Add PPV settings
      if (isPPV && ppvAmount) {
        streamInfo.payPerViewAmount = parseFloat(ppvAmount);
        streamInfo.payPerViewTokenSymbol = ppvCurrency === 'DHB' ? 'DHB' : 'USDC';
        streamInfo.payPerViewChainIds = [8453]; // Base chain
      }

      // Add W2E bounty settings
      if (isWatch2Earn && w2eTotal) {
        streamInfo.addBountyAmount = parseFloat(w2eTotal);
        streamInfo.addBountyTokenSymbol = w2eCurrency === 'DHB' ? 'DHB' : 'USDC';
        streamInfo.addBountyFirstXViewers = w2eViews ? parseInt(w2eViews) : 10;
        streamInfo.addBountyFirstXComments = w2eComments ? parseInt(w2eComments) : 5;
        streamInfo.addBountyChainId = 8453;
      }

      // Add token gating settings
      if (isTokenGated && tokenContract) {
        streamInfo.isLockContent = true;
        streamInfo.lockContentContractAddress = tokenContract;
        streamInfo.lockContentAmount = tokenAmount ? parseFloat(tokenAmount) : 1;
        streamInfo.lockContentChainIds = [8453];
      }

      // Get media files
      const files = media.map(m => m.file);
      
      // Get thumbnail for video posts
      let thumbnail: Blob | undefined;
      if (hasVideo && media[0]?.thumbnail) {
        // Convert thumbnail URL to blob
        const thumbResponse = await fetch(media[0].thumbnail);
        thumbnail = await thumbResponse.blob();
      }

      console.log('Minting post:', {
        name: text.trim(),
        description: description.trim(),
        postType,
        streamInfo,
        filesCount: files.length,
        hasThumbnail: !!thumbnail,
      });

      // Step 1: Call the mint API to get signature
      toast.info('Uploading content...', { id: 'mint-progress' });
      
      const mintResponse = await mintPost({
        name: text.trim(),
        description: description.trim(),
        postType,
        chainId: 8453, // Base chain
        category: ['General'],
        streamInfo,
        files: files.length > 0 ? files : undefined,
        thumbnail,
      });

      console.log('[Mint] Full API response:', JSON.stringify(mintResponse, null, 2));
      console.log('[Mint] Signature components:', {
        v: mintResponse.v,
        r: mintResponse.r,
        s: mintResponse.s,
        createdTokenId: mintResponse.createdTokenId,
        timestamp: mintResponse.timestamp,
      });

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

      // Step 2: Execute on-chain minting with the signature
      toast.info('Minting on blockchain...', { id: 'mint-progress' });
      
      const txHash = await mintOnChain({
        tokenId: mintResponse.createdTokenId,
        timestamp: mintResponse.timestamp,
        v: mintResponse.v,
        r: mintResponse.r,
        s: mintResponse.s,
      });

      console.log('Mint transaction hash:', txHash);

      toast.success('Post minted successfully!', {
        id: 'mint-progress',
        description: `Token ID: ${mintResponse.createdTokenId}`,
        action: {
          label: 'View on BaseScan',
          onClick: () => window.open(`https://basescan.org/tx/${txHash}`, '_blank'),
        },
      });
      
      resetForm();
      onClose();
    } catch (error) {
      console.error('Failed to mint post:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create post', { id: 'mint-progress' });
    } finally {
      setIsPosting(false);
    }
  }, [
    text, description, media, isSubscribersOnly, isPPV, ppvAmount, ppvCurrency,
    isWatch2Earn, w2eViews, w2eComments, w2eTotal, w2eCurrency,
    isTokenGated, tokenContract, tokenAmount, liveMode, scheduledDate,
    hasVideo, hasImage, isPosting, resetForm, onClose
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
