/**
 * Minimized AI Chats Component
 * ============================
 * Global floating buttons for minimized AI chat sessions.
 * Persists across all tabs and routes, similar to radio mini player.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useMinimizedChats, type MinimizedChat } from '@/hooks/use-minimized-chats';
import assistantAvatar from '@/assets/ai-assistant-avatar.png';

interface MinimizedAIChatsProps {
  onRestore?: (chat: MinimizedChat) => void;
}

export function MinimizedAIChats({ onRestore }: MinimizedAIChatsProps) {
  const { chats, removeChat } = useMinimizedChats();

  if (chats.length === 0) return null;

  return (
    <div className="fixed right-4 z-50 flex flex-col-reverse gap-2" style={{ bottom: '140px' }}>
      <AnimatePresence>
        {chats.map((chat, index) => (
          <motion.button
            key={chat.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => {
              removeChat(chat.id);
              onRestore?.(chat);
            }}
            className="w-12 h-12 rounded-xl bg-black/60 backdrop-blur-[24px] saturate-[180%] border border-white/10 shadow-2xl flex items-center justify-center hover:bg-black/80 transition-colors relative group"
          >
            <img src={assistantAvatar} alt="Assistant" className="w-8 h-8 rounded-lg" />
            {/* Tooltip on hover */}
            <div className="absolute right-14 bg-black/80 backdrop-blur-sm px-2 py-1 rounded-lg text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none max-w-[150px] truncate">
              {chat.title || `${chat.type} chat`}
            </div>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
