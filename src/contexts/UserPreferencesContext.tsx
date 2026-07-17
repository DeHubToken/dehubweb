/**
 * User Preferences Context
 * ========================
 * Central per-user sync layer for client preferences (theme, dim lights,
 * autoplay, animations, feed layout, language, …).
 *
 * WHY THIS EXISTS
 * ---------------
 * A user's identity in DeHub is their wallet address. Historically every
 * preference lived in a GLOBAL localStorage key (`dehub.theme`, `autoplay-videos`,
 * …) with no account scoping, so:
 *   - logging out of account A and into account B left B wearing A's settings, and
 *   - settings never followed a user to another device/browser.
 *
 * This provider makes the Supabase table `user_display_preferences.preferences`
 * (a JSON blob, wallet-scoped RLS) the source of truth and coordinates it:
 *   - on login  → hydrate the wallet's blob and push each value into the
 *                 individual preference contexts (see `useSyncedPreference`);
 *   - on account switch → apply the new account's saved values and RESET any key
 *                 it hasn't set back to default, so account B never inherits A's
 *                 leftovers (this is what stops the leak);
 *   - on a brand-new account (no row yet) → clean defaults, never the previous
 *                 look;
 *   - on change → optimistic in-memory update + per-wallet localStorage mirror
 *                 for instant paint, then a debounced upsert to Supabase.
 *
 * A logged-OUT visitor is left alone — their last local look persists via each
 * context's own localStorage; nothing is reset until a different account signs in.
 *
 * Individual contexts keep their own synchronous localStorage init for instant
 * first paint; they just register with `useSyncedPreference` so the server value
 * can reconcile them once the account resolves. This mirrors the proven
 * `ShortsEnabledContext` pattern, generalised to many keys behind one round-trip.
 *
 * SAFE FALLBACK: consumers rendered without this provider get a no-op — the host
 * context behaves exactly as before (localStorage only).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import i18n, { loadLanguage } from '@/i18n';

const LANGUAGE_LS_KEY = 'user-preferred-language';
const BUY_BOT_LS_KEY = 'dehub_hide_buy_bot';

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

type PrefBlob = Record<string, unknown>;

interface Registration {
  /** Apply a specific synced value (set state + write the host's local key). */
  apply: (value: unknown) => void;
  /** Read the host's current value (used to adopt the look for a new account). */
  read: () => unknown;
  /** Reset the host to its own default value. */
  reset: () => void;
}

interface UserPreferencesContextValue {
  /** True once the current wallet's blob has been fetched from the server. */
  hydrated: boolean;
  register: (key: string, reg: Registration) => () => void;
  /** Optimistically set a preference and schedule a debounced server upsert. */
  setPref: (key: string, value: unknown) => void;
  /** Persist immediately and await the round-trip (use before a page reload). */
  flushPref: (key: string, value: unknown) => Promise<void>;
}

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);

const MIRROR_PREFIX = 'dehub.prefs::'; // per-wallet localStorage mirror
const LAST_WALLET_KEY = 'dehub.prefs.lastWallet';
const UPSERT_DEBOUNCE_MS = 600;

function readMirror(wallet: string): PrefBlob {
  try {
    const raw = localStorage.getItem(MIRROR_PREFIX + wallet.toLowerCase());
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as PrefBlob) : {};
  } catch {
    return {};
  }
}

