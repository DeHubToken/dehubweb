/**
 * Username Required Modal
 * =======================
 * A mandatory modal that blocks app interaction until the user
 * sets their username and display name, or logs out.
 * 
 * @module components/app/modals/UsernameRequiredModal
 */

import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { updateProfile, checkUsernameAvailability } from '@/lib/api/dehub';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, LogOut, AlertCircle, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import profileIcon from '@/assets/profile-icon.png';

// Debounce helper
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export function UsernameRequiredModal() {
  const queryClient = useQueryClient();
  const { requiresUsername, disconnect, refreshUser, setRequiresUsername, walletAddress } = useAuth();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Username availability state
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  
  const debouncedUsername = useDebounce(username, 500);

  // Check username availability
  const checkUsername = useCallback(async (usernameToCheck: string) => {
    if (!usernameToCheck || usernameToCheck.length < 3) {
      setUsernameAvailable(null);
      setUsernameError(null);
      return;
    }

    if (usernameToCheck.length > 30) {
      setUsernameAvailable(false);
      setUsernameError('Username must be 30 characters or less');
      return;
    }

    if (!/^[a-z0-9_]+$/.test(usernameToCheck)) {
      setUsernameAvailable(false);
      setUsernameError('Only letters, numbers, and underscores allowed');
      return;
    }

    setIsCheckingUsername(true);
    setUsernameError(null);

    try {
      const response = await checkUsernameAvailability(usernameToCheck);
      
      if (response.available) {
        setUsernameAvailable(true);
        setUsernameError(null);
      } else {
        setUsernameAvailable(false);
        setUsernameError('Username is already taken');
      }
    } catch (err) {
      console.error('Username check failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to check username';
      setUsernameAvailable(false);
      setUsernameError(errorMessage);
    } finally {
      setIsCheckingUsername(false);
    }
  }, []);

  // Check username when debounced value changes
  useEffect(() => {
    if (debouncedUsername) {
      checkUsername(debouncedUsername);
    } else {
      setUsernameAvailable(null);
      setUsernameError(null);
    }
  }, [debouncedUsername, checkUsername]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedUsername = username.trim().toLowerCase();
    const trimmedDisplayName = displayName.trim();

    // Validate username
    if (!trimmedUsername) {
      setError('Username is required');
      return;
    }

    if (trimmedUsername.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    if (trimmedUsername.length > 30) {
      setError('Username must be 30 characters or less');
      return;
    }

    if (!/^[a-z0-9_]+$/.test(trimmedUsername)) {
      setError('Username can only contain letters, numbers, and underscores');
      return;
    }

    // Ensure username is available
    if (!usernameAvailable) {
      setError('Please choose an available username');
      return;
    }

    if (!trimmedDisplayName) {
      setError('Display name is required');
      return;
    }

    if (trimmedDisplayName.length > 50) {
      setError('Display name must be less than 50 characters');
      return;
    }

    setIsSubmitting(true);

    try {
      await updateProfile({
        username: trimmedUsername,
        displayName: trimmedDisplayName,
      });

      // Refresh user data in auth context
      await refreshUser();
      
      // Invalidate profile queries to refresh profile page
      await queryClient.invalidateQueries({ queryKey: ['dehub-profile'] });
      await queryClient.invalidateQueries({ queryKey: ['dehub-user-content'] });
      
      setRequiresUsername(false);
      
      // Navigate to home feed if not already there (avoid staying on settings after profile creation)
      if (window.location.pathname !== '/app') {
        window.location.href = '/app';
      }
      
      toast.success('Profile created successfully!');
    } catch (err) {
      console.error('Failed to update profile:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to save profile';
      
      if (errorMessage.toLowerCase().includes('taken') || errorMessage.toLowerCase().includes('exists')) {
        setError('This username is already taken. Please choose another.');
        setUsernameAvailable(false);
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await disconnect();
      toast.info('Logged out');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const canSubmit = username.trim().length >= 3 && 
                    displayName.trim().length > 0 && 
                    usernameAvailable === true && 
                    !isCheckingUsername;

  return (
    <Dialog open={requiresUsername} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md border border-white/10 bg-black/60 backdrop-blur-[24px] saturate-[180%] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        hideCloseButton
      >
        <DialogHeader className="text-center">
          <img 
            src={profileIcon} 
            alt="Profile" 
            className="mx-auto mb-4 h-20 w-20 object-contain"
          />
          <DialogTitle className="text-xl text-white text-center">Complete Your Profile</DialogTitle>
          <DialogDescription className="text-zinc-400 text-center">
            Choose a username and display name to get started on DeHub.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="username" className="text-zinc-300">Username</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">@</span>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="username"
                className={cn(
                  "pl-8 pr-10 bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500",
                  "focus:border-primary focus:ring-primary/20",
                  usernameAvailable === true && "border-green-500/50",
                  usernameAvailable === false && "border-red-500/50"
                )}
                maxLength={30}
                disabled={isSubmitting}
                autoComplete="off"
              />
              {/* Status indicator */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {isCheckingUsername && (
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                )}
                {!isCheckingUsername && usernameAvailable === true && (
                  <Check className="h-4 w-4 text-green-500" />
                )}
                {!isCheckingUsername && usernameAvailable === false && (
                  <X className="h-4 w-4 text-red-500" />
                )}
              </div>
            </div>
            {usernameError ? (
              <p className="text-xs text-red-400">{usernameError}</p>
            ) : usernameAvailable === true ? (
              <p className="text-xs text-green-400">Username is available!</p>
            ) : (
              <p className="text-xs text-zinc-500">
                Letters, numbers, and underscores only. 3-30 characters.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName" className="text-zinc-300">Display Name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your Name"
              className="bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-primary focus:ring-primary/20"
              maxLength={50}
              disabled={isSubmitting}
              autoComplete="off"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-lg">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <Button 
              type="submit" 
              className="w-full bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 text-white hover:bg-white/10 rounded-xl h-12"
              disabled={isSubmitting || !canSubmit}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Continue'
              )}
            </Button>
            
            <Button
              type="button"
              variant="ghost"
              className="w-full text-zinc-400 hover:text-white hover:bg-zinc-800"
              onClick={handleLogout}
              disabled={isSubmitting}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out instead
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
