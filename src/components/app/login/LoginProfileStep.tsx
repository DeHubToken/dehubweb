import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
/**
 * Welcome flow — the last part of signing up.
 * ===========================================
 * One question per screen for an account that exists but has no profile yet:
 * name (with reading language), @username, photo, interests, people to follow,
 * then the finished card. The profile card at the top fills in live as each
 * answer is given, so people see what each answer is for.
 *
 * Mandatory until the profile is written: the flow cannot be closed while
 * `requiresUsername` is true, and the only way out before then is Log out.
 * The profile (name, @, photo, language) is written in ONE request when the
 * photo step is left, as before. Interests and follows come after, against a
 * real account, and are skippable. `requiresUsername` is only cleared on the
 * last screen, so the flow stays up until "Enter DeHub".
 *
 * Interests are saved as the `feedInterests` preference and put first in
 * every category bar (lib/feed-interests).
 *
 * Rendered full screen by LoginModal rather than inside the sign-in sheet.
 *
 * @module components/app/login/LoginProfileStep
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2, AlertCircle, Globe, ChevronDown } from "lucide-react";
import LogOut from "@/components/ui/cut-icons/sign-out";
import Check from "@/components/ui/cut-icons/check";
import Camera from "@/components/ui/cut-icons/camera";

import X from "@/components/ui/cut-icons/close";


import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';
import { updateProfile, checkUsernameAvailability, getRankedSuggestions, followUser, unfollowUser } from '@/lib/api/dehub';
import { buildAvatarUrl, deviceWidth } from '@/lib/media-url';
import { formatCount } from '@/lib/feed-utils';
import { getDefaultBanner } from '@/components/app/profile/ProfileConstants';
import { useAppTheme } from '@/contexts/ThemeContext';
import { ThemePreviewCard, THEME_SWATCHES } from '@/components/app/settings/ThemePreviewCard';
import { INTEREST_TOPICS, FEED_INTERESTS_PREF, setFeedInterests, topicCover } from '@/lib/feed-interests';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ButtonLoader } from '@/components/app/DeHubLoader';
import { usePendingAction } from '@/hooks/use-pending-action';
import { isReservedUsername } from '@/lib/reserved-usernames';
import { cn } from '@/lib/utils';
import { createLogger } from '@/lib/logger';
import { clearAuthTrace } from '@/lib/auth-trace';
import { markAvatarPromptSignupSession } from '@/lib/avatar-prompt';

const signupLog = createLogger('LoginProfileStep');
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

type WelcomeStep = 'about' | 'name' | 'username' | 'photo' | 'interests' | 'people' | 'done';
const STEPS: WelcomeStep[] = ['about', 'name', 'username', 'photo', 'interests', 'people', 'done'];
/** Store rules: nobody under 13 holds an account. Under 18 starts with mature content off. */
const MIN_AGE = 13;
const ADULT_AGE = 18;
const THEME_CHOICES = Object.keys(THEME_SWATCHES);
const themeLabelKey = (value: string) => `settings.${value.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())}`;

/** Whole years between a birth date and today. */
export function ageOn(birth: { y: number; m: number; d: number }, today = new Date()): number {
  let age = today.getFullYear() - birth.y;
  if (today.getMonth() + 1 < birth.m || (today.getMonth() + 1 === birth.m && today.getDate() < birth.d)) age -= 1;
  return age;
}
const MIN_INTERESTS = 3;

/** Cap the people step: enough to fill a phone screen, few enough to scan. */
const PEOPLE_LIMIT = 8;