function writeMirror(wallet: string, blob: PrefBlob) {
  try {
    localStorage.setItem(MIRROR_PREFIX + wallet.toLowerCase(), JSON.stringify(blob));
    localStorage.setItem(LAST_WALLET_KEY, wallet.toLowerCase());
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const { walletAddress, isAuthenticated, isLoading } = useAuth();

  const [hydrated, setHydrated] = useState(false);

  // key → registration. Refs so (un)registration never re-renders and the
  // appliers/readers are always the latest.
  const registry = useRef<Map<string, Registration>>(new Map());
  const blobRef = useRef<PrefBlob>({});
  const walletRef = useRef<string | null>(null);
  // The last wallet we authoritatively processed — lets us tell a fresh login
  // (null → addr) from an account switch (addrA → addrB).
  const prevWalletRef = useRef<string | null>(null);
  // Whether inbound sync is authoritative for the current account yet. Late
  // registrants only get reconciled once this is true.
  const readyRef = useRef(false);

  /** Apply a blob: present keys → their value; absent keys → default iff resetAbsent. */
  const applyBlob = useCallback((blob: PrefBlob, resetAbsent: boolean) => {
    registry.current.forEach((reg, key) => {
      try {
        if (key in blob) reg.apply(blob[key]);
        else if (resetAbsent) reg.reset();
      } catch {
        /* one applier throwing must not break the others */
      }
    });
  }, []);

  const register = useCallback((key: string, reg: Registration) => {
    registry.current.set(key, reg);
    // Reconcile a late-registering context against the authoritative blob.
    if (readyRef.current) {
      try {
        if (key in blobRef.current) reg.apply(blobRef.current[key]);
        else reg.reset();
      } catch {
        /* ignore */
      }
    }
    return () => {
      if (registry.current.get(key) === reg) registry.current.delete(key);
    };
  }, []);

  // ---- Persistence -------------------------------------------------------

  const upsertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const upsertNow = useCallback(async () => {
    const addr = walletRef.current;
    if (!addr) return;
    try {
      const { error } = await withWalletHeader(
        supabase
          .from('user_display_preferences')
          .upsert(
            { wallet_address: addr, preferences: blobRef.current as unknown as Json },
            { onConflict: 'wallet_address' },
          ),
        addr,
      );
      if (error) throw error;
    } catch (err) {
      // Non-fatal: the local mirror already holds the value and it re-syncs on
      // the next change. Preferences aren't worth a user-facing error toast.
      console.error('Failed to save preferences:', err);
    }
  }, []);

  const scheduleUpsert = useCallback(() => {
    if (upsertTimer.current) clearTimeout(upsertTimer.current);
    upsertTimer.current = setTimeout(() => {
      upsertTimer.current = null;
      void upsertNow();
    }, UPSERT_DEBOUNCE_MS);
  }, [upsertNow]);

  // ---- Login / switch / logout state machine -----------------------------

  useEffect(() => {
    // Wait until auth has actually resolved. While it's still loading we leave
    // each context showing its localStorage-seeded value (no default flash).
    if (isLoading) return;

    const addr = isAuthenticated && walletAddress ? walletAddress.toLowerCase() : null;
    const prev = prevWalletRef.current;
    walletRef.current = addr;

    if (!addr) {
      // Logged out. Don't touch the visuals — the last local look persists via
      // each context's own storage. We KEEP prevWalletRef (the last account) so
      // that an in-session log-out-of-A then log-into-B is still detected as an
      // account switch and B's residue-clear happens instantly.
      readyRef.current = false;
      blobRef.current = {};
      setHydrated(false);
      return;
    }

    if (prev === addr && readyRef.current) return; // already synced this account

    // A switch is any move from one real account to a different one. On the very
    // first load of a persisted session (prev === null) it's not a switch.
    const switching = prev !== null && prev !== addr;

    // Instant paint from this wallet's mirror. When switching, reset-absent so
    // the previous account's residue clears immediately (even if the mirror is
    // empty); on first load, apply the cache without resetting to avoid flashing
    // defaults before the server responds.
    const mirror = readMirror(addr);
    if (switching || Object.keys(mirror).length > 0) {
      blobRef.current = mirror;
      applyBlob(mirror, switching);
    }

    prevWalletRef.current = addr;

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await withWalletHeader(
          supabase
            .from('user_display_preferences')
            .select('preferences')
            .eq('wallet_address', addr)
            .maybeSingle(),
          addr,
        );
        if (cancelled) return;
        if (error) {
          // Keep whatever the mirror gave us; mark ready so edits still persist.
          readyRef.current = true;
          setHydrated(true);
          return;
        }

        // Server is authoritative (a missing row == no saved prefs == {}):
        // apply its keys and reset anything it doesn't set back to default, so a
        // brand-new account starts clean rather than wearing the last look.
        const server =
          data && (data as { preferences?: unknown }).preferences &&
          typeof (data as { preferences?: unknown }).preferences === 'object'
            ? ((data as any).preferences as PrefBlob)
            : {};
        blobRef.current = server;
        writeMirror(addr, server);
        applyBlob(server, true);
        readyRef.current = true;
        setHydrated(true);
      } catch {
        readyRef.current = true;
        setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [walletAddress, isAuthenticated, isLoading, applyBlob]);

  // ---- Public setters ----------------------------------------------------

  const commitLocal = useCallback((key: string, value: unknown) => {
    const next = { ...blobRef.current, [key]: value };
    blobRef.current = next;
    const addr = walletRef.current;
    if (addr) writeMirror(addr, next);
  }, []);

  const setPref = useCallback(
    (key: string, value: unknown) => {
      commitLocal(key, value);
      if (!walletRef.current || !isAuthenticated) return; // signed out → local only
      scheduleUpsert();
    },
    [commitLocal, isAuthenticated, scheduleUpsert],
  );

  const flushPref = useCallback(
    async (key: string, value: unknown) => {
      commitLocal(key, value);
      if (!walletRef.current || !isAuthenticated) return;
      if (upsertTimer.current) {
        clearTimeout(upsertTimer.current);
        upsertTimer.current = null;
      }
      await upsertNow();
    },
    [commitLocal, isAuthenticated, upsertNow],
  );

  // Flush a pending debounced write when the tab is hidden/closed so a quick
  // toggle-then-leave isn't dropped.
  useEffect(() => {
    const flush = () => {
      if (upsertTimer.current) {
        clearTimeout(upsertTimer.current);
        upsertTimer.current = null;
        void upsertNow();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [upsertNow]);

  const value = useMemo<UserPreferencesContextValue>(
    () => ({ hydrated, register, setPref, flushPref }),
    [hydrated, register, setPref, flushPref],
  );

  return (
    <UserPreferencesContext.Provider value={value}>
      <LocalStoragePrefBridge />
      {children}
    </UserPreferencesContext.Provider>
  );
}

/**
 * Single-mount bridge for preferences that live only in localStorage and are
 * read by hooks used in MANY components at once (`useUserLanguage`,
 * `useBuyBotHidden`). Those hooks can't call `useSyncedPreference` themselves —
 * the shared key would be registered/unregistered by every mount and collide —
 * so registration + inbound apply happen here exactly once. The hooks only
 * *push* changes outward (see `useUserPreferences().setPref`).
 */
function LocalStoragePrefBridge() {
  useSyncedPreference<string>(
    'language',
    readLS(LANGUAGE_LS_KEY) ?? 'en',
    (v) => {
      const lang = typeof v === 'string' && v ? v : 'en';
      try { localStorage.setItem(LANGUAGE_LS_KEY, lang); } catch { /* ignore */ }
      document.documentElement.lang = lang;
      // Switch live without a reload; localStorage is already set so a later
      // reload fully applies even if the runtime switch is partial.
      if (i18n.language !== lang) {
        void loadLanguage(lang).then((ok) => {
          if (ok && i18n.language !== lang) void i18n.changeLanguage(lang);
        });
      }
    },
    'en',
  );

  useSyncedPreference<boolean>(
    'buyBotHidden',
    readLS(BUY_BOT_LS_KEY) === 'true',
    (v) => {
      const hidden = v === true || v === 'true';
      try {
        if (hidden) localStorage.setItem(BUY_BOT_LS_KEY, 'true');
        else localStorage.removeItem(BUY_BOT_LS_KEY);
      } catch { /* ignore */ }
    },
    false,
  );

  return null;
}

/**
 * Bridge a single preference to the per-user sync layer.
 *
 * @param key           Stable key stored in the server blob.
 * @param currentValue  The host's current value (read when adopting a look for a
 *                      brand-new account).
 * @param apply         Applies an inbound synced value to the host (set state +
 *                      write its local key). Should coerce/validate the raw value.
 * @param defaultValue  The host's default; applied when resetting on account switch.
 * @returns push(value) — persist a local change (optimistic + debounced) — and
 *          pushImmediate(value) — persist and await (use before a reload).
 *
 * `apply`/`currentValue` are held in refs, so callers need not memoise them.
 */
export function useSyncedPreference<T>(
  key: string,
  currentValue: T,
  apply: (value: unknown) => void,
  defaultValue: T,
) {
  const ctx = useContext(UserPreferencesContext);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const currentRef = useRef<T>(currentValue);
  currentRef.current = currentValue;

  useEffect(() => {
    if (!ctx) return;
    return ctx.register(key, {
      apply: (v) => applyRef.current(v),
      read: () => currentRef.current,
      reset: () => applyRef.current(defaultValue),
    });
    // defaultValue is a stable primitive/const per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, key]);

  const push = useCallback(
    (value: unknown) => {
      ctx?.setPref(key, value);
    },
    [ctx, key],
  );

  const pushImmediate = useCallback(
    (value: unknown) => ctx?.flushPref(key, value) ?? Promise.resolve(),
    [ctx, key],
  );

  return { push, pushImmediate };
}

export function useUserPreferences() {
  return useContext(UserPreferencesContext);
}
