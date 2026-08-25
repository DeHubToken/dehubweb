/**
 * Data Portability
 * ================
 * Export everything this account has built up on DeHub as one JSON file, and
 * import that file into another account.
 *
 * The point is the import. A list of accounts you follow is not portable data
 * if moving it means following 200 people by hand — so the file carries
 * addresses, and importing re-follows them, recreates the bookmark folders by
 * name, restores blocks, follow groups and playback preferences.
 *
 * Everything here runs against APIs the app already uses. There is no bulk
 * follow endpoint, so the import walks the list a few at a time: the API
 * throttles bursts, and a run that trips the limit half way is worse than one
 * that takes a minute.
 *
 * @module lib/data-portability
 */

import {
  getFollowList,
  followUser,
  getBlockListPaginated,
  blockUser,
  getSavedPosts,
  getBookmarkFolders,
  createBookmarkFolder,
  getFolderItems,
  addItemsToFolderBulk,
} from '@/lib/api/dehub';
import { readGroups, sanitiseGroups, writeGroups, type FollowGroup } from '@/lib/follow-groups';
import { getCreatorPlaybackRates, setCreatorPlaybackRates } from '@/lib/video-preferences';

export const EXPORT_FORMAT = 'dehub-export';
export const EXPORT_VERSION = 1;

/** Page sizes and ceilings — an export is a snapshot, not a database dump. */
const PAGE = 100;
const MAX_FOLLOW_PAGES = 20;   // 2,000 accounts
const MAX_BLOCK_PAGES = 5;     // 500 blocks
const MAX_SAVED_PAGES = 10;    // 1,000 saved posts
const MAX_FOLDER_ITEMS = 200;

/** Concurrency for the import's write calls. Deliberately small. */
const WRITE_CONCURRENCY = 3;
const WRITE_PAUSE_MS = 120;

export interface ExportedAccount {
  address: string;
  username?: string;
  displayName?: string;
}

export interface ExportedFolder {
  name: string;
  description?: string;
  tokenIds: number[];
}

export interface DeHubDataExport {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  account: ExportedAccount;
  following: ExportedAccount[];
  blocked: ExportedAccount[];
  followGroups: FollowGroup[];
  bookmarkFolders: ExportedFolder[];
  savedPosts: number[];
  preferences: {
    hideWatched: boolean;
    channelSpeeds: Record<string, number>;
  };
}

export interface ImportPlan {
  data: DeHubDataExport;
  /** Accounts in the file that this account does not already follow. */
  toFollow: ExportedAccount[];
  alreadyFollowing: number;
  toBlock: ExportedAccount[];
  foldersToCreate: string[];
  foldersToFill: number;
  groups: number;
}

export interface ImportResult {
  followed: number;
  followFailed: number;
  blocked: number;
  foldersCreated: number;
  itemsFiled: number;
  groupsRestored: number;
}

const lower = (value?: string | null) => (value ?? '').toLowerCase();

async function collectFollowing(address: string): Promise<ExportedAccount[]> {
  const out: ExportedAccount[] = [];
  for (let page = 1; page <= MAX_FOLLOW_PAGES; page++) {
    const { items, pagination } = await getFollowList(address, 'following', { page, limit: PAGE });
    for (const item of items) {
      if (!item?.address) continue;
      out.push({ address: lower(item.address), username: item.username, displayName: item.displayName });
    }
    if (!pagination?.hasMore) break;
  }
  return out;
}

async function collectBlocked(): Promise<ExportedAccount[]> {
  const out: ExportedAccount[] = [];
  for (let page = 1; page <= MAX_BLOCK_PAGES; page++) {
    const res = await getBlockListPaginated(page, PAGE);
    for (const item of res.items ?? []) {
      if (!item?.address) continue;
      out.push({ address: lower(item.address), username: item.username, displayName: item.displayName });
    }
    if (page >= (res.pages || 1)) break;
  }
  return out;
}

