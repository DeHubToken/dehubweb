import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Community Administration Hooks
 * ===============================
 * Every privileged community action goes through a SECURITY DEFINER RPC rather
 * than a direct table write. The database is the authority on who may do what;
 * the `can()` helper below only mirrors those rules so the UI can hide controls
 * the server would reject anyway.
 */

import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { translateCopy as _translateCopy } from '@/i18n/copy';
import type { Community, CommunityMember } from '@/hooks/use-communities';

// ─── Rights ──────────────────────────────────────────────────────────────────

export const ADMIN_RIGHTS = [
  { key: 'change_info',      get label() { return _translateCopy("copy.e1cf4fb834a7", { defaultValue: "Change community info" }); }, get hint() { return _translateCopy("copy.6efa129ffc5d", { defaultValue: "Name, description, avatar, banner and ticker" }); } },
  { key: 'delete_messages',  get label() { return _translateCopy("copy.708b60941566", { defaultValue: "Delete messages" }); }, get hint() { return _translateCopy("copy.2471878adf9f", { defaultValue: "Remove any message from the chat" }); } },
  { key: 'restrict_members', get label() { return _translateCopy("copy.6e0921c6c48a", { defaultValue: "Ban users" }); }, get hint() { return _translateCopy("copy.042fe48cc94f", { defaultValue: "Approve, mute, ban and remove members" }); } },
  { key: 'invite_users',     get label() { return _translateCopy("copy.32bb1a843217", { defaultValue: "Invite users via link" }); }, get hint() { return _translateCopy("copy.7739af962ec9", { defaultValue: "Create and revoke invite links" }); } },
  { key: 'pin_messages',     get label() { return _translateCopy("copy.d25966790478", { defaultValue: "Pin messages" }); }, get hint() { return _translateCopy("copy.3c4ea43f652c", { defaultValue: "Pin a message to the top of the chat" }); } },
  { key: 'manage_events',    get label() { return _translateCopy("copy.9d0aa070ff87", { defaultValue: "Manage events" }); }, get hint() { return _translateCopy("copy.f2a819b334db", { defaultValue: "Edit and remove community events" }); } },
  { key: 'add_admins',       get label() { return _translateCopy("copy.58287b1ebe9e", { defaultValue: "Add new admins" }); }, get hint() { return _translateCopy("copy.712c5cee22ab", { defaultValue: "Promote members to admin. Only the owner can demote one" }); } },
  { key: 'remain_anonymous', get label() { return _translateCopy("copy.f31a396d38f6", { defaultValue: "Remain anonymous" }); }, get hint() { return _translateCopy("copy.8e8d20d6c719", { defaultValue: "Hide the admin badge on this account" }); } },
] as const;

export type AdminRight = (typeof ADMIN_RIGHTS)[number]['key'];

export const MEMBER_RIGHTS = [
  { key: 'send_messages', get label() { return _translateCopy("copy.27a3f5335350", { defaultValue: "Send messages" }); }, get hint() { return _translateCopy("copy.de36d7d2949b", { defaultValue: "Post in the community chat" }); } },
  { key: 'send_media',    get label() { return _translateCopy("copy.708d98ff019c", { defaultValue: "Send media" }); }, get hint() { return _translateCopy("copy.bd438e587ff4", { defaultValue: "Attach images and GIFs" }); } },
  { key: 'embed_links',   get label() { return _translateCopy("copy.2737af7ac8aa", { defaultValue: "Embed links" }); }, get hint() { return _translateCopy("copy.1a1dd5fb913d", { defaultValue: "Show link previews" }); } },
  { key: 'add_members',   get label() { return _translateCopy("copy.d600b9239ea2", { defaultValue: "Add members" }); }, get hint() { return _translateCopy("copy.bf7584afb7c5", { defaultValue: "Share the community with others" }); } },
  { key: 'create_events', get label() { return _translateCopy("copy.dfb39b614c22", { defaultValue: "Create events" }); }, get hint() { return _translateCopy("copy.149eedd00eb1", { defaultValue: "Schedule community events" }); } },
  { key: 'pin_messages',  get label() { return _translateCopy("copy.d25966790478", { defaultValue: "Pin messages" }); }, get hint() { return _translateCopy("copy.3c4ea43f652c", { defaultValue: "Pin a message to the top of the chat" }); } },
  { key: 'change_info',   get label() { return _translateCopy("copy.44937f6efcbb", { defaultValue: "Change info" }); }, get hint() { return _translateCopy("copy.9cf5ecd7bb2e", { defaultValue: "Edit the community name and description" }); } },
] as const;

