// Multi-posting through Zernio (https://docs.zernio.com).
//
// Each dehub wallet gets one Zernio profile; connected platform accounts hang
// off it. Posting spends one credit per platform delivered, charged up front
// and refunded for any platform Zernio rejects on the spot.

import { checkRateLimit, handleCorsPreflight, jsonResponse, requireDeHubAuth, serviceClient } from '../_shared/auth.ts';
import { claimDhbPayment, DHB_TREASURY } from '../_shared/dhb-transfer.ts';
import { BUNDLE_STOPS, MAX_TOPUP_POSTS, PRICE_PER_POST_USD, bundleDiscount, bundlePriceUsd } from '../_shared/social-pricing.ts';

const ZERNIO = 'https://zernio.com/api/v1';
const DHB_BASE = '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c';

const PLATFORMS = [
  'twitter', 'instagram', 'facebook', 'youtube', 'tiktok', 'linkedin',
  'threads', 'pinterest', 'reddit', 'googlebusiness', 'snapchat', 'discord',
] as const;
type Platform = typeof PLATFORMS[number];

const TEXT_LIMIT: Partial<Record<Platform, number>> = {
  twitter: 280, threads: 500, instagram: 2200, tiktok: 2200, linkedin: 3000, pinterest: 800, googlebusiness: 1500,
};

// Paying slightly under the quote is allowed so a price tick between quote and
// confirmation does not strand a transfer that already left the wallet.
const PRICE_SLACK = 0.95;

type Admin = ReturnType<typeof serviceClient>;

interface ZAccount { _id: string; platform: string; username?: string; displayName?: string; isActive?: boolean }
interface MediaItem { url: string; type: 'image' | 'video' | 'gif' | 'document' }

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

