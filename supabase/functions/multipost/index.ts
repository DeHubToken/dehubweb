// Multi-posting through Zernio (https://docs.zernio.com), plus Farcaster through
// Neynar, which Zernio does not cover.
//
// Each dehub wallet gets one Zernio profile; connected platform accounts hang
// off it. Farcaster is one signer per wallet in social_farcaster_signers.
// Posting spends each platform's credit price up front and refunds any
// platform that rejects the post on the spot.

import { checkRateLimit, handleCorsPreflight, jsonResponse, requireDeHubAuth, serviceClient } from '../_shared/auth.ts';
import { claimDhbPayment, DHB_TREASURY } from '../_shared/dhb-transfer.ts';
import {
  BUNDLE_STOPS, CREDIT_PRICE_USD, DEFAULT_PLATFORM_CREDITS, MAX_TOPUP_CREDITS, PLATFORM_CREDITS,
  bundleDiscount, bundlePriceUsd, creditsFor,
} from '../_shared/social-pricing.ts';
import { createSigner, farcasterConfigured, getSigner, getUsername, publishCast } from '../_shared/farcaster.ts';

const ZERNIO = 'https://zernio.com/api/v1';
const DHB_BASE = '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c';
const FARCASTER_ACCOUNT_ID = 'farcaster';

const ZERNIO_PLATFORMS = [
  'twitter', 'instagram', 'facebook', 'youtube', 'tiktok', 'linkedin',
  'threads', 'pinterest', 'reddit', 'googlebusiness', 'snapchat', 'discord',
] as const;
const PLATFORMS = [...ZERNIO_PLATFORMS, 'farcaster'] as const;
type ZernioPlatform = typeof ZERNIO_PLATFORMS[number];

const TEXT_LIMIT: Partial<Record<ZernioPlatform, number>> = {
  twitter: 280, threads: 500, instagram: 2200, tiktok: 2200, linkedin: 3000, pinterest: 800, googlebusiness: 1500,
};

// Paying slightly under the quote is allowed so a price tick between quote and
// confirmation does not strand a transfer that already left the wallet.
const PRICE_SLACK = 0.95;

type Admin = ReturnType<typeof serviceClient>;

interface ZAccount { _id: string; platform: string; username?: string; displayName?: string; isActive?: boolean }
interface MediaItem { url: string; type: 'image' | 'video' | 'gif' | 'document' }
interface Skip { accountId: string; platform: string; reason: string }

async function zernio(path: string, init: RequestInit = {}): Promise<{ status: number; data: any }> {
  const key = Deno.env.get('ZERNIO_API_KEY');
  if (!key) throw new Error('Multi-posting is not configured yet.');
  const res = await fetch(`${ZERNIO}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30000),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { status: res.status, data };
}

async function getDhbPriceUsd(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${DHB_BASE}`, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const price = parseFloat((await res.json())?.pairs?.[0]?.priceUsd);
      if (Number.isFinite(price) && price > 0) return price;
    }
  } catch { /* fall through */ }
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=dehub&vs_currencies=usd');
    if (res.ok) {
      const price = Number((await res.json())?.dehub?.usd);
      if (Number.isFinite(price) && price > 0) return price;
    }
  } catch { /* fall through */ }
  return null;
}

async function getProfileId(admin: Admin, wallet: string, create: boolean): Promise<string | null> {
  const { data } = await admin.from('social_profiles').select('zernio_profile_id').eq('wallet_address', wallet).maybeSingle();
  if (data?.zernio_profile_id) return data.zernio_profile_id;
  if (!create) return null;

  const res = await zernio('/profiles', { method: 'POST', body: JSON.stringify({ name: `dehub_${wallet}`, description: 'dehub user' }) });
  const id = res.data?.profile?._id ?? res.data?.details?.existingProfileId;
  if (!id) throw new Error(res.data?.error || 'Could not set up multi-posting for this account.');
  await admin.from('social_profiles').upsert({ wallet_address: wallet, zernio_profile_id: id });
  return id;
}

async function listZernioAccounts(profileId: string | null): Promise<ZAccount[]> {
  if (!profileId) return [];
  const res = await zernio(`/accounts?profileId=${encodeURIComponent(profileId)}`);
  const accounts: ZAccount[] = res.data?.accounts ?? [];
  return accounts.filter((a) => a.isActive !== false);
}

