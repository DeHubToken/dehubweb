import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { dehubAuthHeaders, readFunctionError } from '@/lib/ai-invoke';
import { ensureFreshToken } from '@/lib/api/dehub/core';
import i18n from '@/i18n';

export const MULTIPOST_PLATFORMS = [
  'twitter', 'instagram', 'facebook', 'youtube', 'tiktok', 'linkedin',
  'threads', 'pinterest', 'reddit', 'googlebusiness', 'snapchat', 'discord', 'farcaster',
] as const;
export type MultipostPlatform = typeof MULTIPOST_PLATFORMS[number];

export const PLATFORM_NAMES: Record<string, string> = {
  twitter: 'X', instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok',
  linkedin: 'LinkedIn', threads: 'Threads', pinterest: 'Pinterest', reddit: 'Reddit',
  googlebusiness: 'Google Business', snapchat: 'Snapchat', discord: 'Discord', farcaster: 'Farcaster',
};

export interface SocialAccount { id: string; platform: string; username: string; pending?: boolean; approvalUrl?: string }
export interface MultipostStatus { credits: number; accounts: SocialAccount[] }
export interface CreditQuote { credits: number; usd: number; discount: number; dhb: number; treasury: string }

export class MultipostError extends Error {
  constructor(message: string, public status?: number, public data?: Record<string, unknown>) { super(message); }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  await ensureFreshToken();
  const { data, error } = await supabase.functions.invoke('multipost', { body, headers: dehubAuthHeaders() });
  if (error) {
    let payload: Record<string, unknown> | undefined;
    try {
      const ctx = (error as { context?: Response }).context;
      payload = ctx && typeof ctx.clone === 'function' ? await ctx.clone().json() : undefined;
    } catch { /* not JSON */ }
    const message = typeof payload?.error === 'string' ? payload.error : await readFunctionError(error, data);
    throw new MultipostError(message, (error as { context?: Response }).context?.status, payload);
  }
  if (data?.error && data?.ok === false) throw new MultipostError(data.error, 400, data);
  return data as T;
}

export const getMultipostStatus = () => call<MultipostStatus>({ action: 'status' });
export const quoteCredits = (credits: number) => call<CreditQuote>({ action: 'quote', credits });
export const disconnectAccount = (accountId: string) => call<{ ok: true }>({ action: 'disconnect', accountId });

/** Returns where to send the user, or null when the account is already connected. */
export async function startConnect(platform: string, redirectUrl: string): Promise<string | null> {
  const { authUrl } = await call<{ authUrl?: string }>({ action: 'connect', platform, redirectUrl });
  return authUrl ?? null;
}

/** Pay DHB for `credits` and have them credited. Returns the new balance. */
export async function buyCredits(credits: number, wallet: string | null): Promise<number> {
  const quote = await quoteCredits(credits);
  const { payDhb } = await import('@/lib/dhb-payment');
  const payment = await payDhb(quote.dhb, quote.treasury, {
    context: i18n.t('multiPost.payContext'),
    expectedSigner: wallet,
  });
  // The indexer can trail the receipt by a few seconds.
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await call<{ credits: number }>({ action: 'topup', credits, txHash: payment.txHash });
      return res.credits;
    } catch (err) {
      lastError = err;
      if (!(err instanceof MultipostError) || err.status !== 402) throw err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw lastError;
}

async function uploadMedia(files: File[]): Promise<{ url: string; type: 'image' | 'video' }[]> {
  const video = files.find((f) => f.type.startsWith('video/'));
  const picked = video ? [video] : files.filter((f) => f.type.startsWith('image/')).slice(0, 4);
  const out: { url: string; type: 'image' | 'video' }[] = [];
  for (const file of picked) {
    const { uploadUrl, publicUrl } = await call<{ uploadUrl: string; publicUrl: string }>({
      action: 'presign', filename: file.name || 'upload', contentType: file.type,
    });
    const put = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
    if (!put.ok) throw new Error(i18n.t('multiPost.uploadFailed'));
    out.push({ url: publicUrl, type: file.type.startsWith('video/') ? 'video' : 'image' });
  }
  return out;
}

function postLink(tokenId: string | number | undefined): string | undefined {
  if (tokenId === undefined || tokenId === null) return undefined;
  const origin = /(^|\.)dehub\.io$/.test(window.location.hostname) ? window.location.origin : 'https://dehub.io';
  return `${origin}/app/post/${tokenId}`;
}

interface CrossPostInput {
  text: string;
  files: File[];
  accountIds: string[];
  scheduledAt?: Date | null;
  tokenId?: string | number;
  wallet: string | null;
}

/**
 * Send a dehub post to the selected external accounts. Runs after the dehub
 * post exists, so nothing here can fail the post itself. Missing credits are
 * bought on the spot at the single-post price.
 */
export async function crossPost(input: CrossPostInput): Promise<void> {
  if (!input.accountIds.length) return;
  const toastId = 'crosspost';
  toast.loading(i18n.t('multiPost.postingToast', { count: input.accountIds.length }), { id: toastId });
  try {
    const mediaItems = input.files.length ? await uploadMedia(input.files) : [];
    const body = {
      action: 'publish',
      content: input.text.replace(/\[soundtrack:[^\]]*\]\s*/g, '').trim(),
      accountIds: input.accountIds,
      mediaItems,
      scheduledAt: input.scheduledAt ? input.scheduledAt.toISOString() : undefined,
      link: postLink(input.tokenId),
    };

    type PublishResult = { sent: number; failed: number; scheduled: boolean; skipped: { platform: string; reason: string }[] };
    let result: PublishResult;
    try {
      result = await call<PublishResult>(body);
    } catch (err) {
      if (!(err instanceof MultipostError) || err.data?.code !== 'INSUFFICIENT_CREDITS') throw err;
      const shortfall = Number(err.data.needed) - Number(err.data.credits ?? 0);
      toast.loading(i18n.t('multiPost.payingToast', { count: shortfall }), { id: toastId });
      await buyCredits(Math.max(1, shortfall), input.wallet);
      result = await call<PublishResult>(body);
    }

    const names = (reasons: string[] | null) => (result.skipped ?? [])
      .filter((s) => (reasons ? reasons.includes(s.reason) : !['needs_video', 'needs_media', 'no_schedule'].includes(s.reason)))
      .map((s) => PLATFORM_NAMES[s.platform] ?? s.platform)
      .join(', ');
    const media = names(['needs_video', 'needs_media']);
    const schedule = names(['no_schedule']);
    const other = names(null);
    if (media) toast.message(i18n.t('multiPost.skippedToast', { platforms: media }));
    if (schedule) toast.message(i18n.t('multiPost.skippedScheduleToast', { platforms: schedule }));
    if (other) toast.message(i18n.t('multiPost.skippedOtherToast', { platforms: other }));
    if (result.failed > 0) {
      toast.warning(i18n.t('multiPost.partialToast', { sent: result.sent, failed: result.failed }), { id: toastId });
    } else {
      toast.success(
        i18n.t(result.scheduled ? 'multiPost.scheduledToast' : 'multiPost.postedToast', { count: result.sent }),
        { id: toastId },
      );
    }
  } catch (err) {
    toast.error(i18n.t('multiPost.failedToast', { error: err instanceof Error ? err.message : String(err) }), { id: toastId });
  }
}