export type MemberRight = (typeof MEMBER_RIGHTS)[number]['key'];
export type CommunityRight = AdminRight | MemberRight;

/** Rights a freshly promoted admin gets, matching Telegram's defaults. */
export const DEFAULT_ADMIN_PERMISSIONS: Record<AdminRight, boolean> = {
  change_info: true,
  delete_messages: true,
  restrict_members: true,
  invite_users: true,
  pin_messages: true,
  manage_events: true,
  add_admins: false,
  remain_anonymous: false,
};

export const DEFAULT_MEMBER_PERMISSIONS: Record<MemberRight, boolean> = {
  send_messages: true,
  send_media: true,
  embed_links: true,
  add_members: true,
  create_events: true,
  pin_messages: false,
  change_info: false,
};

const MUTING_RIGHTS: CommunityRight[] = ['send_messages', 'send_media', 'embed_links'];

/**
 * A timed ban whose clock has run out is not a ban. Nothing sweeps those rows
 * back to 'active', so the database resolves expiry on read — community_permission
 * and community_is_active_member both special-case it, as does the rejoin policy.
 * The client has to agree, or every duration in the ban picker means "forever".
 */
export function isEffectivelyActive(member: CommunityMember | null | undefined): boolean {
  if (!member) return false;
  if (member.status === 'active') return true;
  if (member.status !== 'banned' || !member.banned_until) return false;
  const until = new Date(member.banned_until).getTime();
  return !Number.isNaN(until) && until <= Date.now();
}

/** True only while a ban is still running. */
export function isActivelyBanned(member: CommunityMember | null | undefined): boolean {
  return member?.status === 'banned' && !isEffectivelyActive(member);
}

/**
 * Client-side mirror of public.community_permission(). Kept deliberately in the
 * same order as the SQL so the two stay comparable when either changes.
 */
export function resolvePermission(
  community: Pick<Community, 'default_permissions'> | null | undefined,
  member: CommunityMember | null | undefined,
  right: CommunityRight,
): boolean {
  if (!isEffectivelyActive(member) || !member) return false;
  if (member.role === 'owner') return true;

  if (member.role === 'admin') {
    const granted = member.permissions?.[right];
    if (typeof granted === 'boolean') return granted;
  } else if (
    member.muted_until &&
    new Date(member.muted_until).getTime() > Date.now() &&
    MUTING_RIGHTS.includes(right)
  ) {
    return false;
  }

  return community?.default_permissions?.[right] === true;
}

/** Rights that put at least one tab in the Manage panel. */
const PANEL_RIGHTS: AdminRight[] = ['change_info', 'restrict_members', 'invite_users', 'add_admins'];

/** Every right that makes someone a moderator of any kind. */
const MODERATION_RIGHTS: AdminRight[] = [
  ...PANEL_RIGHTS, 'delete_messages', 'pin_messages', 'manage_events',
];

export interface CommunityAbilities {
  role: 'owner' | 'admin' | 'member' | null;
  isOwner: boolean;
  isAdmin: boolean;
  /** Any moderation power at all, including chat-only rights like pinning. */
  isModerator: boolean;
  /**
   * Would the Manage panel have at least one tab? An admin holding only
   * pin_messages moderates in the chat but has nothing to open, so the entry
   * points key off this rather than isModerator to avoid a dead button.
   */
  canManage: boolean;
  /**
   * change_info is also a *member* right ("edit the name and description"), so
   * it alone must not unlock privacy, slow mode or the default-permission map.
   * Those need rank as well — the server enforces the same split.
   */
  canManageSettings: boolean;
  isMuted: boolean;
  mutedUntil: Date | null;
  can: (right: CommunityRight) => boolean;
}

export function useCommunityAbilities(
  community: Community | null | undefined,
  membership: CommunityMember | null | undefined,
): CommunityAbilities {
  return useMemo(() => {
    const role = (isEffectivelyActive(membership) ? membership!.role : null) as CommunityAbilities['role'];
    const can = (right: CommunityRight) => resolvePermission(community, membership, right);
    const mutedUntil = membership?.muted_until ? new Date(membership.muted_until) : null;
    return {
      role,
      isOwner: role === 'owner',
      isAdmin: role === 'admin',
      isModerator: role === 'owner' || (role === 'admin' && MODERATION_RIGHTS.some(can)),
      canManage: role === 'owner' || (role === 'admin' && PANEL_RIGHTS.some(can)),
      canManageSettings: role === 'owner' || (role === 'admin' && can('change_info')),
      isMuted: role === 'member' && !!mutedUntil && mutedUntil.getTime() > Date.now(),
      mutedUntil,
      can,
    };
  }, [community, membership]);
}

