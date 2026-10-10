import { getBadgeName, badgeScaleForPrice, parseBadgeLock } from '../src/lib/staking-badge-rules.ts';
import { badgePosterBounds } from '../src/lib/badge-poster-bounds.ts';
import { STREAMER_BADGE_IDS, streamerBadgeBounds, streamerBadgeSvg } from '../src/lib/streamer-badge-art.ts';
import { pollHasEnded, pollVotePercent, pollOptionWins } from '../src/lib/poll-results.ts';
import { plainPostText } from './post-share-card.js';

const API = 'https://api.dehub.io/api';
const number = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;

async function publicJson(path, missingIsEmpty = false) {
  try {
    const response = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(3000), redirect: 'manual', headers: { Accept: 'application/json' } });
    if (response.status === 404 && missingIsEmpty) return { status: false, result: null };
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

export function publicPollResult(raw, tokenId, now = Date.now()) {
  if (!raw || String(raw.tokenId) !== String(tokenId) || !Array.isArray(raw.options) || raw.options.length < 2) return null;
  const ended = pollHasEnded(raw, now);
  const totalVotes = number(raw.totalVotes);
  const topCount = Math.max(0, ...raw.options.map(option => number(option.voteCount)));
  return {
    question: plainPostText(raw.question), ended,
    // An anonymous preview never reveals results from an open poll.
    totalVotes: ended ? totalVotes : null,
    options: raw.options.slice(0, 4).map(option => ({
      index: number(option.index), text: plainPostText(option.text),
      count: ended ? number(option.voteCount) : null,
      percent: ended ? pollVotePercent(number(option.voteCount), totalVotes) : null,
      winner: pollOptionWins(number(option.voteCount), topCount, ended),
    })),
  };
}

export function publicProfileBadges(profile, progress, price, isNew = false) {
  if (!profile) return [];
  const badges = [];
  if (profile.hideBadgeAndBalance !== true) {
    const balance = profile.badgeBalance || (Array.isArray(profile.balanceData)
      ? profile.balanceData.reduce((sum, row) => sum + number(row.walletBalance) + number(row.staked), 0) : 0);
    const name = getBadgeName(balance, profile.username, {
      scale: badgeScaleForPrice(price), lock: parseBadgeLock(profile.badgeLock),
    });
    if (name) {
      const slug = name.toLowerCase().replace(/ /g, '-');
      const bounds = name === 'Killer Whale' ? [19, 17, 109, 121] : badgePosterBounds[name];
      if (bounds) badges.push({ kind: 'staking', name, slug, bounds, canvas: 128 });
    }
  }
  const equipped = progress?.cards?.find(card => card.id === progress.selectedBadgeId && card.earnedAt);
  if (progress?.totalStreams > 0 && equipped && STREAMER_BADGE_IDS.includes(equipped.id)) {
    const { left, top, right, bottom } = streamerBadgeBounds(equipped.id, 'system');
    badges.push({ kind: 'streamer', name: equipped.id, bounds: [left, top, right, bottom], canvas: 120 });
  }
  if (isNew) badges.push({ kind: 'new', name: 'New' });
  return badges;
}

/** Only called after the anonymous post has passed all public-content gates. */
export async function loadPostShareDetails(data, { rows, price } = {}) {
  const [account, pollResponse, tokenPrice] = await Promise.all([
    data.handle ? publicJson(`/account_info/${encodeURIComponent(data.handle)}`) : null,
    publicJson(`/poll/${data.tokenId}`, true),
    price?.().catch(() => null),
  ]);
  const profile = account?.status !== false ? account?.result : null;
  const rawAddress = profile?.address || profile?.wallet_address;
  const address = typeof rawAddress === 'string' && /^0x[\da-f]{40}$/i.test(rawAddress) ? rawAddress.toLowerCase() : '';
  const [progressResponse, memberRows] = address ? await Promise.all([
    publicJson(`/live/creator/${address}/progress?collection=20`),
    rows?.(`new_members?select=joined_at&wallet_address=eq.${address}&joined_at=gte.${encodeURIComponent(new Date(Date.now() - 30 * 86400000).toISOString())}&limit=1`).catch(() => null),
  ]) : [null, []];
  const progress = progressResponse?.result ?? progressResponse;
  const complete = !!account && !!pollResponse && (!address || (!!progressResponse && Array.isArray(memberRows)));
  return {
    ...data,
    author: plainPostText(profile?.displayName || profile?.display_name) || data.author,
    badges: publicProfileBadges(profile, progress, tokenPrice?.prices?.DHB, !!memberRows?.length),
    poll: publicPollResult(pollResponse?.status !== false ? pollResponse?.result : null, data.tokenId),
    detailsComplete: complete,
  };
}

export function streamerShareSvg(badge) {
  return streamerBadgeSvg(badge.name, 'system', true, `share-${badge.name}`, 'compact');
}
