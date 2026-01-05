import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { MediaFile, Currency, PostFormState, PostFormActions, PostFormComputed, AudioFile } from '../types';

interface UsePostFormReturn {
  state: PostFormState;
  actions: PostFormActions;
  computed: PostFormComputed;
  refs: {
    imageInputRef: React.RefObject<HTMLInputElement>;
    videoInputRef: React.RefObject<HTMLInputElement>;
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
  const [isLive, setIsLive] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);

  // Refs
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Computed values
  const hasVideo = media.some(m => m.type === 'video');
  const hasImage = media.some(m => m.type === 'image');
  const isShort = hasVideo && media.some(m => m.type === 'video' && m.duration && m.duration < 90);

  const getPostDestinations = useCallback(() => {
    const destinations: string[] = ['Home'];
    if (hasImage) destinations.push('Images');
    if (hasVideo) {
      destinations.push('Videos');
      if (isShort) destinations.push('Shorts');
    }
    if (isLive) destinations.push('Live');
    return destinations;
  }, [hasImage, hasVideo, isShort, isLive]);

  const destinations = getPostDestinations();
  const canPost = Boolean(text.trim() || media.length > 0 || isLive);

  // Actions
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const preview = URL.createObjectURL(file);
      setMedia(prev => [...prev, { file, preview, type: 'image' }]);
    });
    e.target.value = '';
  }, []);

  const handleVideoSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const preview = URL.createObjectURL(file);
      
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = preview;
      
      const duration = await new Promise<number>((resolve) => {
        video.onloadedmetadata = () => {
          resolve(video.duration);
        };
      });

      setMedia(prev => [...prev, { file, preview, type: 'video', duration }]);
    }
    e.target.value = '';
  }, []);

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
    setIsLive(false);
  }, []);

  const handlePost = useCallback(() => {
    console.log('Posting to:', destinations);
    console.log('Content:', { text, media, isSubscribersOnly, isLive });
    
    resetForm();
    onClose();
  }, [destinations, text, media, isSubscribersOnly, isLive, resetForm, onClose]);

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
      isLive,
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
      setIsLive,
      handleImageSelect,
      handleVideoSelect,
      removeMedia,
      addAudioToMedia,
      removeAudioFromMedia,
      handleEnhanceWithAI,
      insertFormatting,
      handlePost,
      resetForm,
    },
    computed: {
      hasVideo,
      hasImage,
      isShort,
      destinations,
      canPost,
    },
    refs: {
      imageInputRef,
      videoInputRef,
      textareaRef,
    },
  };
}
