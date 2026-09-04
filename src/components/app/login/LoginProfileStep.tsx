/**
 * Profile step — the last step of signing up.
 * ===========================================
 * Username, display name, picture and reading language, for an account that
 * exists but has no profile yet. Mandatory: the sheet holding it refuses to
 * close while `requiresUsername` is true, and the only way out is Log out.
 *
 * This used to be `UsernameRequiredModal`, a centred Radix dialog of its own.
 * Signing up therefore ended with the login drawer sliding away and a second,
 * differently-shaped overlay appearing over the whole viewport. It is a step of
 * the login sheet now, so the whole flow happens in one panel pinned to the
 * middle column.
 *
 * The picture and the language are optional and never gate Continue.
 *
 * @module components/app/login/LoginProfileStep
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2, LogOut, AlertCircle, Check, X, Camera, Globe, ChevronDown } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { updateProfile, checkUsernameAvailability } from '@/lib/api/dehub';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ButtonLoader } from '@/components/app/DeHubLoader';
import { usePendingAction } from '@/hooks/use-pending-action';
import { isReservedUsername } from '@/lib/reserved-usernames';
import { cn } from '@/lib/utils';
import i18n, { SUPPORTED_LANGUAGES, loadLanguage, applyDocumentDirection } from '@/i18n';
import {
  LANGUAGE_STORAGE_KEY,
  applyResolvedLanguage,
  resolveLanguage,
} from '@/lib/user-language-store';

// Debounce helper
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export function LoginProfileStep() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { disconnect, refreshUser, setRequiresUsername, closeLoginModal } = useAuth();
  const prefs = useUserPreferences();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Username availability state
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // Optional picture. Held as a File and uploaded with the profile on Continue,
  // exactly like Settings — one multipart write, no second round trip.
  const [avatarFile, setAvatarFile] = useState<File | undefined>();
  const [avatarPreview, setAvatarPreview] = useState<string | undefined>();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // The language this account will read in. Starts at whatever the device
  // already resolved (browser, or a previous visit), so the field shows the
  // truth rather than defaulting everyone to English.
  const [language, setLanguage] = useState(resolveLanguage);

  const debouncedUsername = useDebounce(username, 500);

  // Check username availability
  const checkUsername = useCallback(async (usernameToCheck: string) => {
    // No minimum length. The API has never had one — 43 accounts already hold
    // names shorter than three characters — and short handles are wanted.
    if (!usernameToCheck) {
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

    if (isReservedUsername(usernameToCheck)) {
      setUsernameAvailable(false);
      setUsernameError('This username is reserved');
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

  // Revoke the last blob: preview when it is replaced or the step goes away.
  // Re-picking a picture a few times otherwise leaks one object URL per pick.
  useEffect(() => () => {
    if (avatarPreview?.startsWith('blob:')) {
      try { URL.revokeObjectURL(avatarPreview); } catch { /* noop */ }
    }
  }, [avatarPreview]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('settings.imageTooLarge5'));
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  /**
   * Switch language in place — no reload.
   *
   * Settings can afford `window.location.reload()` because nothing is being
   * typed. Here a reload would tear down a half-filled form and hand the user
   * back an empty one, so the switch is done the way the preferences bridge
   * does it: load the bundle, tell i18next, and retarget everything already
   * reading the resolved language.
   */
  const handleLanguageChange = useCallback(async (lang: string) => {
    const ok = await loadLanguage(lang);
    if (!ok) {
      toast.error('Could not load language. Please try again.');
      return;
    }
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, lang); } catch { /* private mode */ }
    setLanguage(lang);
    applyResolvedLanguage(lang);
    applyDocumentDirection(lang);
    document.documentElement.lang = lang;
    if (i18n.language !== lang) await i18n.changeLanguage(lang);
    // Follows the account, not just this browser. Fire and forget: the choice
    // is already applied locally and localStorage carries it either way.
    prefs?.setPref('language', lang);
  }, [prefs]);

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

    if (trimmedUsername.length > 30) {
      setError('Username must be 30 characters or less');
      return;
    }

    // Hyphens included: the API has always accepted them, and rejecting them
    // here made the two sides disagree about which names are even legal.
    if (!/^[a-z0-9_-]+$/.test(trimmedUsername)) {
      setError('Username can only contain letters, numbers, hyphens and underscores');
      return;
    }

    if (isReservedUsername(trimmedUsername)) {
      setError('This username is reserved');
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
        ...(avatarFile ? { avatarImg: avatarFile } : {}),
      });

      // Write the language choice to the account for good, now that there is an
      // account to write it to. Awaited so it cannot be lost to the navigate
      // below; a failure here must not fail a created profile.
      try {
        await prefs?.flushPref('language', language);
      } catch { /* the device already has it */ }

      // Refresh user data in auth context
      await refreshUser();

      // Invalidate profile queries to refresh profile page
      await queryClient.invalidateQueries({ queryKey: ['dehub-profile'] });
      await queryClient.invalidateQueries({ queryKey: ['dehub-user-content'] });
      if (avatarFile) {
        await queryClient.invalidateQueries({ queryKey: ['profile-avatar'] });
      }

      // Drops the sheet's hold and closes it: the step is only mandatory while
      // there is no profile.
      setRequiresUsername(false);
      closeLoginModal();

      // Navigate to home feed if not already there (avoid staying on settings
      // after profile creation).
      //
      // Router navigate, NOT window.location.href: this fires seconds after a
      // brand-new account set its wallet password, and a document navigation
      // tears down the whole JS context. That used to drop the just-unlocked
      // key, so the first post — a couple of minutes later — asked for the
      // password all over again. Nothing here needs a full page load.
      if (window.location.pathname !== '/app') {
        navigate('/app');
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
      toast.success(t('settings.loggedOut'));
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      // `disconnect()` tears the session down but does not touch this flag, so
      // logging out here used to leave the mandatory profile step on screen for
      // an account that no longer existed on this device. Cleared last, and in
      // a finally: the sheet must come down even if the sign-out threw.
      setRequiresUsername(false);
      closeLoginModal();
    }
  };

  // Disconnecting is a session teardown plus a network hop; without this the
  // button sat inert long enough to read as a missed tap.
  const { pending: isLoggingOut, run: runLogout } = usePendingAction(handleLogout);
  const canSubmit = username.trim().length >= 1 &&
                    displayName.trim().length > 0 &&
                    usernameAvailable === true &&
                    !isCheckingUsername;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="signup-username" className="text-white/70">{t('settings.username')}</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">@</span>
          <Input
            id="signup-username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder={t('settings.usernamePlaceholder')}
            className={cn(
              "h-12 pl-8 pr-10 bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl",
              usernameAvailable === true && "border-green-500/50",
              usernameAvailable === false && "border-red-500/50",
            )}
            maxLength={30}
            disabled={isSubmitting}
            autoComplete="off"
            autoFocus
          />
          {/* Status indicator */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {isCheckingUsername && (
              <Loader2 className="h-4 w-4 animate-spin text-white/50" />
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
          <p className="text-xs text-green-400">{t('profile.usernameAvailable')}</p>
        ) : (
          <p className="text-xs text-white/40">
            Letters, numbers, hyphens and underscores. Up to 30 characters.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-display-name" className="text-white/70">{t('settings.displayName')}</Label>
        <Input
          id="signup-display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t('settings.enterDisplayName')}
          className="h-12 bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl"
          maxLength={50}
          disabled={isSubmitting}
          autoComplete="off"
        />
      </div>

      {/* Picture — optional, and deliberately not part of canSubmit. */}
      <div className="space-y-2">
        <Label className="text-white/70">{t('settings.profilePicture')}</Label>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar className="h-16 w-16 rounded-full border border-white/10">
              <AvatarImage src={avatarPreview} className="object-cover" />
              <AvatarFallback className="bg-white/10 text-lg font-medium text-white">
                {displayName.trim()[0]?.toUpperCase() || username.trim()[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={isSubmitting}
              aria-label={t('settings.clickCameraUpload')}
              className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border border-white/10 bg-zinc-800 transition-colors hover:bg-zinc-700 disabled:opacity-50"
            >
              <Camera className="h-3.5 w-3.5 text-white" />
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <p className="text-xs text-white/40">{t('settings.clickCameraUpload')}</p>
        </div>
      </div>

      <LanguageField
        value={language}
        onChange={handleLanguageChange}
        disabled={isSubmitting}
      />

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-xl">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col gap-2 pt-2">
        <Button
          type="submit"
          className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
          disabled={isSubmitting || !canSubmit}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            t('loginModal.continue')
          )}
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="w-full text-white/50 hover:text-white hover:bg-white/10 rounded-xl"
          onClick={() => void runLogout()}
          disabled={isSubmitting || isLoggingOut}
          aria-busy={isLoggingOut || undefined}
        >
          {isLoggingOut ? <ButtonLoader className="mr-2" /> : <LogOut className="mr-2 h-4 w-4" />}
          {t('settings.logOut')}
        </Button>
      </div>
    </form>
  );
}

/**
 * The language field, expanded in place rather than in a drawer of its own.
 *
 * Settings uses `SettingDrawerSelect`, which portals a vaul drawer. Nesting one
 * inside the login sheet means two vaul roots fighting over the same focus trap
 * and body pointer-events, on the one screen a new account cannot escape. An
 * inline panel has none of that and costs nothing — the sheet already scrolls.
 */
function LanguageField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (lang: string) => void | Promise<void>;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const current = SUPPORTED_LANGUAGES.find((l) => l.code === value);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return SUPPORTED_LANGUAGES;
    return SUPPORTED_LANGUAGES.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q),
    );
  }, [search]);

  return (
    <div className="space-y-2">
      <Label className="text-white/70">{t('settings.language')}</Label>
      <button
        type="button"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setOpen((v) => !v);
          setSearch('');
        }}
        className="flex h-12 w-full items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 text-left text-sm text-white transition-colors hover:bg-white/[0.14] disabled:opacity-50"
      >
        <Globe className="h-4 w-4 shrink-0 text-white/50" aria-hidden="true" />
        <span className="flex-1 truncate">{current?.nativeName || value}</span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-white/40 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="rounded-xl border border-white/10 bg-black/40 p-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('settings.language')}
            className="h-10 bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-lg"
            autoComplete="off"
          />
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto overscroll-contain">
            {filtered.map((lang) => (
              <button
                key={lang.code}
                type="button"
                aria-pressed={lang.code === value}
                onClick={() => {
                  setOpen(false);
                  setSearch('');
                  if (lang.code !== value) void onChange(lang.code);
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                  lang.code === value ? 'bg-white/10' : 'hover:bg-white/5',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-white">{lang.nativeName}</span>
                  <span className="block truncate text-xs text-white/40">{lang.name}</span>
                </span>
                {lang.code === value ? (
                  <Check className="h-4 w-4 shrink-0 text-white" aria-hidden="true" />
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-white/40">{t('settings.languageDesc')}</p>
      )}
    </div>
  );
}

export default LoginProfileStep;