interface FarcasterRow { signer_uuid: string; fid: number | null; username: string | null; status: string; approval_url: string | null }

/** The wallet's Farcaster signer, refreshed from Neynar while approval is pending. */
async function getFarcaster(admin: Admin, wallet: string): Promise<FarcasterRow | null> {
  const { data } = await admin.from('social_farcaster_signers').select('signer_uuid, fid, username, status, approval_url').eq('wallet_address', wallet).maybeSingle();
  if (!data) return null;
  if (data.status === 'approved' || !farcasterConfigured()) return data as FarcasterRow;
  try {
    const signer = await getSigner(data.signer_uuid);
    if (signer.status === 'approved' && signer.fid) {
      const username = await getUsername(signer.fid).catch(() => '');
      const row = { ...data, status: 'approved', fid: signer.fid, username };
      await admin.from('social_farcaster_signers').update({ status: 'approved', fid: signer.fid, username, updated_at: new Date().toISOString() }).eq('wallet_address', wallet);
      return row as FarcasterRow;
    }
    if (signer.status === 'revoked') {
      await admin.from('social_farcaster_signers').delete().eq('wallet_address', wallet);
      return null;
    }
  } catch { /* keep showing pending */ }
  return data as FarcasterRow;
}

async function getCredits(admin: Admin, wallet: string): Promise<number> {
  const { data } = await admin.from('social_post_credits').select('credits').eq('wallet_address', wallet).maybeSingle();
  return Number(data?.credits ?? 0);
}

function isAllowedRedirect(url: string): boolean {
  if (url.startsWith('dehub://')) return true;
  try {
    const u = new URL(url);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    return u.protocol === 'https:' && (u.hostname === 'dehub.io' || u.hostname.endsWith('.dehub.io'));
  } catch {
    return false;
  }
}

function clip(text: string, limit?: number): string {
  if (!limit || text.length <= limit) return text;
  return text.slice(0, limit - 1).trimEnd() + '…';
}

/** Why an account cannot take this post, or null if it can. */
function incompatibility(platform: string, media: MediaItem[], content: string): string | null {
  const videos = media.filter((m) => m.type === 'video').length;
  const images = media.filter((m) => m.type === 'image' || m.type === 'gif').length;
  switch (platform) {
    case 'youtube': return videos === 1 ? null : 'needs_video';
    case 'tiktok': return videos === 1 || (videos === 0 && images > 0) ? null : 'needs_media';
    case 'instagram': return media.length > 0 ? null : 'needs_media';
    case 'snapchat': return media.length > 0 ? null : 'needs_media';
    case 'pinterest': return media.length > 0 ? null : 'needs_media';
    default: return content.trim() || media.length ? null : 'empty';
  }
}

async function platformExtras(platform: string, accountId: string, content: string): Promise<{ data?: Record<string, unknown>; tiktok?: Record<string, unknown>; skip?: string }> {
  if (platform === 'youtube') {
    const title = clip((content.split('\n')[0] || 'New video').trim(), 100);
    return { data: { title, visibility: 'public' } };
  }
  if (platform === 'pinterest') {
    const res = await zernio(`/accounts/${accountId}/pinterest-boards`);
    const boards = res.data?.boards ?? res.data ?? [];
    const boardId = Array.isArray(boards) ? (boards[0]?.id ?? boards[0]?._id) : null;
    return boardId ? { data: { boardId, title: clip(content.split('\n')[0] || '', 100) } } : { skip: 'no_board' };
  }
  if (platform === 'tiktok') {
    const res = await zernio(`/accounts/${accountId}/tiktok/creator-info`);
    const info = res.data?.creatorInfo ?? res.data?.data ?? res.data ?? {};
    const options: string[] = info.privacy_level_options ?? info.privacyLevelOptions ?? [];
    const privacy = options.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : (options[0] ?? 'PUBLIC_TO_EVERYONE');
    return {
      tiktok: {
        privacy_level: privacy,
        allow_comment: true,
        allow_duet: true,
        allow_stitch: true,
        content_preview_confirmed: true,
        express_consent_given: true,
      },
    };
  }
  return {};
}

