/**
 * useAIConversation Hook
 * =======================
 * Manages AI conversation persistence - saving and loading conversations.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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
  const { user } = useAuth();
  const saveQueueRef = useRef<Message[]>([]);
  const isSavingRef = useRef(false);
  const titleGeneratedRef = useRef(false);

  // Reset title flag when conversation changes
  useEffect(() => {
    titleGeneratedRef.current = false;
  }, [conversationId]);

  // Create a new conversation
  const createConversation = useCallback(async (firstMessage: string): Promise<string | null> => {
    if (!user) return null;

    try {
      // Generate a title from the first message (first 50 chars)
      const title = firstMessage.length > 50 
        ? firstMessage.substring(0, 50) + '...'
        : firstMessage;

      const { data, error } = await supabase
        .from('ai_conversations')
        .insert({
          user_id: user.id,
          title,
        })
        .select('id')
        .single();

      if (error) throw error;
      
      const newConversationId = data.id;
      setConversationId(newConversationId);
      titleGeneratedRef.current = true;
      return newConversationId;
    } catch (error) {
      console.error('Error creating conversation:', error);
      return null;
    }
  }, [user]);

  // Save a message to the conversation
  const saveMessage = useCallback(async (
    message: Message,
    currentConversationId: string
  ): Promise<void> => {
    if (!user || !currentConversationId) return;

    try {
      const { error } = await supabase
        .from('ai_messages')
        .insert({
          conversation_id: currentConversationId,
          role: message.role,
          content: message.content,
          image_url: message.imageUrl || null,
          video_url: message.videoUrl || null,
          attached_image: message.attachedImage || null,
        });

      if (error) throw error;

      // Update conversation's updated_at
      await supabase
        .from('ai_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', currentConversationId);

    } catch (error) {
      console.error('Error saving message:', error);
    }
  }, [user]);

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
    if (!user) return;

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
  }, [user, conversationId, createConversation, saveMessage, processSaveQueue]);

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