async function collectSaved(): Promise<number[]> {
  const out: number[] = [];
  for (let page = 1; page <= MAX_SAVED_PAGES; page++) {
    const res = await getSavedPosts(page, PAGE);
    const items = res.result ?? [];
    for (const nft of items) {
      const id = Number(nft?.tokenId);
      if (Number.isFinite(id)) out.push(id);
    }
    if (!(res.pagination?.hasMore ?? items.length >= PAGE)) break;
  }
  return out;
}

async function collectFolders(): Promise<ExportedFolder[]> {
  const res = await getBookmarkFolders();
  const folders = res.result ?? [];
  const out: ExportedFolder[] = [];
  for (const folder of folders) {
    let tokenIds: number[] = [];
    if (folder.itemCount) {
      try {
        const items = await getFolderItems(folder._id, 1, MAX_FOLDER_ITEMS);
        tokenIds = (items.result ?? [])
          .map(item => Number(item.tokenId))
          .filter(id => Number.isFinite(id));
      } catch {
        // One unreadable folder must not sink the whole export.
      }
    }
    out.push({ name: folder.name, description: folder.description, tokenIds });
  }
  return out;
}

/** Read the hide-watched switch without importing the hook that owns it. */
function readHideWatched(): boolean {
  try {
    return localStorage.getItem('feed-hide-watched') === 'true';
  } catch {
    return false;
  }
}

export async function buildExport(account: ExportedAccount): Promise<DeHubDataExport> {
  const address = lower(account.address);
  // Independent reads — one slow endpoint should not serialise the rest.
  const [following, blocked, savedPosts, bookmarkFolders] = await Promise.all([
    collectFollowing(address).catch(() => []),
    collectBlocked().catch(() => []),
    collectSaved().catch(() => []),
    collectFolders().catch(() => []),
  ]);

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    account: { ...account, address },
    following,
    blocked,
    followGroups: readGroups(),
    bookmarkFolders,
    savedPosts,
    preferences: {
      hideWatched: readHideWatched(),
      channelSpeeds: getCreatorPlaybackRates(),
    },
  };
}