/**
 * `remain_anonymous` hides an admin's shield and custom title from the room.
 * Moderators are exempt: someone who can act on members has to be able to see
 * who else moderates, or the roster would disagree with the Administrators tab
 * they are looking at in the same panel.
 */
export function isAdminBadgeHidden(
  member: CommunityMember | null | undefined,
  viewer: Pick<CommunityAbilities, 'isOwner' | 'can'>,
): boolean {
  if (member?.role !== 'admin') return false;
  if (member.permissions?.remain_anonymous !== true) return false;
  return !viewer.isOwner && !viewer.can('restrict_members') && !viewer.can('add_admins');
}

// ─── RPC plumbing ────────────────────────────────────────────────────────────

/**
 * The generated Supabase types predate these functions, so the rpc() name union
 * does not include them. Everything below is the single place that widens it.
 */
export async function callRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown>,
  walletAddress: string | null | undefined,
): Promise<T> {
  if (!walletAddress) throw new Error('not_authenticated');
  const { data, error } = await withWalletHeader(
    (supabase as any).rpc(fn, args),
    walletAddress,
  );
  if (error) throw error;
  return data as T;
}

const ERROR_COPY: Record<string, () => string> = {
  not_authenticated: () => _translateCopy("copy.d4eb6104ebd9", { defaultValue: "Connect your wallet first" }),
  cannot_moderate_yourself: () => _translateCopy("copy.018c5aecd6c3", { defaultValue: "You cannot do that to yourself" }),
  cannot_moderate_the_owner: () => _translateCopy("copy.04fcef5b5b26", { defaultValue: "The owner cannot be moderated" }),
  only_the_owner_can_moderate_an_admin: () => _translateCopy("copy.c0cafd3f4fda", { defaultValue: "Only the owner can moderate another admin" }),
  only_the_owner_can_transfer_ownership: () => _translateCopy("copy.2264da39007c", { defaultValue: "Only the owner can transfer ownership" }),
  only_the_owner_can_delete_a_community: () => _translateCopy("copy.82226ff838ca", { defaultValue: "Only the owner can delete this community" }),
  new_owner_must_be_an_active_member: () => _translateCopy("copy.f0c575ccd7be", { defaultValue: "Pick an active member to hand the community to" }),
  member_not_found: () => _translateCopy("copy.8202e88f9b4a", { defaultValue: "That member is no longer here" }),
  member_is_not_active: () => _translateCopy("copy.55d25bbc9a7c", { defaultValue: "That member is not active" }),
  member_is_not_banned: () => _translateCopy("copy.cbb2315229e5", { defaultValue: "That member is not banned" }),
  no_pending_request: () => _translateCopy("copy.9db7738dd45c", { defaultValue: "That request is no longer pending" }),
  message_not_found: () => _translateCopy("copy.9a064ac60abe", { defaultValue: "That message is already gone" }),
  role_must_be_admin_or_member: () => _translateCopy("copy.5e2c9b601cf1", { defaultValue: "Unsupported role" }),
  already_the_owner: () => _translateCopy("copy.c833a76e8f1a", { defaultValue: "They already own this community" }),
  membership_updates_require_rpc: () => _translateCopy("copy.68024bd2022b", { defaultValue: "That change is no longer allowed directly" }),
  cannot_join_on_behalf_of_another_wallet: () => _translateCopy("copy.07fac032f756", { defaultValue: "You can only join with your own wallet" }),
  cannot_post_as_another_wallet: () => _translateCopy("copy.e490c5f0bcb9", { defaultValue: "You can only post as yourself" }),
  cannot_edit_another_members_message: () => _translateCopy("copy.50164dfe3302", { defaultValue: "You can only edit your own messages" }),
  you_cannot_post_in_this_community: () => _translateCopy("copy.fa864aef958f", { defaultValue: "You do not have permission to post here" }),
  you_cannot_send_media_in_this_community: () => _translateCopy("copy.462380995d63", { defaultValue: "You do not have permission to send media here" }),
  you_are_banned_from_this_community: () => _translateCopy("copy.46ffd9568a13", { defaultValue: "You are banned from this community" }),
  invite_not_found: () => _translateCopy("copy.bf38732f4aad", { defaultValue: "That invite link does not exist" }),
  invite_revoked: () => _translateCopy("copy.1957c0d6df16", { defaultValue: "That invite link was revoked" }),
  invite_expired: () => _translateCopy("copy.817a32289f0a", { defaultValue: "That invite link has expired" }),
  invite_exhausted: () => _translateCopy("copy.b064bd1adffd", { defaultValue: "That invite link has reached its limit" }),
  invite_used: () => _translateCopy("copy.cde7a4affb8d", { defaultValue: "Invite accepted" }),
};