export function LoginProfileStep() {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { disconnect, refreshUser, setRequiresUsername, closeLoginModal, walletAddress } = useAuth();
  const prefs = useUserPreferences();

  const [step, setStepRaw] = useState<WelcomeStep>('about');
  const stepIndex = STEPS.indexOf(step);
  // Which way the last move went, so the next screen slides in from the side
  // it is coming from.
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const stepRef = useRef(step);
  stepRef.current = step;
  const setStep = useCallback((to: WelcomeStep) => {
    setDir(STEPS.indexOf(to) >= STEPS.indexOf(stepRef.current) ? 'fwd' : 'back');
    setStepRaw(to);
  }, []);
  const { themeChoice, setTheme } = useAppTheme();

  // Bring the current look into view in the theme strip, so it reads as picked.
  const themesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (step !== 'about') return;
    themesRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [step]);

  const [birth, setBirth] = useState<{ y: string; m: string; d: string }>({ y: '', m: '', d: '' });
  const birthDate = birth.y && birth.m && birth.d ? { y: Number(birth.y), m: Number(birth.m), d: Number(birth.d) } : null;
  const birthValid = !!birthDate && new Date(birthDate.y, birthDate.m - 1, birthDate.d).getDate() === birthDate.d;
  const age = birthValid && birthDate ? ageOn(birthDate) : null;
  // Set once the profile is written (after the photo step). From then on there
  // is an account behind the flow, so Log out goes away and Back stops at the
  // interests step: the name and @ are saved and edited in Settings.
  const [saved, setSaved] = useState(false);

  const [username, setUsername] = useSurfaceDraft("src/components/app/login/LoginProfileStep.tsx:username", '');
  const [displayName, setDisplayName] = useSurfaceDraft("src/components/app/login/LoginProfileStep.tsx:displayName", '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from the name Apple or Google already gave us (Apple sends it only
  // on the first authorization). Never overwrites typing, and the field stays
  // optional when there is none.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      const md = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const raw = md.full_name ?? md.name;
      const name = typeof raw === 'string' ? raw.trim().slice(0, 50).trim() : '';
      if (!cancelled && name) setDisplayName((current) => current || name);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Username availability state
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // Optional picture. Held as a File and uploaded with the profile, exactly
  // like Settings — one multipart write, no second round trip.
  const [avatarFile, setAvatarFile] = useState<File | undefined>();
  const [avatarPreview, setAvatarPreview] = useState<string | undefined>();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // The language this account will read in. Starts at whatever the device
  // already resolved (browser, or a previous visit), so the field shows the
  // truth rather than defaulting everyone to English.
  const [language, setLanguage] = useState(resolveLanguage);

  const [interests, setInterests] = useState<string[]>([]);
  const [followed, setFollowed] = useState<Set<string>>(() => new Set());

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
      setUsernameError(_copy("copy.6cfdbd27009d", { defaultValue: "Username must be 30 characters or less" }));
      return;
    }

    if (!/^[a-z0-9_]+$/.test(usernameToCheck)) {
      setUsernameAvailable(false);
      setUsernameError(_copy("copy.ec63b97d594b", { defaultValue: "Only letters, numbers, and underscores allowed" }));
      return;
    }

    if (isReservedUsername(usernameToCheck)) {
      setUsernameAvailable(false);
      setUsernameError(_copy("copy.71bfd7fdb453", { defaultValue: "This username is reserved" }));
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
        setUsernameError(_copy("copy.34141f3f22aa", { defaultValue: "Username is already taken" }));
      }
    } catch (err) {
      console.error('Username check failed:', err);
      const errorMessage = err instanceof Error ? err.message : _copy("copy.c8e20022262b", { defaultValue: "Failed to check username" });
      setUsernameAvailable(false);
      setUsernameError(errorMessage);
    } finally {
      setIsCheckingUsername(false);
    }
  }, [_copy]);

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
   * typed. Here a reload would tear down a half-filled flow and hand the user
   * back an empty one, so the switch is done the way the preferences bridge
   * does it: load the bundle, tell i18next, and retarget everything already
   * reading the resolved language.
   */
  const handleLanguageChange = useCallback(async (lang: string) => {
    const ok = await loadLanguage(lang);
    if (!ok) {
      toast.error(_copy("copy.51af2182291a", { defaultValue: "Could not load language. Please try again." }));
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
  }, [prefs, _copy]);

  const trimmedUsername = username.trim().toLowerCase();
  const trimmedDisplayName = displayName.trim();

  /** Same rules as before the flow was split into steps; returns the problem or null. */
  const usernameProblem = (): string | null => {
    if (!trimmedUsername) return _copy("copy.d18de1563a61", { defaultValue: "Username is required" });
    if (trimmedUsername.length > 30) return _copy("copy.6cfdbd27009d", { defaultValue: "Username must be 30 characters or less" });
    // Hyphens included: the API has always accepted them, and rejecting them
    // here made the two sides disagree about which names are even legal.
    if (!/^[a-z0-9_-]+$/.test(trimmedUsername)) return _copy("copy.ef9ec9824090", { defaultValue: "Username can only contain letters, numbers, hyphens and underscores" });
    if (isReservedUsername(trimmedUsername)) return _copy("copy.71bfd7fdb453", { defaultValue: "This username is reserved" });
    if (!usernameAvailable) return _copy("copy.394c42f9308f", { defaultValue: "Please choose an available username" });
    return null;
  };

  /** Writes the profile. Runs when the photo step is left, with or without a photo. */
  const saveProfile = async (): Promise<boolean> => {
    signupLog.trace?.('profile-save-start');
    setError(null);
    const problem = usernameProblem();
    if (problem) {
      setError(problem);
      setStep('username');
      return false;
    }
    if (trimmedDisplayName.length > 50) {
      setError(_copy("copy.b84576d9462b", { defaultValue: "Display name must be less than 50 characters" }));
      setStep('name');
      return false;
    }

    setIsSubmitting(true);
    try {
      await updateProfile({
        username: trimmedUsername,
        // Optional: left blank, the username stands in.
        displayName: trimmedDisplayName || trimmedUsername,
        ...(avatarFile ? { avatarImg: avatarFile } : {}),
        ...(age !== null && age < ADULT_AGE ? { showMatureContent: false } : {}),
      });

      // Kept private to the account (wallet-scoped preferences), never on the
      // public profile. Read for age-based defaults.
      if (birthDate) {
        const iso = `${birthDate.y}-${String(birthDate.m).padStart(2, '0')}-${String(birthDate.d).padStart(2, '0')}`;
        try { await prefs?.flushPref('birthDate', iso); } catch { /* retried with the next preference write */ }
      }

      // Write the language choice to the account for good, now that there is an
      // account to write it to. A failure here must not fail a created profile.
      try {
        await prefs?.flushPref('language', language);
      } catch { /* the device already has it */ }

      await refreshUser();
      await queryClient.invalidateQueries({ queryKey: ['dehub-profile'] });
      await queryClient.invalidateQueries({ queryKey: ['dehub-user-content'] });
      if (avatarFile) {
        await queryClient.invalidateQueries({ queryKey: ['profile-avatar'] });
      }
      // This open already offered a photo step; the reminder waits for the next.
      markAvatarPromptSignupSession();
      signupLog.trace?.('signup-complete');
      clearAuthTrace();
      setSaved(true);
      return true;
    } catch (err) {
      console.error('Failed to update profile:', err);
      signupLog.trace?.('profile-save-error', { reason: err instanceof Error ? err.message : String(err) });
      const errorMessage = err instanceof Error ? err.message : _copy("copy.b689d74cef45", { defaultValue: "Failed to save profile" });
      if (errorMessage.toLowerCase().includes('taken') || errorMessage.toLowerCase().includes('exists')) {
        setError(_copy("copy.1c8d76a789fd", { defaultValue: "This username is already taken. Please choose another." }));
        setUsernameAvailable(false);
        setStep('username');
      } else {
        setError(errorMessage);
      }
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // People to follow, fetched once the profile exists (the endpoint needs it)
  // and before the step opens, so the list is there when it slides in.
  const { data: people = [], isLoading: peopleLoading } = useQuery({
    queryKey: ['welcome-people', walletAddress],
    queryFn: async () => (await getRankedSuggestions('active', null, PEOPLE_LIMIT)).items,
    enabled: saved,
    staleTime: 5 * 60_000,
  });

  const toggleFollow = (address: string) => {
    const following = followed.has(address);
    setFollowed((prev) => {
      const next = new Set(prev);
      if (following) next.delete(address); else next.add(address);
      return next;
    });
    const call = following ? unfollowUser(address) : followUser(address);
    call.catch(() => {
      // Put the button back the way it was so it never claims a follow that failed.
      setFollowed((prev) => {
        const next = new Set(prev);
        if (following) next.add(address); else next.delete(address);
        return next;
      });
      toast.error(_copy('welcome.followFailed', { defaultValue: 'Could not follow. Try again.' }));
    });
  };

  const toggleInterest = (id: string) => {
    setInterests((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const finish = () => {
    void queryClient.invalidateQueries({ queryKey: ['dehub-following'] });
    // Drops the sheet's hold: the flow is only mandatory while there is no profile.
    setRequiresUsername(false);
    closeLoginModal();
    // Router navigate, NOT window.location.href: this fires a minute after a
    // brand-new account set its wallet password, and a document navigation
    // tears down the whole JS context. That used to drop the just-unlocked
    // key, so the first post asked for the password all over again.
    if (window.location.pathname !== '/app') navigate('/app');
  };

  const next = async () => {
    setError(null);
    if (step === 'about') {
      if (!birthValid || age === null || age < 0) {
        setError(_copy('welcome.about.invalid', { defaultValue: 'Enter your full date of birth.' }));
        return;
      }
      if (age < MIN_AGE) {
        setError(_copy('welcome.about.tooYoung', { defaultValue: 'You need to be {{age}} or older to use DeHub.', age: MIN_AGE }));
        return;
      }
      setStep('name');
    } else if (step === 'name') {
      if (trimmedDisplayName.length > 50) {
        setError(_copy("copy.b84576d9462b", { defaultValue: "Display name must be less than 50 characters" }));
        return;
      }
      setStep('username');
    } else if (step === 'username') {
      const problem = usernameProblem();
      if (problem) { setError(problem); return; }
      setStep('photo');
    } else if (step === 'photo') {
      if (saved || await saveProfile()) setStep('interests');
    } else if (step === 'interests') {
      const value = setFeedInterests(interests);
      // Saved now rather than debounced: the next screen is a few taps from
      // the feed that reads it.
      void prefs?.flushPref(FEED_INTERESTS_PREF, value).catch(() => {});
      await queryClient.invalidateQueries({ queryKey: ['dehub-categories'] });
      setStep('people');
    } else if (step === 'people') {
      setStep('done');
    } else {
      finish();
    }
  };

  const back = () => {
    setError(null);
    const floor = saved ? STEPS.indexOf('interests') : 0;
    if (stepIndex > floor) setStep(STEPS[stepIndex - 1]);
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
      // a finally: the flow must come down even if the sign-out threw.
      setRequiresUsername(false);
      closeLoginModal();
    }
  };

  // Disconnecting is a session teardown plus a network hop; without this the
  // button sat inert long enough to read as a missed tap.
  const { pending: isLoggingOut, run: runLogout } = usePendingAction(handleLogout);

  const canContinue =
    step === 'about' ? birthValid
    : step === 'username' ? usernameAvailable === true && !isCheckingUsername && !!trimmedUsername
    : step === 'interests' ? interests.length >= MIN_INTERESTS
    : !isSubmitting;

  const card = {
    name: trimmedDisplayName || (step === 'name' ? '' : trimmedUsername),
    username: trimmedUsername,
    avatar: avatarPreview,
    banner: getDefaultBanner(walletAddress ?? undefined),
    interests: STEPS.indexOf(step) >= STEPS.indexOf('interests') ? interests : [],
    following: followed.size,
    typing: step === 'name' ? 'name' as const : step === 'username' ? 'username' as const : null,
  };

  const title = {
    about: _copy('welcome.about.title', { defaultValue: 'Welcome to DeHub' }),
    name: _copy('welcome.name.title', { defaultValue: 'Your name' }),
    username: _copy('welcome.username.title', { defaultValue: 'Your @username' }),
    photo: _copy('welcome.photo.title', { defaultValue: 'Your photo' }),
    interests: _copy('welcome.interests.title', { defaultValue: 'Your interests' }),
    people: _copy('welcome.people.title', { defaultValue: 'Your people' }),
    done: _copy('welcome.done.title', { defaultValue: 'Looking good, {{name}}', name: card.name || trimmedUsername }),
  }[step];

  const subtitle = {
    about: _copy('welcome.about.sub', { defaultValue: 'Your birthday stays private. Pick a look, you can change it any time.' }),
    name: _copy('welcome.name.sub', { defaultValue: 'This is the name people see on your posts.' }),
    username: _copy('welcome.username.sub', { defaultValue: 'Letters, numbers and underscores. You can change it later.' }),
    photo: _copy('welcome.photo.sub', { defaultValue: 'Optional. People follow faces faster.' }),
    interests: _copy('welcome.interests.sub', { defaultValue: 'Pick at least 3. They go first in your categories.' }),
    people: _copy('welcome.people.sub', { defaultValue: 'Tap to follow. Their posts fill your Following feed.' }),
    done: _copy('welcome.done.sub', { defaultValue: 'Everyone sees this card from today.' }),
  }[step];

  const ctaLabel = step === 'done'
    ? _copy('welcome.enter', { defaultValue: 'Enter DeHub' })
    : step === 'photo' && !avatarFile && !saved
    ? _copy('welcome.skipPhoto', { defaultValue: 'Skip for now' })
    : step === 'interests' && interests.length < MIN_INTERESTS
    ? _copy('welcome.pickMore', { defaultValue: 'Pick {{count}} more', count: MIN_INTERESTS - interests.length })
    : t('loginModal.continue');

  const months = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString(i18n.language || undefined, { month: 'long' }));
  const thisYear = new Date().getFullYear();
  const selectClass = 'h-14 w-full appearance-none rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-[17px] font-semibold text-white outline-none focus:border-white/40';

  const body = (
    <>
      {step === 'about' && (
        <div className="space-y-6">
          <div>
            <p className="mb-2 text-[13px] font-medium text-white/60">{_copy('welcome.about.birthday', { defaultValue: 'Date of birth' })}</p>
            <div className="grid grid-cols-[1.4fr_0.8fr_1fr] gap-2">
              <select id="welcome-birth-month" aria-label={_copy('welcome.about.month', { defaultValue: 'Month' })} value={birth.m} onChange={(e) => setBirth((b) => ({ ...b, m: e.target.value }))} className={selectClass}>
                <option value="" disabled>{_copy('welcome.about.month', { defaultValue: 'Month' })}</option>
                {months.map((label, i) => <option key={label} value={String(i + 1)}>{label}</option>)}
              </select>
              <select id="welcome-birth-day" aria-label={_copy('welcome.about.day', { defaultValue: 'Day' })} value={birth.d} onChange={(e) => setBirth((b) => ({ ...b, d: e.target.value }))} className={selectClass}>
                <option value="" disabled>{_copy('welcome.about.day', { defaultValue: 'Day' })}</option>
                {Array.from({ length: 31 }, (_, i) => <option key={i} value={String(i + 1)}>{i + 1}</option>)}
              </select>
              <select id="welcome-birth-year" aria-label={_copy('welcome.about.year', { defaultValue: 'Year' })} value={birth.y} onChange={(e) => setBirth((b) => ({ ...b, y: e.target.value }))} className={selectClass}>
                <option value="" disabled>{_copy('welcome.about.year', { defaultValue: 'Year' })}</option>
                {Array.from({ length: 110 }, (_, i) => thisYear - i).map((y) => <option key={y} value={String(y)}>{y}</option>)}
              </select>
            </div>
          </div>
          <div>
            <p className="mb-2 text-[13px] font-medium text-white/60">{_copy('welcome.about.theme', { defaultValue: 'Your look' })}</p>
            <div ref={themesRef} data-welcome-themes className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2 scrollbar-hide lg:mx-0 lg:px-0">
              {THEME_CHOICES.map((value) => (
                <ThemePreviewCard
                  key={value}
                  value={value}
                  label={t(themeLabelKey(value), value)}
                  active={themeChoice === value}
                  available
                  onSelect={() => setTheme(value)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 'name' && (
        <div className="space-y-4">
          <Input
            id="signup-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void next(); } }}
            placeholder={_copy('welcome.name.placeholder', { defaultValue: 'Your name' })}
            className="h-14 rounded-2xl border-white/15 bg-white/[0.06] px-4 text-[20px] font-semibold text-white placeholder:font-medium placeholder:!text-white/30"
            maxLength={50}
            autoComplete="name"
            autoFocus
          />
          <LanguageField value={language} onChange={handleLanguageChange} disabled={isSubmitting} />
        </div>
      )}

      {step === 'username' && (
        <div className="space-y-2">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[20px] font-semibold text-white/40">@</span>
            <Input
              id="signup-username"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (canContinue) void next(); } }}
              placeholder={t('settings.usernamePlaceholder')}
              className={cn(
                "h-14 rounded-2xl border-white/15 bg-white/[0.06] pl-10 pr-12 text-[20px] font-semibold text-white placeholder:font-medium placeholder:!text-white/30",
                usernameAvailable === true && "border-emerald-400/60",
                usernameAvailable === false && "border-red-500/50",
              )}
              maxLength={30}
              autoComplete="off"
              autoCapitalize="none"
              autoFocus
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              {isCheckingUsername && <Loader2 className="h-5 w-5 animate-spin text-white/50" />}
              {!isCheckingUsername && usernameAvailable === true && <Check className="h-5 w-5 text-emerald-400" />}
              {!isCheckingUsername && usernameAvailable === false && <X className="h-5 w-5 text-red-500" />}
            </div>
          </div>
          {usernameError ? (
            <p className="text-[13px] text-red-400">{usernameError}</p>
          ) : usernameAvailable === true ? (
            <p className="text-[13px] text-emerald-400">{_copy('welcome.username.yours', { defaultValue: '@{{name}} is yours', name: trimmedUsername })}</p>
          ) : null}
        </div>
      )}

      {step === 'photo' && (
        <div className="flex gap-3">
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} disabled={saved} />
          <button
            type="button"
            data-welcome-ghost
            disabled={saved}
            onClick={() => avatarInputRef.current?.click()}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.07] text-[15px] font-medium text-white backdrop-blur-xl disabled:opacity-50"
          >
            <Camera className="h-4 w-4" />
            {avatarFile ? _copy('welcome.photo.change', { defaultValue: 'Choose another' }) : _copy('welcome.photo.choose', { defaultValue: 'Choose a photo' })}
          </button>
        </div>
      )}

      {step === 'interests' && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={title}>
          {INTEREST_TOPICS.map((topic) => {
            const on = interests.includes(topic.id);
            return (
              <button
                key={topic.id}
                type="button"
                aria-pressed={on}
                data-welcome-chip={on ? 'on' : undefined}
                data-keep-white={on ? '' : undefined}
                onClick={() => toggleInterest(topic.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[14px] font-medium capitalize transition-colors',
                  on ? 'border-white bg-white text-black' : 'border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.1]',
                )}
              >
                {on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                {_copy(`welcome.topic.${topic.id}`, { defaultValue: topic.id })}
              </button>
            );
          })}
        </div>
      )}

      {step === 'people' && (
        <div className="space-y-2">
          {peopleLoading && Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-[68px] animate-pulse rounded-2xl bg-white/[0.06]" />
          ))}
          {!peopleLoading && people.length === 0 && (
            <p className="text-[14px] text-white/55">{_copy('welcome.people.empty', { defaultValue: 'No suggestions right now. Explore has more people to find.' })}</p>
          )}
          {people.map((person) => {
            const on = followed.has(person.address);
            const avatarPath = person.avatarImageUrl || person.avatarUrl;
            const avatar = avatarPath ? buildAvatarUrl(person.address, avatarPath, deviceWidth(44)) : undefined;
            const name = person.displayName || person.username || `${person.address.slice(0, 6)}…`;
            return (
              <div key={person.address} data-page-bento className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-3">
                <Avatar className="h-11 w-11">
                  {avatar && <AvatarImage src={avatar} alt="" className="object-cover" />}
                  <AvatarFallback className="text-sm font-semibold">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-white">{name}</p>
                  <p className="truncate text-[12px] text-white/55">
                    {person.username ? `@${person.username}` : ''}
                    {person.followers ? ` · ${_copy('welcome.people.followers', { defaultValue: '{{count}} followers', count: formatCount(person.followers) as unknown as number })}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleFollow(person.address)}
                  data-welcome-cta={on ? undefined : ''}
                  data-keep-white={on ? undefined : ''}
                  className={cn(
                    'shrink-0 rounded-full px-4 py-1.5 text-[13px] font-semibold',
                    on && 'border border-white/20 text-white/80',
                  )}
                >
                  {on ? t('profile.following', 'Following') : t('profile.follow', 'Follow')}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </>
  );

  const dots = (
    <div className="flex gap-1.5" aria-hidden="true">
      {STEPS.slice(0, -1).map((s, i) => (
        <span key={s} data-welcome-dot={i === stepIndex ? 'on' : undefined} className={cn('h-1.5 rounded-full transition-all', i === stepIndex ? 'w-5 bg-white' : i < stepIndex ? 'w-1.5 bg-white/60' : 'w-1.5 bg-white/25')} />
      ))}
    </div>
  );

  const showBack = step !== 'done' && stepIndex > (saved ? STEPS.indexOf('interests') : 0);
  const buttons = (
    <div className="flex gap-3">
      {showBack && (
        <button type="button" data-welcome-ghost onClick={back} disabled={isSubmitting} className="h-12 flex-1 rounded-full border border-white/15 bg-white/[0.07] text-[15px] font-medium text-white backdrop-blur-xl">
          {_copy('welcome.back', { defaultValue: 'Back' })}
        </button>
      )}
      <button
        type="button"
        data-welcome-cta
        data-keep-white
        data-off={canContinue ? undefined : ''}
        disabled={!canContinue || isSubmitting}
        onClick={() => void next()}
        className="flex h-12 flex-1 items-center justify-center rounded-full text-[15px] font-semibold"
      >
        {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : ctaLabel}
      </button>
    </div>
  );

  const logout = !saved && (
    <button
      type="button"
      onClick={() => void runLogout()}
      disabled={isSubmitting || isLoggingOut}
      aria-busy={isLoggingOut || undefined}
      className="flex items-center gap-1.5 text-[13px] text-white/50 hover:text-white"
    >
      {isLoggingOut ? <ButtonLoader /> : <LogOut className="h-4 w-4" />}
      {t('settings.logOut')}
    </button>
  );

  if (step === 'done') {
    return (
      <div data-welcome-step="done" data-welcome-body data-dir="fwd" className="flex flex-1 flex-col items-center justify-center px-5 py-10">
        <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-emerald-400">{_copy('welcome.done.eyebrow', { defaultValue: 'Profile live' })}</p>
        <div className="w-full max-w-[400px]"><WelcomeCard {...card} preview={false} /></div>
        <h1 className="mt-6 text-center text-[28px] font-bold text-white">{title}</h1>
        <p className="mt-1 text-center text-[14px] text-white/55">{subtitle}</p>
        <div className="mt-8 w-full max-w-[400px]">{buttons}</div>
      </div>
    );
  }

  return (
    <div data-welcome-step={step} className="flex flex-1 flex-col lg:flex-row lg:items-center lg:justify-center lg:gap-16 lg:px-10">
      <div className="px-4 pt-3 lg:flex lg:w-[400px] lg:flex-col lg:items-center lg:gap-4 lg:p-0">
        <WelcomeCard {...card} preview />
        <p className="hidden text-[13px] text-white/45 lg:block">{_copy('welcome.cardHint', { defaultValue: 'This is how people will see you' })}</p>
      </div>
      <div className="flex justify-center pt-3 lg:hidden">{dots}</div>
      <div className="flex flex-1 flex-col px-5 pt-5 lg:w-[440px] lg:flex-none lg:p-0">
        <div className="mb-6 hidden lg:block">{dots}</div>
        <div key={step} data-welcome-body data-dir={dir} className="min-h-0">
          <h1 className="text-[26px] font-bold leading-tight text-white lg:text-[34px]">{title}</h1>
          <p className="mb-5 mt-1 text-[14px] text-white/55">{subtitle}</p>
          {body}
        </div>
        <div className="mt-auto pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-6 lg:mt-8 lg:pb-0">
          {buttons}
          {logout && <div className="mt-4 flex justify-center">{logout}</div>}
        </div>
      </div>
    </div>
  );
}

/**
 * The profile card that fills in as the flow is answered: name and @ while
 * they are typed, the photo, then the picked topics' artwork as the banner and
 * the follow count. It is the card the profile page will show.
 */
export function WelcomeCard({
  name, username, avatar, banner, interests, following, typing, preview,
}: {
  name: string;
  username: string;
  avatar?: string;
  banner: string;
  interests: string[];
  following: number;
  typing: 'name' | 'username' | null;
  preview: boolean;
}) {
  const { t: _copy } = _useCopy();
  const covers = interests.map((id) => ({ id, cover: topicCover(id) })).slice(0, 4);
  const initial = (name || username || '?').slice(0, 1).toUpperCase();
  return (
    <div data-welcome-card data-page-bento className="relative w-full overflow-hidden rounded-[28px] border border-white/12 bg-white/[0.06] backdrop-blur-xl">
      <div className="relative h-24 overflow-hidden" data-media-scrim>
        {covers.length ? (
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${covers.length}, minmax(0, 1fr))` }}>
            {covers.map((c) => c.cover
              ? <img key={c.id} data-welcome-pop src={c.cover} alt="" className="h-full w-full object-cover" />
              : <span key={c.id} data-welcome-pop className="grid h-full w-full place-items-center bg-white/10 text-[12px] font-semibold capitalize text-white/80">{_copy(`welcome.topic.${c.id}`, { defaultValue: c.id })}</span>)}
          </div>
        ) : (
          <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
        )}
      </div>
      <div className="relative z-10 px-5 pb-5">
        <div className="-mt-10 mb-2 flex items-end justify-between">
          {avatar
            ? <img key={avatar} data-welcome-pop src={avatar} alt="" className="h-20 w-20 rounded-full object-cover ring-4 ring-black/60" />
            : <div className="grid h-20 w-20 place-items-center rounded-full bg-zinc-800 text-[28px] font-bold text-white/70 ring-4 ring-black/60">{initial}</div>}
          {preview && <span className="mb-1 rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/60">{_copy('welcome.preview', { defaultValue: 'Preview' })}</span>}
        </div>
        <p className="min-h-[30px] truncate text-[22px] font-bold text-white">
          {name || <span className="text-white/30">{_copy('welcome.card.name', { defaultValue: 'Your name' })}</span>}
          {typing === 'name' && <span data-welcome-caret className="ml-0.5 inline-block h-5 w-[2px] translate-y-0.5 bg-white" />}
        </p>
        <p className="truncate text-[14px] text-white/50">
          @{username || <span className="text-white/30">username</span>}
          {typing === 'username' && <span data-welcome-caret className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 bg-white/70" />}
        </p>
        <div className="mt-3 flex min-h-[26px] flex-wrap gap-1.5">
          {interests.length
            ? interests.slice(0, 6).map((id) => <span key={id} data-welcome-pop className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium capitalize text-white/80">{_copy(`welcome.topic.${id}`, { defaultValue: id })}</span>)
            : <span className="rounded-full border border-dashed border-white/20 px-2.5 py-1 text-[11px] text-white/35">{_copy('welcome.card.interests', { defaultValue: 'Your interests' })}</span>}
          {interests.length > 6 && <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/60">+{interests.length - 6}</span>}
        </div>
        <div className="mt-3 flex gap-4 text-[13px] text-white/55">
          <span><b key={following} data-welcome-pop className="inline-block text-white">{following}</b> {_copy('welcome.card.following', { defaultValue: 'following' })}</span>
          <span><b className="text-white">0</b> {_copy('welcome.card.followers', { defaultValue: 'followers' })}</span>
        </div>
      </div>
    </div>
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
  const [search, setSearch] = useSurfaceDraft("src/components/app/login/LoginProfileStep.tsx:search", '');

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
          setSearch.complete(search, '');
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
                  setSearch.complete(search, '');
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