/** Hand the file to the browser. */
export function downloadExport(data: DeHubDataExport) {
  const stamp = data.exportedAt.slice(0, 10);
  const name = data.account.username || data.account.address.slice(0, 8);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `dehub-${name}-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick: Safari cancels the download if the URL dies first.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseExport(raw: string): DeHubDataExport {
  const parsed = JSON.parse(raw);
  if (!parsed || parsed.format !== EXPORT_FORMAT) {
    throw new Error('That is not a DeHub export file.');
  }
  if (Number(parsed.version) > EXPORT_VERSION) {
    throw new Error('That file was made by a newer version of DeHub.');
  }
  return {
    format: EXPORT_FORMAT,
    version: Number(parsed.version) || 1,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
    account: parsed.account ?? { address: '' },
    following: Array.isArray(parsed.following) ? parsed.following : [],
    blocked: Array.isArray(parsed.blocked) ? parsed.blocked : [],
    followGroups: sanitiseGroups(parsed.followGroups),
    bookmarkFolders: Array.isArray(parsed.bookmarkFolders) ? parsed.bookmarkFolders : [],
    savedPosts: Array.isArray(parsed.savedPosts) ? parsed.savedPosts : [],
    preferences: {
      hideWatched: parsed.preferences?.hideWatched === true,
      channelSpeeds: parsed.preferences?.channelSpeeds ?? {},
    },
  };
}

/**
 * Work out what an import would actually do, so it can be shown before it
 * happens rather than described afterwards.
 */
export async function planImport(data: DeHubDataExport, selfAddress: string): Promise<ImportPlan> {
  const self = lower(selfAddress);
  const [existingFollows, existingFolders] = await Promise.all([
    collectFollowing(self).catch(() => [] as ExportedAccount[]),
    getBookmarkFolders().then(r => r.result ?? []).catch(() => []),
  ]);

  const followed = new Set(existingFollows.map(f => lower(f.address)));
  const candidates = data.following.filter(a => {
    const addr = lower(a.address);
    return !!addr && addr !== self;
  });
  const toFollow = candidates.filter(a => !followed.has(lower(a.address)));

  const folderNames = new Set(existingFolders.map(f => f.name.toLowerCase()));
  const foldersToCreate = data.bookmarkFolders
    .map(f => f.name)
    .filter(name => !!name && !folderNames.has(name.toLowerCase()));

  return {
    data,
    toFollow,
    alreadyFollowing: candidates.length - toFollow.length,
    toBlock: data.blocked.filter(a => !!lower(a.address) && lower(a.address) !== self),
    foldersToCreate,
    foldersToFill: data.bookmarkFolders.filter(f => f.tokenIds.length > 0).length,
    groups: data.followGroups.length,
  };
}

/** Run `tasks` a few at a time, counting how many resolved. */
async function runThrottled<T>(items: T[], task: (item: T) => Promise<unknown>): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < items.length; i += WRITE_CONCURRENCY) {
    const batch = items.slice(i, i + WRITE_CONCURRENCY);
    const settled = await Promise.allSettled(batch.map(task));
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') ok++;
      else failed++;
    }
    if (i + WRITE_CONCURRENCY < items.length) {
      await new Promise(resolve => setTimeout(resolve, WRITE_PAUSE_MS));
    }
  }
  return { ok, failed };
}

/**
 * Apply a plan. Local preferences go first — they are instant and cannot fail
 * — then the network work, so a run that dies half way still leaves the cheap
 * half applied.
 */
export async function applyImport(
  plan: ImportPlan,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const { data } = plan;

  // ── Local ──────────────────────────────────────────────────────────────
  if (data.followGroups.length) {
    const existing = readGroups();
    const seen = new Set(existing.map(g => g.name.toLowerCase()));
    writeGroups([...existing, ...data.followGroups.filter(g => !seen.has(g.name.toLowerCase()))]);
  }
  if (Object.keys(data.preferences.channelSpeeds).length) {
    setCreatorPlaybackRates({ ...getCreatorPlaybackRates(), ...data.preferences.channelSpeeds });
  }
  try {
    localStorage.setItem('feed-hide-watched', String(data.preferences.hideWatched));
  } catch { /* ignore */ }

  const total = plan.toFollow.length + plan.toBlock.length + data.bookmarkFolders.length;
  let done = 0;
  const tick = () => { done++; onProgress?.(done, total); };

  // ── Follows ────────────────────────────────────────────────────────────
  const follows = await runThrottled(plan.toFollow, async (account) => {
    await followUser(account.address);
    tick();
  });

  // ── Blocks ─────────────────────────────────────────────────────────────
  const blocks = await runThrottled(plan.toBlock, async (account) => {
    await blockUser(account.address);
    tick();
  });

  // ── Folders ────────────────────────────────────────────────────────────
  let foldersCreated = 0;
  let itemsFiled = 0;
  const existingFolders = await getBookmarkFolders().then(r => r.result ?? []).catch(() => []);
  const byName = new Map<string, string>(existingFolders.map(f => [f.name.toLowerCase(), f._id] as const));

  for (const folder of data.bookmarkFolders) {
    if (!folder?.name) { tick(); continue; }
    try {
      let folderId = byName.get(folder.name.toLowerCase());
      if (!folderId) {
        const created = await createBookmarkFolder({ name: folder.name, description: folder.description });
        folderId = created.result?._id;
        if (folderId) {
          byName.set(folder.name.toLowerCase(), folderId);
          foldersCreated++;
        }
      }
      if (folderId && folder.tokenIds.length) {
        await addItemsToFolderBulk(folderId, folder.tokenIds);
        itemsFiled += folder.tokenIds.length;
      }
    } catch {
      // A folder that will not take its items is not a reason to abandon the
      // rest of the import.
    }
    tick();
  }

  return {
    followed: follows.ok,
    followFailed: follows.failed,
    blocked: blocks.ok,
    foldersCreated,
    itemsFiled,
    groupsRestored: data.followGroups.length,
  };
}
