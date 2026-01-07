import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { MediaFile, Currency, PostFormState, PostFormActions, PostFormComputed, AudioFile, LiveMode } from '../types';

interface UsePostFormReturn {
  state: PostFormState;
  actions: PostFormActions;
  computed: PostFormComputed;
  refs: {
    imageInputRef: React.RefObject<HTMLInputElement>;
    videoInputRef: React.RefObject<HTMLInputElement>;
    audioInputRef: React.RefObject<HTMLInputElement>;
    textareaRef: React.RefObject<HTMLTextAreaElement>;
  };
}

export function usePostForm(onClose: () => void): UsePostFormReturn {
  // Form state
  const [text, setText] = useState('');
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

  // Refs
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

    // Can't add images if there's already a video
    if (hasVideo) {
      toast.error('Remove the video first to add images');
      e.target.value = '';
      return;
    }

    const currentImageCount = media.filter(m => m.type === 'image').length;
    const availableSlots = 4 - currentImageCount;
    
    if (availableSlots <= 0) {
      toast.error('Maximum 4 images allowed');
      e.target.value = '';
      return;
    }

    const filesToAdd = Array.from(files).slice(0, availableSlots);
    
    if (files.length > availableSlots) {
      toast.info(`Only ${availableSlots} image${availableSlots > 1 ? 's' : ''} added (max 4)`);
    }

    filesToAdd.forEach(file => {
      const preview = URL.createObjectURL(file);
      setMedia(prev => [...prev, { file, preview, type: 'image' }]);
    });
    e.target.value = '';
  }, [hasVideo, media]);

  const handleVideoSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Can't add video if there are already images
    if (hasImage) {
      toast.error('Remove images first to add a video');
      e.target.value = '';
      return;
    }

    // Can't add more than 1 video
    if (hasVideo) {
      toast.error('Only 1 video allowed per post');
      e.target.value = '';
      return;
    }

    const file = files[0]; // Only take the first video
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
    e.target.value = '';
  }, [hasImage, hasVideo]);

  const removeMedia = useCallback((index: number) => {
    setMedia(prev => {
      const item = prev[index];
      URL.revokeObjectURL(item.preview);
      if (item.audio) URL.revokeObjectURL(item.audio.url);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

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

  const handleAudioSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
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
    
    e.target.value = '';
  }, [hasImage]);

  const handleEnhanceWithAI = useCallback(async () => {
    if (!text.trim()) {
      toast.error('Enter some text to enhance');
      return;
    }
    setIsEnhancing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('enhance-text', {
        body: { text: text.trim() }
      });

      if (error) {
        console.error('Enhancement error:', error);
        toast.error(error.message || 'Failed to enhance text');
        return;
      }

      if (data?.enhancedText) {
        setText(data.enhancedText);
        toast.success('Text enhanced!');
      } else if (data?.error) {
        toast.error(data.error);
      }
    } catch (err) {
      console.error('Enhancement error:', err);
      toast.error('Failed to enhance text');
    } finally {
      setIsEnhancing(false);
    }
  }, [text]);

  const insertFormatting = useCallback((format: 'bold' | 'italic' | 'mention') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = text.substring(start, end);

    let newText = '';
    let cursorOffset = 0;

    switch (format) {
      case 'bold':
        newText = text.substring(0, start) + `**${selectedText}**` + text.substring(end);
        cursorOffset = selectedText ? 4 : 2;
        break;
      case 'italic':
        newText = text.substring(0, start) + `_${selectedText}_` + text.substring(end);
        cursorOffset = selectedText ? 2 : 1;
        break;
      case 'mention':
        newText = text.substring(0, start) + `@${selectedText}` + text.substring(end);
        cursorOffset = 1;
        break;
    }

    setText(newText);
    
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = selectedText ? end + cursorOffset : start + cursorOffset;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }, [text]);

  const resetForm = useCallback(() => {
    setText('');
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
  }, []);

  const handlePost = useCallback(() => {
    console.log('Posting to:', destinations);
    console.log('Content:', { text, media, isSubscribersOnly, liveMode });
    
    resetForm();
    onClose();
  }, [destinations, text, media, isSubscribersOnly, liveMode, resetForm, onClose]);

  return {
    state: {
      text,
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
    },
    actions: {
      setText,
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
      removeMedia,
      handleAudioSelect,
      addAudioToMedia,
      removeAudioFromMedia,
      toggleMusicVideo,
      handleEnhanceWithAI,
      insertFormatting,
      handlePost,
      resetForm,
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
      textareaRef,
    },
  };
}
