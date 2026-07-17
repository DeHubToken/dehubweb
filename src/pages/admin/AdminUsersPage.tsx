import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, Search, Smartphone, Monitor, HelpCircle } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buildAvatarUrl } from '@/lib/media-url';
import {
  listAdminUsers,
  type AdminJoinedWithin,
  type AdminSignupMethod,
  type AdminUserListItem,
  type AdminUserStatus,
} from '@/lib/api/dehub/admin';
import { cn } from '@/lib/utils';

const JOINED_OPTIONS: { value: AdminJoinedWithin; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '7d', label: 'New (7d)' },
  { value: '30d', label: 'New (30d)' },
  { value: '90d', label: 'New (90d)' },
];

const SIGNUP_OPTIONS: { value: AdminSignupMethod; label: string }[] = [
  { value: 'all', label: 'All signup methods' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'google', label: 'Google' },
  { value: 'twitter', label: 'Twitter / X' },
  { value: 'discord', label: 'Discord' },
  { value: 'email', label: 'Email' },
  { value: 'apple', label: 'Apple' },
  { value: 'github', label: 'GitHub' },
];

const STATUS_OPTIONS: { value: 'all' | AdminUserStatus; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'banned', label: 'Banned' },
];

const selectCls =
  'h-10 rounded-xl bg-white/5 border border-white/10 text-sm text-white px-3 outline-none focus:border-white/30';

function PlatformIcon({ platform }: { platform?: string }) {
  if (platform === 'ios' || platform === 'android') {
    return <Smartphone className="w-3.5 h-3.5 text-white/50" />;
  }
  if (platform === 'web') {
    return <Monitor className="w-3.5 h-3.5 text-white/50" />;
  }
  return <HelpCircle className="w-3.5 h-3.5 text-white/50" />;
}

function StatusBadge({ status }: { status: AdminUserStatus }) {
  const styles =
    status === 'banned'
      ? 'bg-red-500/15 text-red-300 border-red-500/30'
      : status === 'suspended'
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  return (
    <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[11px] border capitalize', styles)}>
      {status}
    </span>
  );
}

function UserRow({ user }: { user: AdminUserListItem }) {
  const name = user.displayName || user.username || user.address?.slice(0, 10) || 'User';
  const avatar = user.avatarImageUrl && user.address
    ? buildAvatarUrl(user.address, user.avatarImageUrl)
    : undefined;
  const joined = user.createdAt
    ? formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })
    : '—';
  const lastSeen = user.lastActiveDevice?.lastSeenAt
    ? formatDistanceToNow(new Date(user.lastActiveDevice.lastSeenAt), { addSuffix: true })
    : user.lastLoginTimestamp
      ? formatDistanceToNow(new Date(user.lastLoginTimestamp), { addSuffix: true })
      : '—';

  return (
    <tr className="border-b border-white/[0.06] hover:bg-white/[0.02]">
      <td className="py-3 pr-3">
        <div className="flex items-center gap-3 min-w-[180px]">
          <Avatar className="w-9 h-9 rounded-xl shrink-0">
            <AvatarImage src={avatar} className="rounded-xl" />
            <AvatarFallback className="rounded-xl text-xs">{name.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="text-sm font-medium text-white truncate">{name}</div>
            {user.username && (
              <Link to={`/${user.username}`} className="text-xs text-white/50 hover:text-white truncate block">
                @{user.username}
              </Link>
            )}
            {!user.username && user.address && (
              <div className="text-[11px] text-white/40 font-mono truncate">{user.address}</div>
            )}
          </div>
        </div>
      </td>
      <td className="py-3 px-2 text-xs text-white/70 capitalize">{user.signupMethod || 'wallet'}</td>
      <td className="py-3 px-2 text-xs text-white/60 whitespace-nowrap">{joined}</td>
      <td className="py-3 px-2 text-sm text-white/80 tabular-nums">{user.followers?.toLocaleString() ?? 0}</td>
      <td className="py-3 px-2 text-sm text-white/80 tabular-nums">{user.uploads?.toLocaleString() ?? 0}</td>
      <td className="py-3 px-2"><StatusBadge status={user.status} /></td>
      <td className="py-3 pl-2">
        <div className="flex items-center gap-1.5 text-xs text-white/50 whitespace-nowrap">
          <PlatformIcon platform={user.lastActiveDevice?.platform} />
          <span>{lastSeen}</span>
        </div>
      </td>
    </tr>
  );
}

export default function AdminUsersPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [joinedWithin, setJoinedWithin] = useState<AdminJoinedWithin>('all');
  const [signupMethod, setSignupMethod] = useState<AdminSignupMethod>('all');
  const [status, setStatus] = useState<'all' | AdminUserStatus>('all');
  const [page, setPage] = useState(1);
  const limit = 25;

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const queryKey = useMemo(
    () => ['admin-users', page, limit, search, joinedWithin, signupMethod, status],
    [page, search, joinedWithin, signupMethod, status],
  );

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () =>
      listAdminUsers({
        page,
        limit,
        search: search || undefined,
        joinedWithin,
        signupMethod,
        status,
      }),
    staleTime: 30_000,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <AdminShell title="Users">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Users</h1>
        <p className="text-sm text-white/60">
          Browse all users or filter by signup window, method, and status for growth tracking.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-end gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, username, email, wallet…"
            className="pl-9 bg-white/5 border-white/10 text-white"
          />
        </div>
        <select
          value={joinedWithin}
          onChange={(e) => { setJoinedWithin(e.target.value as AdminJoinedWithin); setPage(1); }}
          className={selectCls}
        >
          {JOINED_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-zinc-900">{o.label}</option>
          ))}
        </select>
        <select
          value={signupMethod}
          onChange={(e) => { setSignupMethod(e.target.value as AdminSignupMethod); setPage(1); }}
          className={selectCls}
        >
          {SIGNUP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-zinc-900">{o.label}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as 'all' | AdminUserStatus); setPage(1); }}
          className={selectCls}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-zinc-900">{o.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {JOINED_OPTIONS.filter((o) => o.value !== 'all').map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => { setJoinedWithin(o.value); setPage(1); }}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs border transition-colors',
              joinedWithin === o.value
                ? 'bg-white/15 text-white border-white/25'
                : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="text-sm text-white/70">
            {data ? (
              <>
                <span className="text-white font-medium">{data.total.toLocaleString()}</span> users
                {joinedWithin !== 'all' && ` · joined within ${joinedWithin}`}
              </>
            ) : (
              'Loading…'
            )}
          </div>
          {isFetching && !isLoading && <Loader2 className="w-4 h-4 animate-spin text-white/40" />}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-white/40" />
          </div>
        ) : isError ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-red-300 mb-3">
              {error instanceof Error ? error.message : 'Failed to load users'}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : !data?.items.length ? (
          <div className="px-4 py-10 text-center text-sm text-white/50">No users match these filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-white/40 border-b border-white/10">
                  <th className="py-2.5 pr-3 pl-4 font-medium">User</th>
                  <th className="py-2.5 px-2 font-medium">Signup</th>
                  <th className="py-2.5 px-2 font-medium">Joined</th>
                  <th className="py-2.5 px-2 font-medium">Followers</th>
                  <th className="py-2.5 px-2 font-medium">Uploads</th>
                  <th className="py-2.5 px-2 font-medium">Status</th>
                  <th className="py-2.5 pl-2 pr-4 font-medium">Last active</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((user) => (
                  <UserRow key={user._id} user={user} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > limit && (
          <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between gap-3">
            <span className="text-xs text-white/50">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
