/**
 * useAIConversation Hook
 * =======================
 * Manages AI conversation persistence - saving and loading conversations.
 * Uses wallet address for user identification (Web3Auth).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { withWalletHeader } from '@/lib/supabase-wallet-client';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  videoUrl?: string;
  attachedImage?: string;
}

export function useAIConversation() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { walletAddress, isAuthenticated } = useAuth();
  const saveQueueRef = useRef<Message[]>([]);
  const isSavingRef = useRef(false);
  const titleGeneratedRef = useRef(false);

  // Reset title flag when conversation changes
  useEffect(() => {
    titleGeneratedRef.current = false;
  }, [conversationId]);

  // Create a new conversation
  const createConversation = useCallback(async (firstMessage: string): Promise<string | null> => {
    if (!walletAddress || !isAuthenticated) {
      console.log('[AI Conversation] Not authenticated, skipping save');
      return null;
    }

    try {
      // Generate a title from the first message (first 50 chars)
      const title = firstMessage.length > 50 
        ? firstMessage.substring(0, 50) + '...'
        : firstMessage;

      const { data, error } = await withWalletHeader(
        supabase
          .from('ai_conversations')
          .insert({
            wallet_address: walletAddress.toLowerCase(),
            title,
          })
          .select('id')
          .single(),
        walletAddress
      );

      if (error) {
        console.error('[AI Conversation] Error creating conversation:', error);
        throw error;
      }
      
      const newConversationId = data.id;
      setConversationId(newConversationId);
      titleGeneratedRef.current = true;
      console.log('[AI Conversation] Created new conversation:', newConversationId);
      return newConversationId;
    } catch (error) {
      console.error('[AI Conversation] Error creating conversation:', error);
      return null;
    }
  }, [walletAddress, isAuthenticated]);

  // Upload a data: URL to storage and return its public URL. Non-data URLs pass through.
  const persistMediaUrl = useCallback(async (
    url: string | undefined | null,
    kind: 'image' | 'video',
  ): Promise<string | null> => {
    if (!url) return null;
    if (!url.startsWith('data:')) return url;
    try {
      const match = /^data:([^;]+);base64,(.*)$/.exec(url);
      if (!match) return null;
      const mime = match[1];
      const b64 = match[2];
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const ext = (mime.split('/')[1] || (kind === 'video' ? 'mp4' : 'png')).split('+')[0];
      const path = `assistant/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from('ai-media-uploads').upload(path, bytes, {
        contentType: mime,
        upsert: false,
      });
      if (up.error) throw up.error;
      const { data: pub } = supabase.storage.from('ai-media-uploads').getPublicUrl(path);
      return pub.publicUrl;
    } catch (e) {
      console.error('[AI Conversation] Failed to upload data URL to storage:', e);
      return null;
    }
  }, []);

  // Save a message to the conversation
  const saveMessage = useCallback(async (
    message: Message,
    currentConversationId: string
  ): Promise<void> => {
    if (!walletAddress || !currentConversationId) return;

    try {
      const [imageUrl, videoUrl] = await Promise.all([
        persistMediaUrl(message.imageUrl, 'image'),
        persistMediaUrl(message.videoUrl, 'video'),
      ]);

      const { error } = await withWalletHeader(
        supabase
          .from('ai_messages')
          .insert({
            conversation_id: currentConversationId,
            role: message.role,
            content: message.content || '(image)',
            image_url: imageUrl,
            video_url: videoUrl,
            attached_image: message.attachedImage || null,
            audio_url: (message as any).audioUrl || null,
          }),
        walletAddress
      );


      if (error) {
        console.error('[AI Conversation] Error saving message:', error);
        throw error;
      }

      // Update conversation's updated_at
      await withWalletHeader(
        supabase
          .from('ai_conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', currentConversationId),
        walletAddress
      );

      console.log('[AI Conversation] Saved message to conversation:', currentConversationId);
    } catch (error) {
      console.error('[AI Conversation] Error saving message:', error);
    }
  }, [walletAddress, persistMediaUrl]);

  // Process the save queue
  const processSaveQueue = useCallback(async () => {
    if (isSavingRef.current || saveQueueRef.current.length === 0) return;
    
    isSavingRef.current = true;
    setIsSaving(true);

    while (saveQueueRef.current.length > 0) {
      const message = saveQueueRef.current.shift();
      if (message && conversationId) {
        await saveMessage(message, conversationId);
      }
    }

    isSavingRef.current = false;
    setIsSaving(false);
  }, [conversationId, saveMessage]);

  // Add message to save queue
  const queueMessage = useCallback(async (message: Message) => {
    if (!walletAddress || !isAuthenticated) {
      console.log('[AI Conversation] Not authenticated, skipping message save');
      return;
    }

    // If no conversation exists yet, create one
    if (!conversationId) {
      const newId = await createConversation(message.content);
      if (newId) {
        await saveMessage(message, newId);
      }
      return;
    }

    // Queue the message and process
    saveQueueRef.current.push(message);
    processSaveQueue();
  }, [walletAddress, isAuthenticated, conversationId, createConversation, saveMessage, processSaveQueue]);

  // Start a new conversation (clears current)
  const startNewConversation = useCallback(() => {
    setConversationId(null);
    titleGeneratedRef.current = false;
    saveQueueRef.current = [];
  }, []);

  // Load an existing conversation
  const loadConversation = useCallback((id: string) => {
    setConversationId(id);
    titleGeneratedRef.current = true;
    saveQueueRef.current = [];
  }, []);

  return {
    conversationId,
    isSaving,
    queueMessage,
    startNewConversation,
    loadConversation,
  };
}
