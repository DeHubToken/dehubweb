import { DEHUB_API_BASE } from './core';

const ADMIN_TOKEN_KEY = 'dehub_admin_token';
const ADMIN_REFRESH_KEY = 'dehub_admin_refresh_token';
const ADMIN_EXPIRES_KEY = 'dehub_admin_expires_at';

export type AdminUserStatus = 'active' | 'banned' | 'suspended';
export type AdminJoinedWithin = 'all' | '7d' | '30d' | '90d';
export type AdminSignupMethod =
  | 'all'
  | 'wallet'
  | 'google'
  | 'twitter'
  | 'discord'
  | 'email'
  | 'apple'
  | 'github';

export interface AdminSession {
  token: string;
  refreshToken: string;
  expiresIn: number;
  admin: {
    id: string;
    email: string;
    displayName?: string;
    role: string;
  };
}

export interface AdminUserListItem {
  _id: string;
  address?: string;
  username?: string;
  displayName?: string;
  email?: string;
  avatarImageUrl?: string;
  status: AdminUserStatus;
  signupMethod: string;
  followers: number;
  uploads: number;
  createdAt?: string;
  lastLoginTimestamp?: string;
  lastActiveDevice?: {
    platform?: string;
    deviceName?: string | null;
    appVersion?: string | null;
    lastSeenAt?: string | null;
  };
}

export interface AdminUsersListResponse {
  page: number;
  limit: number;
  total: number;
  items: AdminUserListItem[];
}

export interface ListAdminUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'all' | AdminUserStatus;
  joinedWithin?: AdminJoinedWithin;
  signupMethod?: AdminSignupMethod;
}

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminSession(session: AdminSession) {
  localStorage.setItem(ADMIN_TOKEN_KEY, session.token);
  localStorage.setItem(ADMIN_REFRESH_KEY, session.refreshToken);
  localStorage.setItem(
    ADMIN_EXPIRES_KEY,
    String(Date.now() + session.expiresIn * 1000),
  );
}

export function clearAdminSession() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_REFRESH_KEY);
  localStorage.removeItem(ADMIN_EXPIRES_KEY);
}

async function refreshAdminToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem(ADMIN_REFRESH_KEY);
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${DEHUB_API_BASE}/api/admin/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      clearAdminSession();
      return false;
    }
    const data = await res.json();
    if (!data.token) return false;
    localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
    if (data.refreshToken) localStorage.setItem(ADMIN_REFRESH_KEY, data.refreshToken);
    if (data.expiresIn) {
      localStorage.setItem(ADMIN_EXPIRES_KEY, String(Date.now() + data.expiresIn * 1000));
    }
    return true;
  } catch {
    return false;
  }
}

async function adminFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = getAdminToken();
  if (!token) throw new Error('Admin session expired');

  const res = await fetch(`${DEHUB_API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (res.status === 401 && retry) {
    const ok = await refreshAdminToken();
    if (ok) return adminFetch<T>(path, options, false);
    clearAdminSession();
    throw new Error('Admin session expired');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

export async function adminLogin(email: string, password: string): Promise<AdminSession> {
  const res = await fetch(`${DEHUB_API_BASE}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Invalid email or password');
  }

  const data = await res.json();
  const session: AdminSession = {
    token: data.token,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn,
    admin: data.admin,
  };
  setAdminSession(session);
  return session;
}

