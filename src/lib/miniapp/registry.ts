/**
 * Reads from the mini app registry. The table is public for live apps only
 * (RLS), so these go straight to Supabase with the anon key. A failed store
 * read comes back as null, not an empty list, so the store can say it failed
 * and offer a retry instead of claiming nothing is listed. Single-app lookups
 * still read a failure as "no such app".
 */
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/lib/api/dehub';
import { withWalletHeader } from '@/lib/supabase-wallet-client';

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL || 'https://aigxuutjaqsywioxjefr.supabase.co'}/functions/v1`;

export interface MiniAppListing {
  id: string;
  slug: string;
  domain: string;
  home_url: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  icon_url: string | null;
  splash_image_url: string | null;
  splash_background_color: string | null;
  category: string | null;
  tier: 'unlisted' | 'listed' | 'verified';
  /** Where payments go: the wallet that signed the domain's dehub.json. */
  owner_wallet: string | null;
}

const COLUMNS =
  'id, slug, domain, home_url, name, subtitle, description, icon_url, splash_image_url, splash_background_color, category, tier, owner_wallet';

export async function fetchListedApps(): Promise<MiniAppListing[] | null> {
  const { data, error } = await supabase
    .from('miniapp_apps')
    .select(COLUMNS)
    .in('tier', ['listed', 'verified'])
    .order('name', { ascending: true })
    .limit(200);
  if (error) return null;
  return (data ?? []) as MiniAppListing[];
}

export async function fetchAppBySlug(slug: string): Promise<MiniAppListing | null> {
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) return null;
  const { data, error } = await supabase.from('miniapp_apps').select(COLUMNS).eq('slug', slug).maybeSingle();
  if (error) return null;
  return (data as MiniAppListing | null) ?? null;
}

export interface ManifestProblem {
  field: string;
  message: string;
}

export interface ManifestCheck {
  ok: boolean;
  domain?: string;
  source?: 'dehub' | 'farcaster';
  owner?: string | null;
  manifest?: {
    name?: string;
    homeUrl?: string;
    iconUrl?: string;
    subtitle?: string;
    description?: string;
    category?: string;
    splashBackgroundColor?: string;
  };
  embed?: { tag: string; imageUrl?: string; buttonTitle?: string; url?: string } | null;
  errors: ManifestProblem[];
  warnings: ManifestProblem[];
  error?: string;
}

export async function checkManifest(url: string): Promise<ManifestCheck> {
  const res = await fetch(`${FUNCTIONS_URL}/miniapp-registry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'validate', url }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, errors: [], warnings: [], error: body?.error || 'The check failed.' };
  return body as ManifestCheck;
}

export interface MyApp {
  slug: string;
  domain: string;
  home_url: string;
  name: string;
  subtitle: string | null;
  icon_url: string | null;
  tier: 'unlisted' | 'listed' | 'verified';
  status: 'pending' | 'live' | 'suspended' | 'rejected';
  source: 'dehub' | 'farcaster' | 'base' | 'first_party';
  owner_wallet: string | null;
  review_note: string | null;
  updated_at: string;
}

async function registryCall<T>(body: Record<string, unknown>): Promise<T> {
  const session = getAuthToken();
  if (!session) throw new Error('signin');
  const res = await fetch(`${FUNCTIONS_URL}/miniapp-registry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-dehub-token': session },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || 'The request failed.'), { detail: data });
  return data as T;
}

/** Register or update an app. It goes live at once as unlisted; review lists it. */
export function submitApp(url: string): Promise<{ ok: true; app: MyApp; updated: boolean }> {
  return registryCall({ action: 'submit', url });
}

export async function fetchMyApps(): Promise<MyApp[]> {
  return (await registryCall<{ apps: MyApp[] }>({ action: 'mine' })).apps;
}

/** A live app registered for this domain, if any — how a plain link to an app's site becomes an app card. */
export async function fetchAppByDomain(domain: string): Promise<MiniAppListing | null> {
  const host = domain.toLowerCase();
  if (!/^[a-z0-9.-]{3,253}$/.test(host)) return null;
  const { data, error } = await supabase.from('miniapp_apps').select(COLUMNS).eq('domain', host).maybeSingle();
  if (error) return null;
  return (data as MiniAppListing | null) ?? null;
}

async function userCall<T>(body: Record<string, unknown>): Promise<T> {
  const session = getAuthToken();
  if (!session) throw Object.assign(new Error('Sign in to DeHub first.'), { code: 'signin' });
  const res = await fetch(`${FUNCTIONS_URL}/miniapp-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-dehub-token': session },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || 'The request failed.'), { code: 'failed' });
  return data as T;
}

/** Add an app for the signed-in person; its notifications are on. */
export function addApp(slug: string): Promise<{ added: true; notificationsEnabled: boolean }> {
  return userCall({ action: 'add', slug });
}

export function removeApp(slug: string): Promise<{ removed: true }> {
  return userCall({ action: 'remove', slug });
}

/** Record a payment the host just sent to the app, and get the signed receipt. */
export function recordPayment(input: {
  slug: string;
  txHash: string;
  chainId: number;
  amount: number;
  memo: string | null;
}): Promise<{ txHash: string; chainId: number; amount: number; receipt: string }> {
  return userCall({ action: 'payment', ...input });
}

/** A fresh notify key for an app the caller owns. Shown once. */
export async function createNotifyKey(slug: string): Promise<string> {
  return (await registryCall<{ key: string }>({ action: 'notifyKey', slug })).key;
}

export interface AddedApp {
  app_id: string;
  notifications_on: boolean;
  miniapp_apps: Pick<MiniAppListing, 'slug' | 'name' | 'icon_url' | 'subtitle' | 'domain'> | null;
}

/** The apps this person has added. RLS scopes the rows to the signed-in wallet. */
export async function fetchAddedApps(wallet: string | null): Promise<AddedApp[]> {
  if (!wallet) return [];
  const { data, error } = await withWalletHeader(
    supabase.from('miniapp_installs').select('app_id, notifications_on, miniapp_apps(slug, name, icon_url, subtitle, domain)'),
    wallet.toLowerCase(),
  );
  if (error) return [];
  return (data ?? []) as unknown as AddedApp[];
}