/** One whole sentence per right, so no language has to splice a label into "You do not have permission to …". */
const PERMISSION_DENIED_COPY: Record<string, () => string> = {
  change_info: () => _translateCopy("copy.105a7bda34ff", { defaultValue: "You do not have permission to change info" }),
  delete_messages: () => _translateCopy("copy.fe7e45703caf", { defaultValue: "You do not have permission to delete messages" }),
  restrict_members: () => _translateCopy("copy.76ae16eb8065", { defaultValue: "You do not have permission to ban users" }),
  invite_users: () => _translateCopy("copy.d835fb6c743c", { defaultValue: "You do not have permission to invite users via link" }),
  pin_messages: () => _translateCopy("copy.7813733a02b3", { defaultValue: "You do not have permission to pin messages" }),
  manage_events: () => _translateCopy("copy.002286513398", { defaultValue: "You do not have permission to manage events" }),
  add_admins: () => _translateCopy("copy.045c8cd3aa81", { defaultValue: "You do not have permission to add new admins" }),
  remain_anonymous: () => _translateCopy("copy.b31ff2d0eb1a", { defaultValue: "You do not have permission to remain anonymous" }),
  send_messages: () => _translateCopy("copy.26073cdcaa76", { defaultValue: "You do not have permission to send messages" }),
  send_media: () => _translateCopy("copy.deeab29dde62", { defaultValue: "You do not have permission to send media" }),
  embed_links: () => _translateCopy("copy.90c724915b1b", { defaultValue: "You do not have permission to embed links" }),
  add_members: () => _translateCopy("copy.b05480861091", { defaultValue: "You do not have permission to add members" }),
  create_events: () => _translateCopy("copy.6741361174ce", { defaultValue: "You do not have permission to create events" }),
};

/** Turns a raised Postgres condition into something worth showing a human. */
export function adminErrorMessage(error: unknown, fallback: string): string {
  const raw = String((error as { message?: string })?.message ?? '');
  if (!raw) return fallback;

  const permission = raw.match(/permission_denied:(\w+)/);
  if (permission) {
    const denied = PERMISSION_DENIED_COPY[permission[1]];
    return denied
      ? denied()
      : _translateCopy("copy.7b2d32bd2e67", { defaultValue: "You do not have permission to {{value1}}", value1: permission[1].replace(/_/g, ' ') });
  }

  const slow = raw.match(/slow_mode_active:(\d+)/);
  if (slow) {
    const seconds = Number(slow[1]);
    return seconds >= 60
      ? _translateCopy("copy.014892720459", { defaultValue: "Slow mode is on — one message every {{value1}} min", value1: Math.round(seconds / 60) })
      : _translateCopy("copy.52c789c095cf", { defaultValue: "Slow mode is on — one message every {{value1}}s", value1: seconds });
  }

  for (const [code, copy] of Object.entries(ERROR_COPY)) {
    if (raw.includes(code)) return copy();
  }
  return fallback;
}

/** Every cache a membership or settings change can invalidate. */
function invalidateCommunity(qc: QueryClient, communityId: string) {
  qc.invalidateQueries({ queryKey: ['communities', 'members', communityId] });
  qc.invalidateQueries({ queryKey: ['communities', 'pending-members', communityId] });
  qc.invalidateQueries({ queryKey: ['communities', 'banned-members', communityId] });
  qc.invalidateQueries({ queryKey: ['communities', 'membership', communityId] });
  qc.invalidateQueries({ queryKey: ['communities', 'admin-log', communityId] });
  qc.invalidateQueries({ queryKey: ['communities', 'discover'] });
  qc.invalidateQueries({ queryKey: ['communities', 'user'] });
}

/** Shared shape for the moderation mutations, which all key off a wallet. */
interface TargetVars {
  communityId: string;
  wallet: string;
  /** Only used for the toast, never sent to the server. */
  displayName?: string;
}

function useModerationMutation<V extends { communityId: string }>(
  build: (vars: V) => { fn: string; args: Record<string, unknown> },
  success: (vars: V) => string,
  failure: () => string,
) {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vars: V) => {
      const { fn, args } = build(vars);
      return callRpc(fn, args, walletAddress);
    },
    onSuccess: (_data, vars) => {
      invalidateCommunity(qc, vars.communityId);
      toast.success(success(vars));
    },
    onError: (error) => toast.error(adminErrorMessage(error, failure())),
  });
}