async function listAccounts(profileId: string | null): Promise<ZAccount[]> {
  if (!profileId) return [];
  const res = await zernio(`/accounts?profileId=${encodeURIComponent(profileId)}`);
  const accounts: ZAccount[] = res.data?.accounts ?? [];
  return accounts.filter((a) => a.isActive !== false);
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

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }
  const action = String(body?.action ?? '');

  // Pricing is public so the slider can render before sign-in.
  if (action === 'pricing') {
    return jsonResponse({ pricePerPostUsd: PRICE_PER_POST_USD, stops: BUNDLE_STOPS, platforms: PLATFORMS });
  }

  const auth = await requireDeHubAuth(req);
  if (!auth.ok) return auth.response;
  const wallet = auth.wallet;
  const admin = serviceClient();

  try {
    if (action === 'status') {
      const profileId = await getProfileId(admin, wallet, false);
      const [accounts, credits] = await Promise.all([listAccounts(profileId), getCredits(admin, wallet)]);
      return jsonResponse({
        credits,
        accounts: accounts.map((a) => ({ id: a._id, platform: a.platform, username: a.username ?? a.displayName ?? '' })),
        pricePerPostUsd: PRICE_PER_POST_USD,
        platforms: PLATFORMS,
      });
    }

    if (action === 'quote') {
      const posts = Math.floor(Number(body.posts));
      if (!Number.isFinite(posts) || posts < 1 || posts > MAX_TOPUP_POSTS) return jsonResponse({ error: 'Invalid number of posts' }, 400);
      const price = await getDhbPriceUsd();
      if (!price) return jsonResponse({ error: 'DHB price unavailable, try again shortly' }, 503);
      const usd = bundlePriceUsd(posts);
      return jsonResponse({
        posts,
        usd,
        discount: bundleDiscount(posts),
        dhb: Math.ceil(usd / price),
        dhbPriceUsd: price,
        treasury: DHB_TREASURY,
      });
    }

    if (action === 'topup') {
      const posts = Math.floor(Number(body.posts));
      const txHash = String(body.txHash ?? '');
      if (!Number.isFinite(posts) || posts < 1 || posts > MAX_TOPUP_POSTS) return jsonResponse({ error: 'Invalid number of posts' }, 400);
      const price = await getDhbPriceUsd();
      if (!price) return jsonResponse({ error: 'DHB price unavailable, try again shortly' }, 503);
      const usd = bundlePriceUsd(posts);
      const minimumDhb = Math.floor((usd / price) * PRICE_SLACK);
      const payment = await claimDhbPayment(txHash, wallet, minimumDhb, 'social', admin);
      if (!payment.ok) return jsonResponse({ error: payment.reason }, 402);

      const { data: balance, error } = await admin.rpc('social_credit_add', {
        p_wallet: wallet, p_tx_hash: payment.hash, p_chain: payment.chain, p_dhb: payment.dhb,
        p_price: price, p_usd: Math.round(payment.dhb * price * 1e6) / 1e6, p_posts: posts, p_discount: bundleDiscount(posts),
      });
      if (error) {
        if (String(error.message).includes('TX_ALREADY_CREDITED')) {
          return jsonResponse({ ok: true, alreadyCredited: true, credits: await getCredits(admin, wallet) });
        }
        throw error;
      }
      return jsonResponse({ ok: true, credits: Number(balance), added: posts });
    }

    if (action === 'connect') {
      const platform = String(body.platform ?? '') as Platform;
      const redirectUrl = String(body.redirectUrl ?? '');
      if (!PLATFORMS.includes(platform)) return jsonResponse({ error: 'Unsupported platform' }, 400);
      if (!isAllowedRedirect(redirectUrl)) return jsonResponse({ error: 'Invalid redirect' }, 400);
      const profileId = await getProfileId(admin, wallet, true);
      const res = await zernio(`/connect/${platform}?profileId=${encodeURIComponent(profileId!)}&redirect_url=${encodeURIComponent(redirectUrl)}`);
      if (!res.data?.authUrl) return jsonResponse({ error: res.data?.error || 'Could not start the connection.' }, res.status >= 400 ? res.status : 502);
      return jsonResponse({ authUrl: res.data.authUrl });
    }

    if (action === 'disconnect') {
      const accountId = String(body.accountId ?? '');
      const accounts = await listAccounts(await getProfileId(admin, wallet, false));
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
      let content = String(body.content ?? '').slice(0, 5000);
      const link = typeof body.link === 'string' && /^https:\/\/([a-z0-9-]+\.)*dehub\.io\//.test(body.link) ? body.link : '';

      const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
      if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return jsonResponse({ error: 'Invalid schedule time' }, 400);
      const schedule = scheduledAt && scheduledAt.getTime() > Date.now() + 60_000 ? scheduledAt : null;

      const accounts = (await listAccounts(await getProfileId(admin, wallet, false))).filter((a) => requested.includes(a._id));
      if (!accounts.length) return jsonResponse({ error: 'No connected accounts selected' }, 400);

      const skipped: { accountId: string; platform: string; reason: string }[] = [];
      const targets: { account: ZAccount; entry: Record<string, unknown>; tiktok?: Record<string, unknown> }[] = [];
      for (const account of accounts) {
        const reason = incompatibility(account.platform, media, content);
        if (reason) { skipped.push({ accountId: account._id, platform: account.platform, reason }); continue; }
        const extras = await platformExtras(account.platform, account._id, content);
        if (extras.skip) { skipped.push({ accountId: account._id, platform: account.platform, reason: extras.skip }); continue; }
        const limit = TEXT_LIMIT[account.platform as Platform];
        const withLink = link ? `${content}\n\n${link}` : content;
        const text = limit && withLink.length > limit ? clip(content, limit - (link ? link.length + 2 : 0)) + (link ? `\n\n${link}` : '') : withLink;
        targets.push({
          account,
          entry: { platform: account.platform, accountId: account._id, customContent: text, ...(extras.data ? { platformSpecificData: extras.data } : {}) },
          tiktok: extras.tiktok,
        });
      }
      if (!targets.length) return jsonResponse({ ok: false, error: 'None of the selected accounts can take this post', skipped }, 400);

      const cost = targets.length;
      const { data: remaining, error: consumeError } = await admin.rpc('social_credit_consume', { p_wallet: wallet, p_n: cost });
      if (consumeError) {
        if (String(consumeError.message).includes('INSUFFICIENT_CREDITS')) {
          return jsonResponse({ error: 'Not enough multi-post credits', code: 'INSUFFICIENT_CREDITS', needed: cost, credits: await getCredits(admin, wallet), skipped }, 402);
        }
        throw consumeError;
      }

      content = link ? `${content}\n\n${link}` : content;
      const tiktokSettings = targets.find((t) => t.tiktok)?.tiktok;
      const payload: Record<string, unknown> = {
        content,
        mediaItems: media,
        platforms: targets.map((t) => t.entry),
        ...(tiktokSettings ? { tiktokSettings } : {}),
        ...(schedule ? { scheduledFor: schedule.toISOString().slice(0, 19), timezone: 'UTC' } : { publishNow: true }),
      };

      const res = await zernio('/posts', { method: 'POST', body: JSON.stringify(payload), headers: { 'x-request-id': crypto.randomUUID() } });
      const post = res.data?.post;
      let failed = 0;
      if ((res.status >= 300 && res.status !== 207) || !post) {
        failed = cost;
      } else {
        failed = (post.platforms ?? []).filter((p: any) => p.status === 'failed').length;
      }

      let credits = Number(remaining);
      if (failed > 0) {
        const { data: refunded } = await admin.rpc('social_credit_refund', { p_wallet: wallet, p_n: failed });
        credits = Number(refunded ?? credits + failed);
      }

      await admin.from('social_crossposts').insert({
        wallet_address: wallet,
        zernio_post_id: post?._id ?? null,
        platforms: (post?.platforms ?? targets.map((t) => ({ platform: t.account.platform, accountId: t.account._id }))),
        credits_charged: cost,
        credits_refunded: failed,
        scheduled_for: schedule?.toISOString() ?? null,
        status: post?.status ?? 'failed',
        error: failed ? (res.data?.error ?? (post?.platforms ?? []).map((p: any) => p.errorMessage).filter(Boolean).join('; ') || null) : null,
      });

      if (failed === cost) {
        return jsonResponse({ ok: false, error: res.data?.error || 'The platforms rejected this post. Your credits were refunded.', skipped, credits }, 502);
      }
      return jsonResponse({
        ok: true,
        status: post.status,
        scheduled: !!schedule,
        sent: cost - failed,
        failed,
        skipped,
        credits,
      });
    }

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('[multipost]', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'multipost failed' }, 500);
  }
});