export async function adminLogout(): Promise<void> {
  const refreshToken = localStorage.getItem(ADMIN_REFRESH_KEY);
  try {
    if (refreshToken && getAdminToken()) {
      await adminFetch('/api/admin/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    }
  } catch {
    // ignore network errors on logout
  } finally {
    clearAdminSession();
  }
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') q.set(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}

export async function listAdminUsers(
  params: ListAdminUsersParams = {},
): Promise<AdminUsersListResponse> {
  return adminFetch<AdminUsersListResponse>(
    `/api/admin/users${buildQuery({
      page: params.page,
      limit: params.limit,
      search: params.search,
      status: params.status,
      joinedWithin: params.joinedWithin,
      signupMethod: params.signupMethod,
    })}`,
  );
}

// ── Reports & moderation ─────────────────────────────────────────────────────

export type AdminReportStatus = 'pending' | 'reviewed' | 'action_taken' | 'dismissed';

export interface AdminReportUserRef {
  address?: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
}

export interface AdminReportAdminRef {
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
}

export interface AdminReportedToken {
  tokenId: number;
  name?: string;
  image?: string;
  postType?: string;
  status?: string;
  minter?: string;
  owner?: string;
}

export interface AdminContentReportItem {
  _id: string;
  tokenId: number;
  reason?: string;
  additionalInfo?: string;
  description?: string;
  status: AdminReportStatus;
  reviewedAt?: string;
  createdAt: string;
  reporter?: AdminReportUserRef;
  token?: AdminReportedToken;
  reviewedByAdmin?: AdminReportAdminRef;
}

export interface AdminTargetUserRef extends AdminReportUserRef {
  isBanned?: boolean;
  bannedAt?: string;
  bannedReason?: string;
}

export interface AdminUserReportItem {
  _id: string;
  reason: string;
  additionalInfo?: string;
  status: AdminReportStatus;
  reviewedAt?: string;
  createdAt: string;
  reporter?: AdminReportUserRef;
  targetUser?: AdminTargetUserRef;
  reviewedByAdmin?: AdminReportAdminRef;
}

export interface AdminReportStatusSummary {
  pending: number;
  reviewed: number;
  action_taken: number;
  dismissed: number;
}

export interface AdminContentReportsListResponse {
  page: number;
  limit: number;
  total: number;
  summary: AdminReportStatusSummary;
  items: AdminContentReportItem[];
}

export interface AdminUserReportsListResponse {
  page: number;
  limit: number;
  total: number;
  summary: AdminReportStatusSummary;
  items: AdminUserReportItem[];
}

export type AdminReportsKind = 'content' | 'users';

export interface ListAdminReportsParams {
  page?: number;
  limit?: number;
  status?: 'all' | AdminReportStatus;
}

export async function listAdminContentReports(
  params: ListAdminReportsParams = {},
): Promise<AdminContentReportsListResponse> {
  return adminFetch<AdminContentReportsListResponse>(
    `/api/admin/reports/content${buildQuery({
      page: params.page,
      limit: params.limit,
      status: params.status === 'all' ? undefined : params.status,
    })}`,
  );
}

export async function listAdminUserReports(
  params: ListAdminReportsParams = {},
): Promise<AdminUserReportsListResponse> {
  return adminFetch<AdminUserReportsListResponse>(
    `/api/admin/reports/users${buildQuery({
      page: params.page,
      limit: params.limit,
      status: params.status === 'all' ? undefined : params.status,
    })}`,
  );
}

// ── Live chat (the community chat room) ──────────────────────────────────────

export interface AdminChatUserRef {
  address: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  isModerator?: boolean;
  isBanned?: boolean;
  followers?: number;
  followings?: number;
  badgeBalance?: number;
  accountCreatedAt?: string;
}

export interface AdminChatRoomInfo {
  roomId: string;
  name?: string;
  description?: string;
  activeUsers?: number;
  messageCount?: number;
  slowMode?: boolean;
  slowModeSeconds?: number;
  minStakeRequired?: number;
  moderators: string[];
  bannedUsers?: string[];
  lastMessageAt?: string;
}

export interface AdminChatOverview {
  room: AdminChatRoomInfo;
  moderators: AdminChatUserRef[];
  bannedUsers: AdminChatUserRef[];
  onlineCount: number;
  onlineAddresses: string[];
}

export type AdminChatMessageType = 'text' | 'media' | 'gif' | 'system' | 'audio';

export interface AdminChatMessage {
  id: string;
  roomId: string;
  sender: AdminChatUserRef;
  content: string;
  messageType: AdminChatMessageType;
  imageUrl?: string;
  audioUrl?: string;
  audioDuration?: number;
  replyTo?: { id: string; content: string; senderAddress: string; senderUsername?: string };
  reactions?: Record<string, string[]>;
  isPinned: boolean;
  isDeleted: boolean;
  deletedBy?: string;
  deletedAt?: string;
  createdAt: string;
}

export interface AdminChatMessagesResponse {
  messages: AdminChatMessage[];
  hasMore: boolean;
  totalCount: number;
}

export interface ListAdminChatMessagesParams {
  before?: string;
  after?: string;
  limit?: number;
  senderAddress?: string;
  includeDeleted?: boolean;
}

export interface AdminChatParticipant {
  user: AdminChatUserRef;
  messageCount: number;
  lastMessageAt: string;
  isOnline: boolean;
  isModerator: boolean;
  isBanned: boolean;
}

export interface AdminChatParticipantsResponse {
  participants: AdminChatParticipant[];
  total: number;
  page: number;
  pages: number;
}

export interface ListAdminChatParticipantsParams {
  page?: number;
  limit?: number;
  search?: string;
  filter?: 'all' | 'online' | 'banned' | 'moderators';
}

export async function getAdminChatOverview(): Promise<AdminChatOverview> {
  return adminFetch<AdminChatOverview>('/api/admin/livechat');
}

export async function updateAdminChatSettings(settings: {
  slowMode?: boolean;
  slowModeSeconds?: number;
  minStakeRequired?: number;
}): Promise<AdminChatRoomInfo> {
  return adminFetch<AdminChatRoomInfo>('/api/admin/livechat/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

export async function addAdminChatModerator(address: string): Promise<void> {
  await adminFetch('/api/admin/livechat/moderators', {
    method: 'POST',
    body: JSON.stringify({ address: address.toLowerCase() }),
  });
}

export async function removeAdminChatModerator(address: string): Promise<void> {
  await adminFetch(`/api/admin/livechat/moderators/${address.toLowerCase()}`, {
    method: 'DELETE',
  });
}

export async function banAdminChatUser(address: string): Promise<void> {
  await adminFetch('/api/admin/livechat/ban', {
    method: 'POST',
    body: JSON.stringify({ address: address.toLowerCase() }),
  });
}

export async function unbanAdminChatUser(address: string): Promise<void> {
  await adminFetch(`/api/admin/livechat/ban/${address.toLowerCase()}`, {
    method: 'DELETE',
  });
}

export async function listAdminChatParticipants(
  params: ListAdminChatParticipantsParams = {},
): Promise<AdminChatParticipantsResponse> {
  return adminFetch<AdminChatParticipantsResponse>(
    `/api/admin/livechat/participants${buildQuery({
      page: params.page,
      limit: params.limit,
      search: params.search,
      filter: params.filter && params.filter !== 'all' ? params.filter : undefined,
    })}`,
  );
}

export async function listAdminChatMessages(
  params: ListAdminChatMessagesParams = {},
): Promise<AdminChatMessagesResponse> {
  return adminFetch<AdminChatMessagesResponse>(
    `/api/admin/livechat/messages${buildQuery({
      before: params.before,
      after: params.after,
      limit: params.limit,
      senderAddress: params.senderAddress,
      includeDeleted:
        params.includeDeleted === undefined ? undefined : String(params.includeDeleted),
    })}`,
  );
}

export async function deleteAdminChatMessage(messageId: string): Promise<void> {
  await adminFetch(`/api/admin/livechat/messages/${messageId}`, { method: 'DELETE' });
}

export async function pinAdminChatMessage(messageId: string): Promise<void> {
  await adminFetch(`/api/admin/livechat/pin/${messageId}`, { method: 'POST' });
}

export async function unpinAdminChatMessage(messageId: string): Promise<void> {
  await adminFetch(`/api/admin/livechat/pin/${messageId}`, { method: 'DELETE' });
}
