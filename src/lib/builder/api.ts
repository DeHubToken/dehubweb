/**
 * Where DeHub Builder apps live, and what their owner can do with them.
 *
 * Builds are started from Messages — @assistant calls the builder-api function
 * on the user's behalf. Each app is served from its own origin,
 * https://<slug>.dhb.gg. Public apps are also mirrored to Storage, which
 * older share links and app builds still render from.
 */
import { supabase } from '@/integrations/supabase/client';
import { ensureFreshToken } from '@/lib/api/dehub/core';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://aigxuutjaqsywioxjefr.supabase.co";

export const BUILDER_APPS_DOMAIN = 'dhb.gg';

/** Public Storage directory the generated files live in (trailing slash). */
export function builderStorageBase(projectId: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/builder-apps/${projectId}/`;
}

export function builderAppUrl(slug: string): string {
  return `https://${slug}.${BUILDER_APPS_DOMAIN}/`;
}

export interface PublicBuilderApp {
  slug: string | null;
  name: string;
  emoji: string;
  version: number;
  url: string | null;
}

/** A public app's address, or null when it is private or does not exist. */
export async function resolvePublicApp(projectId: string): Promise<PublicBuilderApp | null> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/builder-serve?app=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

/** True once <slug>.dhb.gg answers — false while DNS is still moving. */
export async function appHostReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

export interface BuilderProject {
  id: string;
  name: string;
  emoji: string;
  status: string;
  version: number;
  is_public: boolean;
  slug: string | null;
  miniapp_app_id: string | null;
}

export interface BuilderListing {
  slug: string;
  status: string;
  tier: 'unlisted' | 'listed' | 'verified';
  published: boolean;
}

export interface BuilderVersion {
  version: number;
  name: string;
  emoji: string;
  summary: string;
  created_at: string;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const headers = { 'x-dehub-token': await ensureFreshToken() };
  const { data, error } = await supabase.functions.invoke('builder-api', { body, headers });
  if (data?.error) throw new Error(data.error);
  if (error) {
    // A non-2xx answer carries the reason in its body; FunctionsHttpError hides it.
    const context = (error as { context?: Response }).context;
    const reason = context && typeof context.json === 'function' ? await context.json().catch(() => null) : null;
    const err = new Error(reason?.error || error.message || 'Builder request failed') as Error & { status?: number };
    err.status = context?.status;
    throw err;
  }
  return data as T;
}

export const builderApi = {
  /** The project, if the signed-in wallet owns it. Throws (404) otherwise. */
  get: (projectId: string) =>
    call<{ project: BuilderProject; url: string | null; listing: BuilderListing | null }>({ action: 'get', projectId }),
  versions: (projectId: string) =>
    call<{ current: number; versions: BuilderVersion[] }>({ action: 'versions', projectId }),
  restore: (projectId: string, version: number) => call<{ version: number }>({ action: 'restore', projectId, version }),
  setVisibility: (projectId: string, isPublic: boolean) => call<{ isPublic: boolean }>({ action: 'set_visibility', projectId, isPublic }),
  setSlug: (projectId: string, slug: string) => call<{ slug: string; url: string }>({ action: 'set_slug', projectId, slug }),
  previewUrl: (projectId: string) =>
    call<{ url: string; publicUrl: string; expiresAt: string | null }>({ action: 'preview_url', projectId }),
  publish: (projectId: string) => call<{ appSlug: string; tier: string; storeUrl: string }>({ action: 'publish', projectId }),
  unpublish: (projectId: string) => call<{ ok: true }>({ action: 'unpublish', projectId }),
};
