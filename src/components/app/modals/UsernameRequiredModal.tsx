/**
 * Username Required Modal
 * =======================
 * A mandatory modal that blocks app interaction until the user
 * sets their username and display name, or logs out.
 * 
 * @module components/app/modals/UsernameRequiredModal
 */

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { updateProfile } from '@/lib/api/dehub';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UserCircle, LogOut, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export function UsernameRequiredModal() {
  const { requiresUsername, disconnect, refreshUser, setRequiresUsername } = useAuth();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate username
    const trimmedUsername = username.trim().toLowerCase();
    const trimmedDisplayName = displayName.trim();

    if (!trimmedUsername) {
      setError('Username is required');
      return;
    }

    if (trimmedUsername.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    if (trimmedUsername.length > 20) {
      setError('Username must be less than 20 characters');
      return;
    }

    // Only allow alphanumeric and underscores
    if (!/^[a-z0-9_]+$/.test(trimmedUsername)) {
      setError('Username can only contain letters, numbers, and underscores');
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
        display_name: trimmedDisplayName,
      });

      // Refresh user data to get updated profile
      await refreshUser();
      
      // Clear the requirement flag
      setRequiresUsername(false);
      
      toast.success('Profile created successfully!');
    } catch (err) {
      console.error('Failed to update profile:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to save profile';
      
      // Check for common error cases
      if (errorMessage.toLowerCase().includes('taken') || errorMessage.toLowerCase().includes('exists')) {
        setError('This username is already taken. Please choose another.');
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

  return (
    <Dialog open={requiresUsername} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md border-border/50 bg-background/95 backdrop-blur-xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        hideCloseButton
      >
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <UserCircle className="h-8 w-8 text-primary" />
          </div>
          <DialogTitle className="text-xl">Complete Your Profile</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Choose a username and display name to get started on DeHub.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="username"
                className="pl-8"
                maxLength={20}
                disabled={isSubmitting}
                autoComplete="off"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Letters, numbers, and underscores only. 3-20 characters.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your Name"
              maxLength={50}
              disabled={isSubmitting}
              autoComplete="off"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <Button 
              type="submit" 
              className="w-full"
              disabled={isSubmitting || !username.trim() || !displayName.trim()}
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
              className="w-full text-muted-foreground hover:text-foreground"
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
