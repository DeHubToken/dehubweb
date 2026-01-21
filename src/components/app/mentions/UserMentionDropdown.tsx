/**
 * UserMentionDropdown Component
 * =============================
 * Displays a dropdown of matching users when typing @mention.
 * Shows up to 5 most relevant matches after typing 1+ characters.
 * Uses React Portal to escape parent stacking contexts (e.g., Drawer/Dialog).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { getMediaUrl, type DeHubUser } from '@/lib/api/dehub';
import { cn } from '@/lib/utils';

// Mock users for demo - in production this would come from API
const MOCK_USERS: DeHubUser[] = [
  { id: '1', username: 'malik', displayName: 'Malik Jan', avatarImageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100', isVerified: true },
  { id: '2', username: 'mikehales', displayName: 'Mike Hales', avatarImageUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100', isVerified: true },
  { id: '3', username: 'indijay', displayName: 'Indi Jay', avatarImageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100', isVerified: true },
  { id: '4', username: 'bailey', displayName: 'Bailey Young', avatarImageUrl: 'https://images.unsplash.com/photo-1599566150163-29194dcabd36?w=100', isVerified: true },
  { id: '5', username: 'cryptoqueen', displayName: 'Crypto Queen', avatarImageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100', isVerified: false },
  { id: '6', username: 'web3wizard', displayName: 'Web3 Wizard', avatarImageUrl: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=100', isVerified: false },
  { id: '7', username: 'nftcollector', displayName: 'NFT Collector', avatarImageUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100', isVerified: false },
  { id: '8', username: 'defidev', displayName: 'DeFi Dev', avatarImageUrl: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=100', isVerified: true },
  { id: '9', username: 'tokenmaster', displayName: 'Token Master', avatarImageUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100', isVerified: false },
  { id: '10', username: 'blockchainguru', displayName: 'Blockchain Guru', avatarImageUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100', isVerified: true },
];

export interface MentionUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
}

interface UserMentionDropdownProps {
  query: string;
  isOpen: boolean;
  position: { top: number; left: number };
  onSelect: (user: MentionUser) => void;
  onClose: () => void;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
}

// Fuzzy search function - returns relevance score
function fuzzyMatch(query: string, text: string): number {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  
  // Exact match at start gets highest score
  if (textLower.startsWith(queryLower)) return 100;
  
  // Contains query gets medium score
  if (textLower.includes(queryLower)) return 50;
  
  // Fuzzy character matching
  let score = 0;
  let queryIndex = 0;
  
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      score += 10;
      queryIndex++;
    }
  }
  
  // All query chars found
  if (queryIndex === queryLower.length) {
    return score;
  }
  
  return 0;
}

// Search users with fuzzy matching
export function searchUsers(query: string, limit: number = 5): MentionUser[] {
  if (!query || query.length < 1) return [];
  
  const scored = MOCK_USERS.map(user => {
    const usernameScore = fuzzyMatch(query, user.username || '');
    const displayNameScore = fuzzyMatch(query, user.displayName || '');
    const maxScore = Math.max(usernameScore, displayNameScore);
    
    return {
      user: {
        id: user.id || user._id || '',
        username: user.username || '',
        displayName: user.displayName || user.display_name || null,
        avatarUrl: getMediaUrl(user.avatarImageUrl || user.avatarUrl || user.avatar_url || undefined) || null,
        isVerified: user.isVerified || user.is_verified || false,
      },
      score: maxScore,
    };
  })
  .filter(item => item.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, limit);
  
  return scored.map(item => item.user);
}

export function UserMentionDropdown({
  query,
  isOpen,
  position,
  onSelect,
  onClose,
  selectedIndex,
  onSelectedIndexChange,
}: UserMentionDropdownProps) {
  const [users, setUsers] = useState<MentionUser[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Search users when query changes
  useEffect(() => {
    if (query.length >= 1) {
      const results = searchUsers(query, 5);
      setUsers(results);
      // Reset selection when results change
      if (results.length > 0 && selectedIndex >= results.length) {
        onSelectedIndexChange(0);
      }
    } else {
      setUsers([]);
    }
  }, [query, selectedIndex, onSelectedIndexChange]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen || users.length === 0) return null;

  // Use portal to render dropdown at document body level
  // This escapes any parent stacking contexts (Drawer, Dialog, etc.)
  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={dropdownRef}
        initial={{ opacity: 0, y: 4, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 4, scale: 0.98 }}
        transition={{ duration: 0.12, ease: 'easeOut' }}
        className="fixed z-[9999] w-[260px] bg-zinc-900 border border-white/15 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden"
        style={{ 
          top: position.top, 
          left: position.left,
          backdropFilter: 'blur(20px)',
        }}
      >
        <div className="py-1.5">
          {users.map((user, index) => (
            <button
              key={user.id}
              onClick={() => onSelect(user)}
              onMouseEnter={() => onSelectedIndexChange(index)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all duration-100",
                index === selectedIndex
                  ? "bg-white/10"
                  : "hover:bg-white/5"
              )}
            >
              <Avatar className="w-7 h-7 flex-shrink-0">
                <AvatarImage src={user.avatarUrl || undefined} />
                <AvatarFallback className="bg-zinc-700 text-white text-xs">
                  {user.username?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium text-white truncate">
                    {user.displayName || user.username}
                  </span>
                  {user.isVerified && <VerifiedBadge className="w-3 h-3" />}
                </div>
                <span className="text-xs text-zinc-500">@{user.username}</span>
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

export default UserMentionDropdown;
