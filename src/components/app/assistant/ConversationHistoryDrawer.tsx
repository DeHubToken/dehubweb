/**
 * Conversation History Drawer
 * ============================
 * Displays past AI conversations for logged-in users.
 * Uses wallet address for identification (Web3Auth).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Music, Pause, Download } from 'lucide-react';
import { History, Trash2, Loader2, MessageCircle, ChevronRight, Image as ImageIcon, Play, Search, X } from 'lucide-react';
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

interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'video' | 'audio';
  conversation_id: string;
  created_at: string;
  title?: string;
}

/** Inline audio-playable thumbnail for the media grid */
function MediaThumbnail({ item, onSelect }: { item: MediaItem; onSelect: (item: MediaItem) => void }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggleAudio = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) {
      audioRef.current = new Audio(item.url);
      audioRef.current.addEventListener('ended', () => setIsPlaying(false));
    }
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [isPlaying, item.url]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  if (item.type === 'audio') {
    const displayTitle = item.title || 'Untitled Song';
    return (
      <button
        onClick={toggleAudio}
        className="col-span-3 flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/10 hover:border-white/20 bg-white/[0.03] transition-all"
      >
        <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
          {isPlaying ? (
            <div className="flex items-end gap-[2px] h-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="w-[2px] bg-white/80 rounded-full animate-pulse" style={{ height: `${4 + Math.random() * 10}px`, animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
          ) : (
            <Play className="w-4 h-4 text-white/50 fill-white/50" />
          )}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-xs text-white/80 font-medium truncate">{displayTitle}</p>
          <p className="text-[10px] text-white/35">{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</p>
        </div>
        <a
          href={item.url}
          download={`${displayTitle}.mp3`}
          onClick={(e) => e.stopPropagation()}
          className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
        </a>
        {isPlaying && <Pause className="w-3.5 h-3.5 text-white/50 shrink-0" />}
        {!isPlaying && <Music className="w-3.5 h-3.5 text-white/25 shrink-0" />}
      </button>
    );
  }

  return (
    <button
      onClick={() => onSelect(item)}
      className="relative aspect-square rounded-xl overflow-hidden border border-white/10 hover:border-white/30 transition-all group"
    >
      {item.type === 'image' ? (
        <img src={item.url} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full bg-white/5 relative">
          <video src={item.url} className="w-full h-full object-cover" muted preload="metadata" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Play className="w-6 h-6 text-white fill-white" />
          </div>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
        <p className="text-[9px] text-white/60">
          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
        </p>
      </div>
    </button>
  );
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
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [activeTab, setActiveTab] = useState<'chats' | 'media'>('chats');
  const [isLoading, setIsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Conversation[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { walletAddress, isAuthenticated } = useAuth();
  const mediaScrollRef = useRef<HTMLDivElement>(null);

  // Fetch conversations and media when drawer opens
  useEffect(() => {
    if (open && walletAddress && isAuthenticated) {
      fetchConversations();
      fetchMedia();
    }
  }, [open, walletAddress, isAuthenticated]);

  // Reset search when drawer closes
  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setSearchResults(null);
      setActiveTab('chats');
      setShowClearConfirm(false);
    }
  }, [open]);

  // Debounced search through conversation messages
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!searchQuery.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      if (!walletAddress) return;

      try {
        // First filter conversations by title
        const titleMatches = conversations.filter(c =>
          c.title?.toLowerCase().includes(searchQuery.toLowerCase())
        );

        // Then search message content
        const convoIds = conversations.map(c => c.id);
        if (convoIds.length === 0) {
          setSearchResults(titleMatches);
          setIsSearching(false);
          return;
        }

        const { data: messages } = await withWalletHeader(
          supabase
            .from('ai_messages')
            .select('conversation_id')
            .in('conversation_id', convoIds)
            .ilike('content', `%${searchQuery}%`)
            .limit(200),
          walletAddress
        );

        const messageConvoIds = new Set((messages || []).map(m => m.conversation_id));
        const combined = new Set([
          ...titleMatches.map(c => c.id),
          ...messageConvoIds,
        ]);

        const results = conversations.filter(c => combined.has(c.id));
        setSearchResults(results);
      } catch (error) {
        console.error('Search error:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, conversations, walletAddress]);

  const displayedConversations = searchResults ?? conversations;

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

  const fetchMedia = async () => {
    if (!walletAddress) return;

    try {
      // Get all conversation IDs for this user
      const { data: convos, error: convError } = await withWalletHeader(
        supabase
          .from('ai_conversations')
          .select('id')
          .eq('wallet_address', walletAddress.toLowerCase()),
        walletAddress
      );

      if (convError || !convos?.length) return;

      const convoIds = convos.map((c) => c.id);

      // Fetch messages with media
      const { data: messages, error: msgError } = await withWalletHeader(
        supabase
          .from('ai_messages')
          .select('id, content, image_url, video_url, audio_url, conversation_id, created_at, role')
          .in('conversation_id', convoIds)
          .or('image_url.neq.,video_url.neq.,audio_url.neq.')
          .order('created_at', { ascending: false })
          .limit(100),
        walletAddress
      );

      if (msgError) throw msgError;

      // Build a map of conversation_id -> latest user message content for audio titles
      const allMsgs = messages || [];
      const userPromptMap: Record<string, string> = {};
      // Also fetch user messages from same conversations for title context
      const audioConvoIds = [...new Set(allMsgs.filter(m => (m as any).audio_url).map(m => m.conversation_id))];
      if (audioConvoIds.length > 0) {
        const { data: userMsgs } = await withWalletHeader(
          supabase
            .from('ai_messages')
            .select('conversation_id, content, created_at')
            .in('conversation_id', audioConvoIds)
            .eq('role', 'user')
            .order('created_at', { ascending: false }),
          walletAddress
        );
        (userMsgs || []).forEach(m => {
          if (!userPromptMap[m.conversation_id]) {
            userPromptMap[m.conversation_id] = m.content;
          }
        });
      }

      const items: MediaItem[] = [];
      allMsgs.forEach((msg) => {
        if (msg.image_url) {
          items.push({ id: msg.id + '-img', url: msg.image_url, type: 'image', conversation_id: msg.conversation_id, created_at: msg.created_at });
        }
        if (msg.video_url) {
          items.push({ id: msg.id + '-vid', url: msg.video_url, type: 'video', conversation_id: msg.conversation_id, created_at: msg.created_at });
        }
        if ((msg as any).audio_url) {
          // Try to extract a title from the user's prompt
          const prompt = userPromptMap[msg.conversation_id] || '';
          const titleMatch = prompt.match(/(?:called|titled|named)\s+["']?([^"'\n,.]+)["']?/i)
            || prompt.match(/title\s*[:\-]\s*["']?([^"'\n,.]+)["']?/i);
          const title = titleMatch ? titleMatch[1].trim() : (prompt.split('\n')[0]?.slice(0, 50) || undefined);
          items.push({ id: msg.id + '-aud', url: (msg as any).audio_url, type: 'audio', conversation_id: msg.conversation_id, created_at: msg.created_at, title });
        }
      });

      setMediaItems(items);
    } catch (error) {
      console.error('Error fetching media:', error);
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
        audioUrl: (msg as any).audio_url || undefined,
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
      setMediaItems((prev) => prev.filter((m) => m.conversation_id !== conversationId));
      toast.success('Conversation deleted');
    } catch (error) {
      console.error('Error deleting conversation:', error);
      toast.error('Failed to delete conversation');
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    if (!walletAddress || conversations.length === 0) return;
    setIsClearingAll(true);
    try {
      const { error } = await withWalletHeader(
        supabase
          .from('ai_conversations')
          .delete()
          .eq('wallet_address', walletAddress.toLowerCase()),
        walletAddress
      );
      if (error) throw error;
      setConversations([]);
      setMediaItems([]);
      toast.success('All conversations cleared');
    } catch (error) {
      console.error('Error clearing conversations:', error);
      toast.error('Failed to clear conversations');
    } finally {
      setIsClearingAll(false);
    }
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent glass className="border-t border-white/10">
          <DrawerHeader className="border-b border-white/10">
            <div className="flex items-center justify-between">
              <DrawerTitle className="text-white flex items-center gap-2">
                <History className="w-5 h-5 text-white" />
                Conversation History
              </DrawerTitle>
              <div className="flex items-center gap-2">
                {conversations.length > 0 && (
                  showClearConfirm ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/60">Are you sure?</span>
                      <button
                        onClick={() => setShowClearConfirm(false)}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium text-white/70 hover:bg-white/10 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => { handleClearAll(); setShowClearConfirm(false); }}
                        disabled={isClearingAll}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium text-red-400 bg-red-400/10 hover:bg-red-400/20 transition-colors disabled:opacity-50"
                      >
                        {isClearingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Yes, Clear'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowClearConfirm(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-400/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear All
                    </button>
                  )
                )}
                <button
                  onClick={() => onOpenChange(false)}
                  className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Search bar */}
            {conversations.length > 0 && (
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search conversations…"
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/25 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* Tabs */}
            {isAuthenticated && (
              <div className="flex gap-1 mt-3 bg-white/5 rounded-xl p-1">
                <button
                  onClick={() => setActiveTab('chats')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
                    activeTab === 'chats'
                      ? 'bg-white/10 text-white'
                      : 'text-white/50 hover:text-white/70'
                  }`}
                >
                  💬 Chats
                </button>
                <button
                  onClick={() => setActiveTab('media')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                    activeTab === 'media'
                      ? 'bg-white/10 text-white'
                      : 'text-white/50 hover:text-white/70'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  Media
                  {mediaItems.length > 0 && (
                    <span className="text-[10px] text-white/40">({mediaItems.length})</span>
                  )}
                </button>
              </div>
            )}
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
            ) : activeTab === 'media' ? (
              /* ---- MEDIA TAB ---- */
              mediaItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <ImageIcon className="w-12 h-12 text-white/20 mb-3" />
                  <p className="text-white/60">No media generated yet</p>
                  <p className="text-white/40 text-sm mt-1">Images, videos & music you create will appear here</p>
                </div>
              ) : (
                <div className="p-3">
                  {/* Filter chips */}
                  <div className="flex gap-1.5 mb-3">
                    {['all', 'image', 'video', 'audio'].map((filter) => {
                      const count = filter === 'all' ? mediaItems.length : mediaItems.filter(m => m.type === filter).length;
                      if (filter !== 'all' && count === 0) return null;
                      return (
                        <button
                          key={filter}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/5 text-white/60 hover:bg-white/10 transition-colors"
                        >
                          {filter === 'all' ? '🎨 All' : filter === 'image' ? '🖼️ Images' : filter === 'video' ? '🎬 Videos' : '🎵 Audio'}
                          <span className="ml-1 text-white/30">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {mediaItems.map((item) => (
                      <MediaThumbnail key={item.id} item={item} onSelect={setSelectedMedia} />
                    ))}
                  </div>
                </div>
              )
            ) : displayedConversations.length === 0 && !searchQuery ? (
              /* ---- CHATS TAB (empty) ---- */
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <MessageCircle className="w-12 h-12 text-white/20 mb-3" />
                <p className="text-white/60">No conversations yet</p>
                <p className="text-white/40 text-sm mt-1">Start chatting to save your conversations</p>
              </div>
            ) : (
              /* ---- CHATS TAB ---- */
              <div>
                {/* Search status */}
                {searchQuery && (
                  <div className="px-4 pt-3 pb-1">
                    {isSearching ? (
                      <div className="flex items-center gap-2 text-white/40 text-xs">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Searching…
                      </div>
                    ) : (
                      <p className="text-white/40 text-xs">
                        {displayedConversations.length} result{displayedConversations.length !== 1 ? 's' : ''} for "{searchQuery}"
                      </p>
                    )}
                  </div>
                )}

                {/* Conversation List */}
                <div className="p-2">
                  <AnimatePresence mode="popLayout">
                    {displayedConversations.map((conversation) => (
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
                            className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-white/10 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
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
              </div>
            )}
          </ScrollArea>
        </DrawerContent>
      </Drawer>

      {/* Media Preview Modal */}
      <AnimatePresence>
        {selectedMedia && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setSelectedMedia(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-lg w-full max-h-[80vh] rounded-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {selectedMedia.type === 'image' ? (
                <img
                  src={selectedMedia.url}
                  alt=""
                  className="w-full h-auto max-h-[80vh] object-contain rounded-2xl"
                />
              ) : selectedMedia.type === 'audio' ? (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col items-center gap-4">
                  <Music className="w-12 h-12 text-white/40" />
                  <audio src={selectedMedia.url} controls autoPlay className="w-full" />
                </div>
              ) : (
                <video
                  src={selectedMedia.url}
                  controls
                  autoPlay
                  className="w-full h-auto max-h-[80vh] rounded-2xl"
                />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