// ─── Membership moderation ───────────────────────────────────────────────────

export function useApproveMember() {
  return useModerationMutation<TargetVars>(
    v => ({ fn: 'community_approve_member', args: { _community_id: v.communityId, _target: v.wallet } }),
    v => (v.displayName
      ? _translateCopy("copy.b4923ce2de2c", { defaultValue: "{{value1}} approved", value1: v.displayName })
      : _translateCopy("copy.6c28a74c6e1d", { defaultValue: "Member approved" })),
    () => _translateCopy("copy.de0c2e40fd7a", { defaultValue: "Failed to approve" }),
  );
}

export function useRejectMember() {
  return useModerationMutation<TargetVars>(
    v => ({ fn: 'community_reject_member', args: { _community_id: v.communityId, _target: v.wallet } }),
    () => _translateCopy("copy.21b36b609f86", { defaultValue: "Request rejected" }),
    () => _translateCopy("copy.46960413b9a8", { defaultValue: "Failed to reject" }),
  );
}

export function useKickMember() {
  return useModerationMutation<TargetVars>(
    v => ({ fn: 'community_kick_member', args: { _community_id: v.communityId, _target: v.wallet } }),
    v => (v.displayName
      ? _translateCopy("copy.50f8429f0d7c", { defaultValue: "{{value1}} removed", value1: v.displayName })
      : _translateCopy("copy.5dcec1a428cd", { defaultValue: "Member removed" })),
    () => _translateCopy("copy.1cff79b7eb0b", { defaultValue: "Failed to remove member" }),
  );
}

export function useBanMember() {
  return useModerationMutation<TargetVars & { reason?: string; until?: string | null }>(
    v => ({
      fn: 'community_ban_member',
      args: {
        _community_id: v.communityId,
        _target: v.wallet,
        _reason: v.reason?.trim() || null,
        _until: v.until ?? null,
      },
    }),
    v => (v.displayName
      ? _translateCopy("copy.69117b59817b", { defaultValue: "{{value1}} banned", value1: v.displayName })
      : _translateCopy("copy.8fd51b2a8403", { defaultValue: "Member banned" })),
    () => _translateCopy("copy.3e127b875965", { defaultValue: "Failed to ban member" }),
  );
}

export function useUnbanMember() {
  return useModerationMutation<TargetVars>(
    v => ({ fn: 'community_unban_member', args: { _community_id: v.communityId, _target: v.wallet } }),
    v => (v.displayName
      ? _translateCopy("copy.af707a1ddd84", { defaultValue: "{{value1}} unbanned", value1: v.displayName })
      : _translateCopy("copy.1471e79421ff", { defaultValue: "Member unbanned" })),
    () => _translateCopy("copy.fa3f8b4f0df9", { defaultValue: "Failed to unban member" }),
  );
}

export function useMuteMember() {
  return useModerationMutation<TargetVars & { until?: string | null }>(
    v => ({
      fn: 'community_mute_member',
      args: { _community_id: v.communityId, _target: v.wallet, _until: v.until ?? null },
    }),
    v => {
      if (v.until) {
        return v.displayName
          ? _translateCopy("copy.99f61cc51979", { defaultValue: "{{value1}} muted", value1: v.displayName })
          : _translateCopy("copy.12e4a9a87c73", { defaultValue: "Member muted" });
      }
      return v.displayName
        ? _translateCopy("copy.76ffa3511068", { defaultValue: "{{value1}} muted indefinitely", value1: v.displayName })
        : _translateCopy("copy.31405b373d83", { defaultValue: "Member muted indefinitely" });
    },
    () => _translateCopy("copy.193a04ac4a9c", { defaultValue: "Failed to mute member" }),
  );
}

export function useUnmuteMember() {
  return useModerationMutation<TargetVars>(
    v => ({ fn: 'community_unmute_member', args: { _community_id: v.communityId, _target: v.wallet } }),
    v => (v.displayName
      ? _translateCopy("copy.47ad279da2d8", { defaultValue: "{{value1}} unmuted", value1: v.displayName })
      : _translateCopy("copy.5df3c2e740a8", { defaultValue: "Member unmuted" })),
    () => _translateCopy("copy.2f3648d86b9d", { defaultValue: "Failed to unmute member" }),
  );
}

