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