const pricing = () => ({
  creditPriceUsd: CREDIT_PRICE_USD,
  platformCredits: PLATFORM_CREDITS,
  defaultPlatformCredits: DEFAULT_PLATFORM_CREDITS,
  stops: BUNDLE_STOPS,
  platforms: PLATFORMS,
});

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }
  const action = String(body?.action ?? '');

  // Pricing is public so the slider can render before sign-in.
  if (action === 'pricing') return jsonResponse(pricing());

  const auth = await requireDeHubAuth(req);
  if (!auth.ok) return auth.response;
  const wallet = auth.wallet;
  const admin = serviceClient();

  try {
    if (action === 'status') {
      const profileId = await getProfileId(admin, wallet, false);
      const [accounts, farcaster, credits] = await Promise.all([
        listZernioAccounts(profileId),
        getFarcaster(admin, wallet),
        getCredits(admin, wallet),
      ]);
      const list = accounts.map((a) => ({ id: a._id, platform: a.platform, username: a.username ?? a.displayName ?? '', pending: false }));
      if (farcaster) {
        list.push({
          id: FARCASTER_ACCOUNT_ID,
          platform: 'farcaster',
          username: farcaster.username ?? '',
          pending: farcaster.status !== 'approved',
          ...(farcaster.status !== 'approved' && farcaster.approval_url ? { approvalUrl: farcaster.approval_url } : {}),
        });
      }
      return jsonResponse({ credits, accounts: list, ...pricing() });
    }

    if (action === 'quote') {
      const credits = Math.floor(Number(body.credits ?? body.posts));
      if (!Number.isFinite(credits) || credits < 1 || credits > MAX_TOPUP_CREDITS) return jsonResponse({ error: 'Invalid number of credits' }, 400);
      const price = await getDhbPriceUsd();
      if (!price) return jsonResponse({ error: 'DHB price unavailable, try again shortly' }, 503);
      const usd = bundlePriceUsd(credits);
      return jsonResponse({
        credits,
        usd,
        discount: bundleDiscount(credits),
        dhb: Math.ceil(usd / price),
        dhbPriceUsd: price,
        treasury: DHB_TREASURY,
      });
    }

    if (action === 'topup') {
      const credits = Math.floor(Number(body.credits ?? body.posts));
      const txHash = String(body.txHash ?? '');
      if (!Number.isFinite(credits) || credits < 1 || credits > MAX_TOPUP_CREDITS) return jsonResponse({ error: 'Invalid number of credits' }, 400);
      const price = await getDhbPriceUsd();
      if (!price) return jsonResponse({ error: 'DHB price unavailable, try again shortly' }, 503);
      const usd = bundlePriceUsd(credits);
      const minimumDhb = Math.floor((usd / price) * PRICE_SLACK);
      const payment = await claimDhbPayment(txHash, wallet, minimumDhb, 'social', admin);
      if (!payment.ok) return jsonResponse({ error: payment.reason }, 402);

      const { data: balance, error } = await admin.rpc('social_credit_add', {
        p_wallet: wallet, p_tx_hash: payment.hash, p_chain: payment.chain, p_dhb: payment.dhb,
        p_price: price, p_usd: Math.round(payment.dhb * price * 1e6) / 1e6, p_posts: credits, p_discount: bundleDiscount(credits),
      });
      if (error) {
        if (String(error.message).includes('TX_ALREADY_CREDITED')) {
          return jsonResponse({ ok: true, alreadyCredited: true, credits: await getCredits(admin, wallet) });
        }
        throw error;
      }
      return jsonResponse({ ok: true, credits: Number(balance), added: credits });
    }

    if (action === 'connect') {
      const platform = String(body.platform ?? '');
      if (!PLATFORMS.includes(platform as typeof PLATFORMS[number])) return jsonResponse({ error: 'Unsupported platform' }, 400);

      if (platform === 'farcaster') {
        const existing = await getFarcaster(admin, wallet);
        if (existing?.status === 'approved') return jsonResponse({ ok: true, connected: true });
        const signer = await createSigner();
        await admin.from('social_farcaster_signers').upsert({
          wallet_address: wallet,
          signer_uuid: signer.signerUuid,
          public_key: signer.publicKey,
          status: 'pending_approval',
          approval_url: signer.approvalUrl,
          fid: null,
          username: null,
          updated_at: new Date().toISOString(),
        });
        return jsonResponse({ authUrl: signer.approvalUrl, pending: true });
      }

      const redirectUrl = String(body.redirectUrl ?? '');
      if (!isAllowedRedirect(redirectUrl)) return jsonResponse({ error: 'Invalid redirect' }, 400);
      const profileId = await getProfileId(admin, wallet, true);
      const res = await zernio(`/connect/${platform}?profileId=${encodeURIComponent(profileId!)}&redirect_url=${encodeURIComponent(redirectUrl)}`);
      if (!res.data?.authUrl) return jsonResponse({ error: res.data?.error || 'Could not start the connection.' }, res.status >= 400 ? res.status : 502);
      return jsonResponse({ authUrl: res.data.authUrl });
    }

    if (action === 'disconnect') {
      const accountId = String(body.accountId ?? '');
      if (accountId === FARCASTER_ACCOUNT_ID) {
        await admin.from('social_farcaster_signers').delete().eq('wallet_address', wallet);
        return jsonResponse({ ok: true });
      }
      const accounts = await listZernioAccounts(await getProfileId(admin, wallet, false));
      if (!accounts.some((a) => a._id === accountId)) return jsonResponse({ error: 'Account not found' }, 404);
      await zernio(`/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' });
      return jsonResponse({ ok: true });
    }

    if (action === 'presign') {
      const filename = String(body.filename ?? 'upload').slice(0, 200);
      const contentType = String(body.contentType ?? '');
      if (!/^(image|video)\//.test(contentType)) return jsonResponse({ error: 'Only images and videos can be cross-posted' }, 400);
      const res = await zernio('/media/presign', { method: 'POST', body: JSON.stringify({ filename, contentType }) });
      if (!res.data?.uploadUrl) return jsonResponse({ error: res.data?.error || 'Upload unavailable' }, 502);
      return jsonResponse({ uploadUrl: res.data.uploadUrl, publicUrl: res.data.publicUrl });
    }

    if (action === 'publish') {
      const rl = await checkRateLimit(admin, `wallet:${wallet}`, 'multipost-publish', { limit: 60, windowMs: 60 * 60 * 1000 });
      if (!rl.allowed) return jsonResponse({ error: 'Too many cross-posts. Try again later.' }, 429);

      const requested: string[] = Array.isArray(body.accountIds) ? body.accountIds.map(String) : [];
      const media: MediaItem[] = (Array.isArray(body.mediaItems) ? body.mediaItems : [])
        .filter((m: any) => typeof m?.url === 'string' && m.url.startsWith('https://'))
        .slice(0, 10)
        .map((m: any) => ({ url: m.url, type: ['image', 'video', 'gif', 'document'].includes(m.type) ? m.type : 'image' }));
      const content = String(body.content ?? '').slice(0, 5000);
      const link = typeof body.link === 'string' && /^https:\/\/([a-z0-9-]+\.)*dehub\.io\//.test(body.link) ? body.link : '';

      const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
      if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return jsonResponse({ error: 'Invalid schedule time' }, 400);
      const schedule = scheduledAt && scheduledAt.getTime() > Date.now() + 60_000 ? scheduledAt : null;

      const skipped: Skip[] = [];

      // Farcaster
      let farcaster: FarcasterRow | null = null;
      if (requested.includes(FARCASTER_ACCOUNT_ID)) {
        const row = await getFarcaster(admin, wallet);
        if (!row || row.status !== 'approved') skipped.push({ accountId: FARCASTER_ACCOUNT_ID, platform: 'farcaster', reason: 'not_approved' });
        else if (schedule) skipped.push({ accountId: FARCASTER_ACCOUNT_ID, platform: 'farcaster', reason: 'no_schedule' });
        else if (!content.trim() && !media.length) skipped.push({ accountId: FARCASTER_ACCOUNT_ID, platform: 'farcaster', reason: 'empty' });
        else farcaster = row;
      }

      // Zernio
      const zernioRequested = requested.filter((id) => id !== FARCASTER_ACCOUNT_ID);
      const accounts = zernioRequested.length
        ? (await listZernioAccounts(await getProfileId(admin, wallet, false))).filter((a) => zernioRequested.includes(a._id))
        : [];
      const targets: { account: ZAccount; entry: Record<string, unknown>; tiktok?: Record<string, unknown> }[] = [];
      for (const account of accounts) {
        const reason = incompatibility(account.platform, media, content);
        if (reason) { skipped.push({ accountId: account._id, platform: account.platform, reason }); continue; }
        const extras = await platformExtras(account.platform, account._id, content);
        if (extras.skip) { skipped.push({ accountId: account._id, platform: account.platform, reason: extras.skip }); continue; }
        const limit = TEXT_LIMIT[account.platform as ZernioPlatform];
        const withLink = link ? `${content}\n\n${link}` : content;
        const text = limit && withLink.length > limit ? clip(content, limit - (link ? link.length + 2 : 0)) + (link ? `\n\n${link}` : '') : withLink;
        targets.push({
          account,
          entry: { platform: account.platform, accountId: account._id, customContent: text, ...(extras.data ? { platformSpecificData: extras.data } : {}) },
          tiktok: extras.tiktok,
        });
      }

      if (!targets.length && !farcaster) {
        return jsonResponse({ ok: false, error: 'None of the selected accounts can take this post', skipped }, 400);
      }

      const cost = targets.reduce((sum, t) => sum + creditsFor(t.account.platform), 0) + (farcaster ? creditsFor('farcaster') : 0);
      const { data: remaining, error: consumeError } = await admin.rpc('social_credit_consume', { p_wallet: wallet, p_n: cost });
      if (consumeError) {
        if (String(consumeError.message).includes('INSUFFICIENT_CREDITS')) {
          return jsonResponse({ error: 'Not enough multi-post credits', code: 'INSUFFICIENT_CREDITS', needed: cost, credits: await getCredits(admin, wallet), skipped }, 402);
        }
        throw consumeError;
      }

      let sent = 0;
      let failed = 0;
      let refund = 0;
      let status = 'published';
      const errors: string[] = [];
      const platformsLog: unknown[] = [];

      if (targets.length) {
        const tiktokSettings = targets.find((t) => t.tiktok)?.tiktok;
        const payload: Record<string, unknown> = {
          content: link ? `${content}\n\n${link}` : content,
          mediaItems: media,
          platforms: targets.map((t) => t.entry),
          ...(tiktokSettings ? { tiktokSettings } : {}),
          ...(schedule ? { scheduledFor: schedule.toISOString().slice(0, 19), timezone: 'UTC' } : { publishNow: true }),
        };
        const res = await zernio('/posts', { method: 'POST', body: JSON.stringify(payload), headers: { 'x-request-id': crypto.randomUUID() } });
        const post = res.data?.post;
        if ((res.status >= 300 && res.status !== 207) || !post) {
          failed += targets.length;
          refund += targets.reduce((sum, t) => sum + creditsFor(t.account.platform), 0);
          errors.push(res.data?.error || 'Zernio rejected the post');
          platformsLog.push(...targets.map((t) => ({ platform: t.account.platform, accountId: t.account._id, status: 'failed' })));
        } else {
          status = post.status;
          for (const p of post.platforms ?? []) {
            platformsLog.push(p);
            if (p.status === 'failed') {
              failed++;
              refund += creditsFor(p.platform);
              if (p.errorMessage) errors.push(p.errorMessage);
            } else {
              sent++;
            }
          }
        }
      }

      if (farcaster) {
        const embeds = [link, media[0]?.url].filter(Boolean) as string[];
        const cast = await publishCast(farcaster.signer_uuid, content, embeds);
        platformsLog.push({ platform: 'farcaster', status: cast.ok ? 'published' : 'failed', hash: cast.hash, errorMessage: cast.error });
        if (cast.ok) sent++;
        else {
          failed++;
          refund += creditsFor('farcaster');
          if (cast.error) errors.push(cast.error);
        }
      }

      let credits = Number(remaining);
      if (refund > 0) {
        const { data: refunded } = await admin.rpc('social_credit_refund', { p_wallet: wallet, p_n: refund });
        credits = Number(refunded ?? credits + refund);
      }

      await admin.from('social_crossposts').insert({
        wallet_address: wallet,
        platforms: platformsLog,
        credits_charged: cost,
        credits_refunded: refund,
        scheduled_for: schedule?.toISOString() ?? null,
        status: sent === 0 ? 'failed' : failed ? 'partial' : status,
        error: errors.length ? errors.join('; ') : null,
      });

      if (sent === 0) {
        return jsonResponse({ ok: false, error: errors[0] || 'The platforms rejected this post. Your credits were refunded.', skipped, credits }, 502);
      }
      return jsonResponse({ ok: true, scheduled: !!schedule, sent, failed, skipped, credits, charged: cost - refund });
    }

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('[multipost]', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'multipost failed' }, 500);
  }
});