export function useSetMemberRole() {
  return useModerationMutation<
    TargetVars & { role: 'admin' | 'member'; permissions?: Partial<Record<AdminRight, boolean>>; customTitle?: string | null }
  >(
    v => ({
      fn: 'community_set_member_role',
      args: {
        _community_id: v.communityId,
        _target: v.wallet,
        _role: v.role,
        _permissions: v.role === 'admin' ? { ...DEFAULT_ADMIN_PERMISSIONS, ...(v.permissions ?? {}) } : null,
        _custom_title: v.role === 'admin' ? (v.customTitle?.trim() || null) : null,
      },
    }),
    v => {
      if (v.role === 'admin') {
        return v.displayName
          ? _translateCopy("copy.795f6f567483", { defaultValue: "{{value1}} is now an admin", value1: v.displayName })
          : _translateCopy("copy.8295e7c45852", { defaultValue: "Member is now an admin" });
      }
      return v.displayName
        ? _translateCopy("copy.c7fbcf193b1d", { defaultValue: "{{value1}} is no longer an admin", value1: v.displayName })
        : _translateCopy("copy.1fa6b2294d22", { defaultValue: "Member is no longer an admin" });
    },
    () => _translateCopy("copy.e4143613f121", { defaultValue: "Failed to update role" }),
  );
}

export function useTransferOwnership() {
  return useModerationMutation<TargetVars>(
    v => ({ fn: 'community_transfer_ownership', args: { _community_id: v.communityId, _new_owner: v.wallet } }),
    v => (v.displayName
      ? _translateCopy("copy.e7028443a798", { defaultValue: "{{value1}} now owns this community", value1: v.displayName })
      : _translateCopy("copy.64a81dd4c9bb", { defaultValue: "Member now owns this community" })),
    () => _translateCopy("copy.b37288814357", { defaultValue: "Failed to transfer ownership" }),
  );
}

export function usePurgeMemberMessages() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vars: TargetVars) =>
      callRpc<number>('community_purge_member_messages', {
        _community_id: vars.communityId,
        _target: vars.wallet,
      }, walletAddress),
    onSuccess: (removed, vars) => {
      qc.invalidateQueries({ queryKey: ['community-chat-messages', vars.communityId] });
      qc.invalidateQueries({ queryKey: ['communities', 'admin-log', vars.communityId] });
      toast.success(removed
        ? _translateCopy("copy.ac929101ae36", { defaultValue: "Deleted {{count}} messages", count: removed })
        : _translateCopy("copy.890e0324b85b", { defaultValue: "No messages to delete" }));
    },
    onError: (error) => toast.error(adminErrorMessage(error, _translateCopy("copy.b9442cc89e40", { defaultValue: "Failed to delete messages" }))),
  });
}

// ─── Community settings ──────────────────────────────────────────────────────

export interface CommunitySettingsPatch {
  name?: string;
  description?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  is_private?: boolean;
  rules?: string[];
  slow_mode_seconds?: number;
  default_permissions?: Record<MemberRight, boolean>;
  ticker_symbol?: string | null;
  ticker_contract_address?: string | null;
  ticker_chain_id?: string | null;
  ticker_pair_address?: string | null;
}

export function useUpdateCommunitySettings() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ communityId, patch }: { communityId: string; patch: CommunitySettingsPatch }) =>
      callRpc<Community>('community_update_settings', { _community_id: communityId, _patch: patch }, walletAddress),
    onSuccess: (updated, { communityId }) => {
      if (updated?.slug) qc.setQueryData<Community>(['communities', 'slug', updated.slug], updated);
      qc.invalidateQueries({ queryKey: ['communities', 'discover'] });
      qc.invalidateQueries({ queryKey: ['communities', 'user'] });
      qc.invalidateQueries({ queryKey: ['communities', 'admin-log', communityId] });
      // Opening a community up auto-approves the queue behind it.
      qc.invalidateQueries({ queryKey: ['communities', 'pending-members', communityId] });
      qc.invalidateQueries({ queryKey: ['communities', 'members', communityId] });
    },
    onError: (error) => toast.error(adminErrorMessage(error, _translateCopy("copy.1b97419f8a5c", { defaultValue: "Failed to update community" }))),
  });
}

export function useDeleteCommunity() {
  const { t: _copy } = _useCopy();
  const { walletAddress } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (communityId: string) =>
      callRpc('community_delete', { _community_id: communityId }, walletAddress),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['communities'] });
      toast.success(_copy("copy.7793fc7ea486", { defaultValue: "Community deleted" }));
    },
    onError: (error) => toast.error(adminErrorMessage(error, _copy("copy.cd9a989be4a3", { defaultValue: "Failed to delete community" }))),
  });
}

// ─── Invite links ────────────────────────────────────────────────────────────

