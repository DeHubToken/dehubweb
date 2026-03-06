/**
 * UserMentionDropdown Component
 * =============================
 * Displays a dropdown of matching users when typing @mention.
 * Searches the live DeHub API with debounced queries.
 * Uses React Portal to escape parent stacking contexts.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { apiCall } from '@/lib/api/dehub/core';
import { getMediaUrl } from '@/lib/api/dehub/core';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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

// Legacy export for compatibility — now delegates to the API-backed dropdown
export function searchUsers(_query: string, _limit: number = 5): MentionUser[] {
  // This is now a no-op stub; the dropdown handles async search internally.
  // Kept for callers that reference it for keyboard selection — they fall through
  // to handleSelect which uses the internal results state.
  return [];
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
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const latestQueryRef = useRef(query);

  // Debounced API search
  useEffect(() => {
    latestQueryRef.current = query;

    if (!query || query.length < 1) {
      setUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const response = await apiSearchUsers({ q: query, limit: 8 });
        // Only apply results if query hasn't changed
        if (latestQueryRef.current !== query) return;

        const mapped: MentionUser[] = (response.data || []).slice(0, 5).map((u) => ({
          id: (u as any)._id || u.id || u.address || '',
          username: u.username || '',
          displayName: u.displayName || (u as any).display_name || null,
          avatarUrl: getMediaUrl(u.avatarImageUrl || u.avatarUrl || undefined) || null,
          isVerified: u.isVerified || (u as any).is_verified || false,
        }));

        setUsers(mapped);
        if (mapped.length > 0 && selectedIndex >= mapped.length) {
          onSelectedIndexChange(0);
        }
      } catch (err) {
        console.error('[Mentions] search failed:', err);
        setUsers([]);
      } finally {
        if (latestQueryRef.current === query) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Expose users for keyboard selection from parent
  useEffect(() => {
    if (users.length > 0) {
      // Store on window for parent keyboard handler access
      (window as any).__mentionResults = users;
    } else {
      delete (window as any).__mentionResults;
    }
    return () => { delete (window as any).__mentionResults; };
  }, [users]);

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

  if (!isOpen) return null;

  const showEmpty = !loading && users.length === 0 && query.length >= 2;

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={dropdownRef}
        initial={{ opacity: 0, y: 6, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.96 }}
        transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
        className="fixed z-[9999] w-[280px] overflow-hidden rounded-2xl border border-white/10 bg-black/70 shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
        style={{
          top: position.top,
          left: position.left,
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        {/* Header */}
        <div className="px-3.5 pt-2.5 pb-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-white/40">
            Mention a user
          </span>
        </div>

        {/* Loading state */}
        {loading && users.length === 0 && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 text-white/30 animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {showEmpty && (
          <div className="px-3.5 py-4 text-center">
            <span className="text-xs text-white/30">No users found</span>
          </div>
        )}

        {/* User list */}
        {users.length > 0 && (
          <div className="py-1 px-1">
            {users.map((user, index) => (
              <button
                key={user.id || user.username}
                onClick={() => onSelect(user)}
                onMouseEnter={() => onSelectedIndexChange(index)}
                className={cn(
                  "w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left transition-colors duration-100",
                  index === selectedIndex
                    ? "bg-white/10"
                    : "bg-transparent hover:bg-white/5"
                )}
              >
                <Avatar className="w-8 h-8 flex-shrink-0 rounded-lg">
                  <AvatarImage src={user.avatarUrl || undefined} className="object-cover" />
                  <AvatarFallback className="bg-white/10 text-white/70 text-xs rounded-lg">
                    {(user.username || 'U').charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex items-center gap-1">
                    <span className="text-[13px] font-medium text-white truncate">
                      {user.displayName || user.username}
                    </span>
                    {user.isVerified && <VerifiedBadge className="w-3.5 h-3.5" />}
                  </div>
                  <span className="text-[11px] text-white/40 truncate">
                    @{user.username}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Loading indicator when updating results */}
        {loading && users.length > 0 && (
          <div className="flex justify-center pb-2">
            <div className="w-1 h-1 rounded-full bg-white/20 animate-pulse" />
          </div>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

export default UserMentionDropdown;
