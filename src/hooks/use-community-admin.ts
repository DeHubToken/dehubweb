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
import type { Community, CommunityMember } from '@/hooks/use-communities';

// ─── Rights ──────────────────────────────────────────────────────────────────

export const ADMIN_RIGHTS = [
  { key: 'change_info',      label: 'Change community info', hint: 'Name, description, avatar, banner and ticker' },
  { key: 'delete_messages',  label: 'Delete messages',       hint: 'Remove any message from the chat' },
  { key: 'restrict_members', label: 'Ban users',             hint: 'Approve, mute, ban and remove members' },
  { key: 'invite_users',     label: 'Invite users via link', hint: 'Create and revoke invite links' },
  { key: 'pin_messages',     label: 'Pin messages',          hint: 'Pin a message to the top of the chat' },
  { key: 'manage_events',    label: 'Manage events',         hint: 'Edit and remove community events' },
  { key: 'add_admins',       label: 'Add new admins',        hint: 'Promote members, and demote admins they promoted' },
  { key: 'remain_anonymous', label: 'Remain anonymous',      hint: 'Hide the admin badge on this account' },
] as const;

export type AdminRight = (typeof ADMIN_RIGHTS)[number]['key'];

export const MEMBER_RIGHTS = [
  { key: 'send_messages', label: 'Send messages',    hint: 'Post in the community chat' },
  { key: 'send_media',    label: 'Send media',       hint: 'Attach images and GIFs' },
  { key: 'embed_links',   label: 'Embed links',      hint: 'Show link previews' },
  { key: 'add_members',   label: 'Add members',      hint: 'Share the community with others' },
  { key: 'create_events', label: 'Create events',    hint: 'Schedule community events' },
  { key: 'pin_messages',  label: 'Pin messages',     hint: 'Pin a message to the top of the chat' },
  { key: 'change_info',   label: 'Change info',      hint: 'Edit the community name and description' },
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

// ─── RPC plumbing ────────────────────────────────────────────────────────────

/**
 * The generated Supabase types predate these functions, so the rpc() name union
 * does not include them. Everything below is the single place that widens it.
 */
async function callRpc<T = unknown>(
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

const ERROR_COPY: Record<string, string> = {
  not_authenticated: 'Connect your wallet first',
  cannot_moderate_yourself: 'You cannot do that to yourself',
  cannot_moderate_the_owner: 'The owner cannot be moderated',
  only_the_owner_can_moderate_an_admin: 'Only the owner can moderate another admin',
  only_the_owner_can_transfer_ownership: 'Only the owner can transfer ownership',
  only_the_owner_can_delete_a_community: 'Only the owner can delete this community',
  new_owner_must_be_an_active_member: 'Pick an active member to hand the community to',
  member_not_found: 'That member is no longer here',
  member_is_not_active: 'That member is not active',
  member_is_not_banned: 'That member is not banned',
  no_pending_request: 'That request is no longer pending',
  message_not_found: 'That message is already gone',
  role_must_be_admin_or_member: 'Unsupported role',
  already_the_owner: 'They already own this community',
  membership_updates_require_rpc: 'That change is no longer allowed directly',
  cannot_join_on_behalf_of_another_wallet: 'You can only join with your own wallet',
  cannot_post_as_another_wallet: 'You can only post as yourself',
  cannot_edit_another_members_message: 'You can only edit your own messages',
  you_cannot_post_in_this_community: 'You do not have permission to post here',
  you_cannot_send_media_in_this_community: 'You do not have permission to send media here',
  you_are_banned_from_this_community: 'You are banned from this community',
  invite_not_found: 'That invite link does not exist',
  invite_revoked: 'That invite link was revoked',
  invite_expired: 'That invite link has expired',
  invite_exhausted: 'That invite link has reached its limit',
  invite_used: 'Invite accepted',
};

const RIGHT_LABEL = new Map<string, string>([
  ...ADMIN_RIGHTS.map(r => [r.key, r.label] as [string, string]),
  ...MEMBER_RIGHTS.map(r => [r.key, r.label] as [string, string]),
]);

/** Turns a raised Postgres condition into something worth showing a human. */
export function adminErrorMessage(error: unknown, fallback: string): string {
  const raw = String((error as { message?: string })?.message ?? '');
  if (!raw) return fallback;

  const permission = raw.match(/permission_denied:(\w+)/);
  if (permission) {
    const label = RIGHT_LABEL.get(permission[1]) ?? permission[1].replace(/_/g, ' ');
    return `You do not have permission to ${label.toLowerCase()}`;
  }

  const slow = raw.match(/slow_mode_active:(\d+)/);
  if (slow) {
    const seconds = Number(slow[1]);
    return seconds >= 60
      ? `Slow mode is on — one message every ${Math.round(seconds / 60)} min`
      : `Slow mode is on — one message every ${seconds}s`;
  }

  for (const [code, copy] of Object.entries(ERROR_COPY)) {
    if (raw.includes(code)) return copy;
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
  failure: string,
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
    onError: (error) => toast.error(adminErrorMessage(error, failure)),
  });
}

// ─── Membership moderation ───────────────────────────────────────────────────

export function useApproveMember() {
  return useModerationMutation<TargetVars>(
    v => ({ fn: 'community_approve_member', args: { _community_id: v.communityId, _target: v.wallet } }),
    v => `${v.displayName ?? 'Member'} approved`,
    'Failed to approve',
  );
}

export function useRejectMember() {
  return useModerationMutation<TargetVars>(
    v => ({ fn: 'community_reject_member', args: { _community_id: v.communityId, _target: v.wallet } }),
    () => 'Request rejected',
    'Failed to reject',
  );
}

export function useKickMember() {
  return useModerationMutation<TargetVars>(
    v => ({ fn: 'community_kick_member', args: { _community_id: v.communityId, _target: v.wallet } }),
    v => `${v.displayName ?? 'Member'} removed`,
    'Failed to remove member',
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
    v => `${v.displayName ?? 'Member'} banned`,
    'Failed to ban member',
  );
}

export function useUnbanMember() {
  return useModerationMutation<TargetVars>(
    v => ({ fn: 'community_unban_member', args: { _community_id: v.communityId, _target: v.wallet } }),
    v => `${v.displayName ?? 'Member'} unbanned`,
    'Failed to unban member',
  );
}

export function useMuteMember() {
  return useModerationMutation<TargetVars & { until?: string | null }>(
    v => ({
      fn: 'community_mute_member',
      args: { _community_id: v.communityId, _target: v.wallet, _until: v.until ?? null },
    }),
    v => (v.until ? `${v.displayName ?? 'Member'} muted` : `${v.displayName ?? 'Member'} muted indefinitely`),
    'Failed to mute member',
  );
}

export function useUnmuteMember() {
  return useModerationMutation<TargetVars>(
    v => ({ fn: 'community_unmute_member', args: { _community_id: v.communityId, _target: v.wallet } }),
    v => `${v.displayName ?? 'Member'} unmuted`,
    'Failed to unmute member',
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
    v => (v.role === 'admin' ? `${v.displayName ?? 'Member'} is now an admin` : `${v.displayName ?? 'Member'} is no longer an admin`),
    'Failed to update role',
  );
}

export function useTransferOwnership() {
  return useModerationMutation<TargetVars>(
    v => ({ fn: 'community_transfer_ownership', args: { _community_id: v.communityId, _new_owner: v.wallet } }),
    v => `${v.displayName ?? 'Member'} now owns this community`,
    'Failed to transfer ownership',
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
      toast.success(removed ? `Deleted ${removed} message${removed === 1 ? '' : 's'}` : 'No messages to delete');
    },
    onError: (error) => toast.error(adminErrorMessage(error, 'Failed to delete messages')),
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
    onError: (error) => toast.error(adminErrorMessage(error, 'Failed to update community')),
  });
}

