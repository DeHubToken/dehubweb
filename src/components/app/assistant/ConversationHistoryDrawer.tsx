/**
 * Conversation History Drawer
 * ============================
 * Displays past AI conversations for logged-in users.
 * Uses wallet address for identification (Web3Auth).
 */

import { useState, useEffect } from 'react';
import { History, Trash2, Loader2, MessageCircle, ChevronRight } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';

interface Conversation {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface ConversationHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoadConversation: (conversationId: string, messages: any[]) => void;
  currentConversationId: string | null;
}

export function ConversationHistoryDrawer({
  open,
  onOpenChange,
  onLoadConversation,
  currentConversationId,
}: ConversationHistoryDrawerProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const { walletAddress, isAuthenticated } = useAuth();

  // Fetch conversations when drawer opens
  useEffect(() => {
    if (open && walletAddress && isAuthenticated) {
      fetchConversations();
    }
  }, [open, walletAddress, isAuthenticated]);

  const fetchConversations = async () => {
    if (!walletAddress) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await withWalletHeader(
        supabase
          .from('ai_conversations')
          .select('*')
          .eq('wallet_address', walletAddress.toLowerCase())
          .order('updated_at', { ascending: false })
          .limit(50),
        walletAddress
      );

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      toast.error('Failed to load conversation history');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadConversation = async (conversationId: string) => {
    try {
      const { data: messages, error } = await withWalletHeader(
        supabase
          .from('ai_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true }),
        walletAddress
      );

      if (error) throw error;

      const formattedMessages = (messages || []).map((msg) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        imageUrl: msg.image_url || undefined,
        videoUrl: msg.video_url || undefined,
        attachedImage: msg.attached_image || undefined,
      }));

      onLoadConversation(conversationId, formattedMessages);
      onOpenChange(false);
    } catch (error) {
      console.error('Error loading conversation:', error);
      toast.error('Failed to load conversation');
    }
  };

  const handleDeleteConversation = async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    setDeletingId(conversationId);
    
    try {
      const { error } = await withWalletHeader(
        supabase
          .from('ai_conversations')
          .delete()
          .eq('id', conversationId),
        walletAddress
      );

      if (error) throw error;

      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      toast.success('Conversation deleted');
    } catch (error) {
      console.error('Error deleting conversation:', error);
      toast.error('Failed to delete conversation');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass className="border-t border-white/10">
        <DrawerHeader className="border-b border-white/10">
          <DrawerTitle className="text-white flex items-center gap-2">
            <History className="w-5 h-5 text-white" />
            Conversation History
          </DrawerTitle>
        </DrawerHeader>
        
        <ScrollArea className="h-[70vh]">
          {!isAuthenticated ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <MessageCircle className="w-12 h-12 text-white/20 mb-3" />
              <p className="text-white/60">Log in to see your conversation history</p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-white/60" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <MessageCircle className="w-12 h-12 text-white/20 mb-3" />
              <p className="text-white/60">No conversations yet</p>
              <p className="text-white/40 text-sm mt-1">Start chatting to save your conversations</p>
            </div>
          ) : (
            <div className="p-2">
              <AnimatePresence mode="popLayout">
                {conversations.map((conversation) => (
                  <motion.button
                    key={conversation.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => handleLoadConversation(conversation.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors mb-1 group ${
                      currentConversationId === conversation.id
                        ? 'bg-white/15'
                        : 'hover:bg-white/10'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                      <MessageCircle className="w-5 h-5 text-white/60" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">
                        {conversation.title || 'Untitled conversation'}
                      </p>
                      <p className="text-white/50 text-xs">
                        {formatDistanceToNow(new Date(conversation.updated_at), { addSuffix: true })}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => handleDeleteConversation(e, conversation.id)}
                        disabled={deletingId === conversation.id}
                        className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        {deletingId === conversation.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                      <ChevronRight className="w-4 h-4 text-white/30" />
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