export interface CommunityInviteLink {
  id: string;
  community_id: string;
  code: string;
  name: string | null;
  created_by: string;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
  requires_approval: boolean;
  revoked_at: string | null;
  created_at: string;
}

export function inviteUrl(code: string) {
  return `${window.location.origin}/app/communities/join/${code}`;
}

export function useCommunityInvites(communityId: string | undefined, enabled: boolean) {
  const { walletAddress } = useAuth();
  return useQuery({
    queryKey: ['communities', 'invites', communityId, walletAddress],
    queryFn: async () => {
      if (!communityId) return [];
      // The invite-links policy resolves the caller through the wallet header;
      // without it this returns [] rather than erroring, which reads as "no
      // links yet" even straight after creating one.
      const { data, error } = await withWalletHeader(
        (supabase as any)
          .from('community_invite_links')
          .select('*')
          .eq('community_id', communityId)
          .order('created_at', { ascending: false }),
        walletAddress,
      );
      if (error) throw error;
      return (data ?? []) as CommunityInviteLink[];
    },
    enabled: !!communityId && !!walletAddress && enabled,
    staleTime: 30_000,
  });
}

export function useCreateInvite() {
  const { t: _copy } = _useCopy();
  const { walletAddress } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (vars: {
      communityId: string;
      name?: string;
      expiresAt?: string | null;
      maxUses?: number | null;
      requiresApproval?: boolean;
    }) =>
      callRpc<CommunityInviteLink>('community_create_invite', {
        _community_id: vars.communityId,
        _name: vars.name?.trim() || null,
        _expires_at: vars.expiresAt ?? null,
        _max_uses: vars.maxUses ?? null,
        _requires_approval: vars.requiresApproval ?? false,
      }, walletAddress),
    onSuccess: (_link, vars) => {
      qc.invalidateQueries({ queryKey: ['communities', 'invites', vars.communityId] });
      qc.invalidateQueries({ queryKey: ['communities', 'admin-log', vars.communityId] });
      toast.success(_copy("copy.f2661a2edcee", { defaultValue: "Invite link created" }));
    },
    onError: (error) => toast.error(adminErrorMessage(error, _copy("copy.7d400b75a897", { defaultValue: "Failed to create invite link" }))),
  });
}

export function useRevokeInvite() {
  const { t: _copy } = _useCopy();
  const { walletAddress } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ inviteId }: { inviteId: string; communityId: string }) =>
      callRpc('community_revoke_invite', { _invite_id: inviteId }, walletAddress),
    onSuccess: (_data, { communityId }) => {
      qc.invalidateQueries({ queryKey: ['communities', 'invites', communityId] });
      toast.success(_copy("copy.0727efedeb3b", { defaultValue: "Invite link revoked" }));
    },
    onError: (error) => toast.error(adminErrorMessage(error, _copy("copy.e7c82bd74723", { defaultValue: "Failed to revoke invite link" }))),
  });
}

export interface InvitePreview {
  is_valid: boolean;
  reason: string | null;
  requires_approval?: boolean;
  community_id?: string;
  name?: string;
  slug?: string;
  description?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  member_count?: number;
}

export function useInvitePreview(code: string | undefined) {
  return useQuery({
    queryKey: ['communities', 'invite-preview', code],
    queryFn: async () => {
      if (!code) return null;
      const { data, error } = await (supabase as any).rpc('community_preview_invite', { _code: code });
      if (error) throw error;
      return data as InvitePreview;
    },
    enabled: !!code,
    staleTime: 30_000,
    retry: false,
  });
}

export function useJoinViaInvite() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (code: string) =>
      callRpc<string>('community_join_via_invite', { _code: code }, walletAddress),
    onSuccess: (status) => {
      qc.invalidateQueries({ queryKey: ['communities'] });
      toast.success(status === 'pending' ? _translateCopy("copy.2b01b19485cc", { defaultValue: "Join request sent" }) : _translateCopy("copy.c63f7d3830bc", { defaultValue: "Joined community" }));
    },
    onError: (error) => toast.error(adminErrorMessage(error, _translateCopy("copy.6d163522af89", { defaultValue: "Failed to join" }))),
  });
}

// ─── Admin log ───────────────────────────────────────────────────────────────

