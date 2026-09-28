/**
 * Reads from the mini app registry. The table is public for live apps only
 * (RLS), so these go straight to Supabase with the anon key. Both reads
 * degrade to "nothing listed" if the table is not there yet — migrations are
 * applied by hand, and an empty store beats an error page.
 */
import { supabase } from '@/integrations/supabase/client';

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
}

const COLUMNS =
  'id, slug, domain, home_url, name, subtitle, description, icon_url, splash_image_url, splash_background_color, category, tier';

// The generated Database types predate these tables.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function fetchListedApps(): Promise<MiniAppListing[]> {
  const { data, error } = await db
    .from('miniapp_apps')
    .select(COLUMNS)
    .in('tier', ['listed', 'verified'])
    .order('name', { ascending: true })
    .limit(200);
  if (error) return [];
  return (data ?? []) as MiniAppListing[];
}

export async function fetchAppBySlug(slug: string): Promise<MiniAppListing | null> {
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) return null;
  const { data, error } = await db.from('miniapp_apps').select(COLUMNS).eq('slug', slug).maybeSingle();
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
