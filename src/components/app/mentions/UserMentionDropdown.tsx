/**
 * UserMentionDrawer Component
 * ===========================
 * A clean bottom drawer for @mention user search.
 * Opens when user types @ in an input, with its own search bar.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { apiCall, getMediaUrl } from '@/lib/api/dehub/core';
import { Search, Loader2, AtSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

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

// Legacy export for compatibility
export function searchUsers(_query: string, _limit: number = 5): MentionUser[] {
  return [];
}

export function UserMentionDropdown({
  query: initialQuery,
  isOpen,
  onSelect,
  onClose,
  selectedIndex,
  onSelectedIndexChange,
}: UserMentionDropdownProps) {
  const [users, setUsers] = useState<MentionUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const latestQueryRef = useRef(searchQuery);

  // Sync initial query when drawer opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery(initialQuery);
      // Focus search input after drawer animates in
      setTimeout(() => searchInputRef.current?.focus(), 150);
    } else {
      setUsers([]);
      setSearchQuery('');
    }
  }, [isOpen, initialQuery]);

  // Debounced API search
  useEffect(() => {
    latestQueryRef.current = searchQuery;

    if (!searchQuery || searchQuery.length < 1) {
      setUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const response = await apiCall<any>('/api/search', {
          params: { q: searchQuery, type: 'people', limit: 10 },
        });

        if (latestQueryRef.current !== searchQuery) return;

        const items = response?.accounts?.items || [];
        const mapped: MentionUser[] = items.slice(0, 8).map((u: any) => ({
          id: u._id || u.id || u.address || '',
          username: u.username || '',
          displayName: u.displayName || u.display_name || null,
          avatarUrl: getMediaUrl(u.avatarImageUrl || u.avatarUrl || undefined) || null,
          isVerified: u.isVerified || u.is_verified || false,
        }));

        setUsers(mapped);
        if (mapped.length > 0 && selectedIndex >= mapped.length) {
          onSelectedIndexChange(0);
        }
      } catch (err) {
        console.error('[Mentions] search failed:', err);
        setUsers([]);
      } finally {
        if (latestQueryRef.current === searchQuery) {
          setLoading(false);
        }
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  // Expose users for keyboard selection from parent
  useEffect(() => {
    if (users.length > 0) {
      (window as any).__mentionResults = users;
    } else {
      delete (window as any).__mentionResults;
    }
    return () => { delete (window as any).__mentionResults; };
  }, [users]);

  const handleSelect = useCallback((user: MentionUser) => {
    onSelect(user);
  }, [onSelect]);

  const showEmpty = !loading && users.length === 0 && searchQuery.length >= 2;

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DrawerContent
        className="bg-black/95 border-t border-white/[0.08] max-h-[70vh] rounded-t-3xl"
        style={{
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        {/* Header + Search */}
        <div className="px-4 pb-3 space-y-3">
          <div className="flex items-center gap-2">
            <AtSign className="w-4 h-4 text-white/40" />
            <span className="text-sm font-semibold text-white/70 tracking-wide">
              Mention a user
            </span>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                onSelectedIndexChange(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const maxIdx = Math.max(0, users.length - 1);
                  onSelectedIndexChange(Math.min(selectedIndex + 1, maxIdx));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  onSelectedIndexChange(Math.max(selectedIndex - 1, 0));
                } else if (e.key === 'Enter' && users[selectedIndex]) {
                  e.preventDefault();
                  handleSelect(users[selectedIndex]);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onClose();
                }
              }}
              placeholder="Search by username..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.08] text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20 focus:bg-white/[0.08] transition-all"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {loading && (
              <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 animate-spin" />
            )}
          </div>
        </div>

        {/* Results */}
        <div className="overflow-y-auto px-2 pb-6" style={{ maxHeight: 'calc(70vh - 140px)' }}>
          {/* Empty state */}
          {showEmpty && (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Search className="w-8 h-8 text-white/10" />
              <span className="text-sm text-white/25">No users found</span>
            </div>
          )}

          {/* Initial state */}
          {!loading && users.length === 0 && searchQuery.length < 2 && (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <AtSign className="w-8 h-8 text-white/10" />
              <span className="text-sm text-white/25">Type to search users</span>
            </div>
          )}

          {/* User list */}
          <AnimatePresence mode="popLayout">
            {users.map((user, index) => (
              <motion.button
                key={user.id || user.username}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15, delay: index * 0.03 }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelect(user);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelect(user);
                }}
                onMouseEnter={() => onSelectedIndexChange(index)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-all duration-100",
                  index === selectedIndex
                    ? "bg-white/[0.08]"
                    : "bg-transparent active:bg-white/[0.06]"
                )}
              >
                <Avatar className="w-10 h-10 flex-shrink-0 rounded-xl ring-1 ring-white/[0.06]">
                  <AvatarImage src={user.avatarUrl || undefined} className="object-cover" />
                  <AvatarFallback className="bg-white/[0.06] text-white/50 text-sm rounded-xl">
                    {(user.username || 'U').charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[14px] font-medium text-white truncate">
                      {user.displayName || user.username}
                    </span>
                    {user.isVerified && <VerifiedBadge className="w-3.5 h-3.5 flex-shrink-0" />}
                  </div>
                  <span className="text-[12px] text-white/35 truncate">
                    @{user.username}
                  </span>
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default UserMentionDropdown;