export interface CommunityAdminLogEntry {
  id: string;
  community_id: string;
  actor_wallet_address: string;
  action: string;
  target_wallet_address: string | null;
  target_message_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export const ADMIN_LOG_COPY: Record<string, string> = {
  get promote_admin() { return _translateCopy("copy.348f71b67f2d", { defaultValue: "promoted" }); },
  get demote_admin() { return _translateCopy("copy.5d385507c387", { defaultValue: "demoted" }); },
  get transfer_ownership() { return _translateCopy("copy.6b841731162b", { defaultValue: "transferred ownership to" }); },
  get ban_member() { return _translateCopy("copy.7b412527489f", { defaultValue: "banned" }); },
  get unban_member() { return _translateCopy("copy.f615e0086898", { defaultValue: "unbanned" }); },
  get kick_member() { return _translateCopy("copy.e1f79758cc42", { defaultValue: "removed" }); },
  get mute_member() { return _translateCopy("copy.8fdb32ddbb0c", { defaultValue: "muted" }); },
  get unmute_member() { return _translateCopy("copy.d2369defa3c7", { defaultValue: "unmuted" }); },
  get approve_member() { return _translateCopy("copy.2687f86ed678", { defaultValue: "approved" }); },
  get reject_member() { return _translateCopy("copy.20cd938a2ea6", { defaultValue: "rejected" }); },
  get delete_message() { return _translateCopy("copy.9564f9fff0cc", { defaultValue: "deleted a message from" }); },
  get purge_messages() { return _translateCopy("copy.240cdf8267f9", { defaultValue: "deleted all messages from" }); },
  get pin_message() { return _translateCopy("copy.4ba98173e7bc", { defaultValue: "pinned a message from" }); },
  get unpin_message() { return _translateCopy("copy.f0fc69d9c8d5", { defaultValue: "unpinned a message from" }); },
  get update_settings() { return _translateCopy("copy.5f11177256ed", { defaultValue: "updated the community settings" }); },
  get create_invite() { return _translateCopy("copy.faea15f280ea", { defaultValue: "created an invite link" }); },
  get revoke_invite() { return _translateCopy("copy.e66b354a3e12", { defaultValue: "revoked an invite link" }); },
  get invite_used() { return _translateCopy("copy.307128ff4d35", { defaultValue: "invited" }); },
};

export function useCommunityAdminLog(communityId: string | undefined, enabled: boolean) {
  const { walletAddress } = useAuth();
  return useQuery({
    queryKey: ['communities', 'admin-log', communityId, walletAddress],
    queryFn: async () => {
      if (!communityId) return [];
      const { data, error } = await withWalletHeader(
        (supabase as any)
          .from('community_admin_log')
          .select('*')
          .eq('community_id', communityId)
          .order('created_at', { ascending: false })
          .limit(200),
        walletAddress,
      );
      if (error) throw error;
      return (data ?? []) as CommunityAdminLogEntry[];
    },
    enabled: !!communityId && !!walletAddress && enabled,
    staleTime: 15_000,
  });
}

// ─── Durations shared by the mute/ban pickers ────────────────────────────────

export const RESTRICTION_DURATIONS = [
  { get label() { return _translateCopy("copy.f8b8883f0c9d", { defaultValue: "1 hour" }); },  seconds: 60 * 60 },
  { get label() { return _translateCopy("copy.1ee36a42394f", { defaultValue: "8 hours" }); }, seconds: 60 * 60 * 8 },
  { get label() { return _translateCopy("copy.fa665d95d29e", { defaultValue: "1 day" }); },   seconds: 60 * 60 * 24 },
  { get label() { return _translateCopy("copy.c8cc522340b9", { defaultValue: "1 week" }); },  seconds: 60 * 60 * 24 * 7 },
  { get label() { return _translateCopy("copy.55f980cf8c92", { defaultValue: "Forever" }); }, seconds: null },
] as const;

export function durationToTimestamp(seconds: number | null): string | null {
  if (seconds === null) return null;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export const SLOW_MODE_OPTIONS = [
  { get label() { return _translateCopy("copy.ca7981b46ecf", { defaultValue: "Off" }); },    seconds: 0 },
  { get label() { return _translateCopy("copy.7819f63beefe", { defaultValue: "10s" }); },    seconds: 10 },
  { get label() { return _translateCopy("copy.d3382a4f0e03", { defaultValue: "30s" }); },    seconds: 30 },
  { get label() { return _translateCopy("copy.75adbad9edb8", { defaultValue: "1 min" }); },  seconds: 60 },
  { get label() { return _translateCopy("copy.53bc57cdb692", { defaultValue: "5 min" }); },  seconds: 300 },
  { get label() { return _translateCopy("copy.8d616d350961", { defaultValue: "15 min" }); }, seconds: 900 },
  { get label() { return _translateCopy("copy.f8b8883f0c9d", { defaultValue: "1 hour" }); }, seconds: 3600 },
] as const;