export function useDeleteCommunity() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (communityId: string) =>
      callRpc('community_delete', { _community_id: communityId }, walletAddress),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['communities'] });
      toast.success('Community deleted');
    },
    onError: (error) => toast.error(adminErrorMessage(error, 'Failed to delete community')),
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
      toast.success('Invite link created');
    },
    onError: (error) => toast.error(adminErrorMessage(error, 'Failed to create invite link')),
  });
}

export function useRevokeInvite() {
  const { walletAddress } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ inviteId }: { inviteId: string; communityId: string }) =>
      callRpc('community_revoke_invite', { _invite_id: inviteId }, walletAddress),
    onSuccess: (_data, { communityId }) => {
      qc.invalidateQueries({ queryKey: ['communities', 'invites', communityId] });
      toast.success('Invite link revoked');
    },
    onError: (error) => toast.error(adminErrorMessage(error, 'Failed to revoke invite link')),
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
      toast.success(status === 'pending' ? 'Join request sent' : 'Joined community');
    },
    onError: (error) => toast.error(adminErrorMessage(error, 'Failed to join')),
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
  promote_admin: 'promoted',
  demote_admin: 'demoted',
  transfer_ownership: 'transferred ownership to',
  ban_member: 'banned',
  unban_member: 'unbanned',
  kick_member: 'removed',
  mute_member: 'muted',
  unmute_member: 'unmuted',
  approve_member: 'approved',
  reject_member: 'rejected',
  delete_message: 'deleted a message from',
  purge_messages: 'deleted all messages from',
  pin_message: 'pinned a message from',
  unpin_message: 'unpinned a message from',
  update_settings: 'updated the community settings',
  create_invite: 'created an invite link',
  revoke_invite: 'revoked an invite link',
  invite_used: 'invited',
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
  { label: '1 hour',  seconds: 60 * 60 },
  { label: '8 hours', seconds: 60 * 60 * 8 },
  { label: '1 day',   seconds: 60 * 60 * 24 },
  { label: '1 week',  seconds: 60 * 60 * 24 * 7 },
  { label: 'Forever', seconds: null },
] as const;

export function durationToTimestamp(seconds: number | null): string | null {
  if (seconds === null) return null;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export const SLOW_MODE_OPTIONS = [
  { label: 'Off',    seconds: 0 },
  { label: '10s',    seconds: 10 },
  { label: '30s',    seconds: 30 },
  { label: '1 min',  seconds: 60 },
  { label: '5 min',  seconds: 300 },
  { label: '15 min', seconds: 900 },
  { label: '1 hour', seconds: 3600 },
] as const;
