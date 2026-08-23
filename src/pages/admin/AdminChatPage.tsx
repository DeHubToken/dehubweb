import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  Loader2,
  MessageSquare,
  Pin,
  PinOff,
  ShieldBan,
  ShieldCheck,
  ShieldOff,
  Trash2,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { buildAvatarUrl } from '@/lib/media-url';
import {
  addAdminChatModerator,
  banAdminChatUser,
  deleteAdminChatMessage,
  getAdminChatOverview,
  listAdminChatMessages,
  listAdminChatParticipants,
  pinAdminChatMessage,
  removeAdminChatModerator,
  unbanAdminChatUser,
  unpinAdminChatMessage,
  updateAdminChatSettings,
  type AdminChatMessage,
  type AdminChatParticipant,
  type AdminChatUserRef,
} from '@/lib/api/dehub/admin';
import { cn } from '@/lib/utils';
import { DeHubPageLoader } from '@/components/app/DeHubLoader';
import { toast } from 'sonner';

function ChatPerson({ user }: { user?: AdminChatUserRef }) {
  const name = user?.displayName || user?.username || user?.address?.slice(0, 10) || 'Unknown';
  const avatar = user?.avatarUrl && user?.address ? buildAvatarUrl(user.address, user.avatarUrl) : undefined;
  return (
    <div className="flex items-center gap-3 min-w-[160px]">
      <Avatar className="w-9 h-9 rounded-xl shrink-0">
        <AvatarImage src={avatar} className="rounded-xl" />
        <AvatarFallback className="rounded-xl text-xs">{name.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        {user?.username ? (
          <Link to={`/${user.username}`} className="text-sm font-medium text-white hover:underline truncate block">
            {user.displayName || user.username}
          </Link>
        ) : (
          <div className="text-sm font-medium text-white truncate">{name}</div>
        )}
        {user?.address && (
          <div className="text-[11px] text-white/40 font-mono truncate">
            {user.address.slice(0, 6)}…{user.address.slice(-4)}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageContent({ message }: { message: AdminChatMessage }) {
  if (message.messageType === 'media') return <span className="text-sm text-white/50 italic">image</span>;
  if (message.messageType === 'gif') return <span className="text-sm text-white/50 italic">GIF</span>;
  if (message.messageType === 'audio' || message.audioUrl) {
    return <span className="text-sm text-white/50 italic">voice note</span>;
  }
  return (
    <div className="max-w-[420px] text-sm text-white/80 break-words line-clamp-2">
      {message.replyTo && (
        <span className="text-[11px] text-white/40 mr-1.5">
          replying to {message.replyTo.senderUsername || 'a message'}
        </span>
      )}
      {message.content}
    </div>
  );
}

type Tab = 'messages' | 'participants';

const PARTICIPANT_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'online', label: 'Online' },
  { value: 'banned', label: 'Banned' },
  { value: 'moderators', label: 'Moderators' },
] as const;

type ParticipantFilter = (typeof PARTICIPANT_FILTERS)[number]['value'];

function MessagesCard() {
  const queryClient = useQueryClient();
  const [senderInput, setSenderInput] = useState('');
  const [senderAddress, setSenderAddress] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(true);

  const filterKey = `${senderAddress}|${includeDeleted}`;
  const [rows, setRows] = useState<AdminChatMessage[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const params = () => ({
    limit: 50,
    senderAddress: senderAddress.trim() || undefined,
    includeDeleted,
  });

  const { isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['admin-chat-messages', filterKey],
    queryFn: async () => {
      const data = await listAdminChatMessages(params());
      setRows(data.messages);
      setHasMore(data.hasMore);
      setTotalCount(data.totalCount);
      setCursor(data.messages.length ? data.messages[data.messages.length - 1].id : undefined);
      return data;
    },
    staleTime: 15_000,
  });

  const loadOlder = async () => {
    const data = await listAdminChatMessages({ ...params(), before: cursor });
    setRows((prev) => [...prev, ...data.messages]);
    setHasMore(data.hasMore);
    if (data.messages.length) setCursor(data.messages[data.messages.length - 1].id);
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-chat-messages'] });
    queryClient.invalidateQueries({ queryKey: ['admin-chat-overview'] });
  };

  const [busyId, setBusyId] = useState<string | null>(null);
  const runOn = async (id: string, fn: () => Promise<void>, done: string) => {
    setBusyId(id);
    try {
      await fn();
      toast.success(done);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center gap-3">
        <input
          value={senderInput}
          onChange={(e) => setSenderInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setSenderAddress(senderInput.trim())}
          placeholder="Filter by wallet address"
          className="h-9 w-full sm:w-72 rounded-xl bg-white/5 border border-white/10 text-xs text-white px-3 font-mono outline-none focus:border-white/30 placeholder:text-white/35"
        />
        <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer select-none">
          <Switch checked={includeDeleted} onCheckedChange={setIncludeDeleted} />
          Show deleted
        </label>
        <span className="ml-auto text-sm text-white/70">
          <span className="text-white font-medium">{totalCount.toLocaleString()}</span> messages all time
        </span>
        {isFetching && !isLoading && <Loader2 className="w-4 h-4 animate-spin text-white/40" />}
      </div>

      {isLoading ? (
        <DeHubPageLoader minHeight="40vh" />
      ) : isError ? (
        <div className="px-4 py-10 text-center text-sm text-red-300">
          {error instanceof Error ? error.message : 'Failed to load messages'}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <MessageSquare className="w-8 h-8 text-white/25 mx-auto mb-3" />
          <p className="text-sm text-white/50">No messages match these filters.</p>
        </div>
      ) : (
        <>
          <div>
            {rows.map((m) => (
              <div
                key={m.id}
                className="flex items-start gap-3 px-4 py-3 border-b border-white/[0.06] last:border-b-0 hover:bg-white/[0.02]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-x-2 gap-y-1 flex-wrap mb-1">
                    <ChatPerson user={m.sender} />
                    <span className="text-[11px] text-white/40 whitespace-nowrap">
                      {formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}
                    </span>
                    {m.isPinned && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-sky-300 bg-sky-500/10 border border-sky-500/25 rounded-full px-2 py-0.5">
                        <Pin className="w-3 h-3" /> pinned
                      </span>
                    )}
                    {m.isDeleted && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-red-300 bg-red-500/10 border border-red-500/25 rounded-full px-2 py-0.5">
                        deleted{m.deletedBy ? ` by ${m.deletedBy}` : ''}
                      </span>
                    )}
                  </div>
                  <MessageContent message={m} />
                </div>
                <div className="flex items-center gap-1 shrink-0 pt-1">
                  {busyId === m.id && <Loader2 className="w-4 h-4 animate-spin text-white/40 mr-1" />}
                  {!m.isDeleted && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={m.isPinned ? 'Unpin' : 'Pin'}
                        onClick={() =>
                          void runOn(
                            m.id,
                            () => (m.isPinned ? unpinAdminChatMessage(m.id) : pinAdminChatMessage(m.id)),
                            m.isPinned ? 'Message unpinned' : 'Message pinned',
                          )
                        }
                        className="w-8 h-8 text-white/50 hover:text-white"
                      >
                        {m.isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete message"
                        onClick={() => {
                          if (!window.confirm('Delete this message?')) return;
                          void runOn(m.id, () => deleteAdminChatMessage(m.id), 'Message deleted');
                        }}
                        className="w-8 h-8 text-red-400/80 hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          {hasMore && (
            <div className="px-4 py-3 border-t border-white/10 text-center">
              <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void loadOlder()}>
                Load older
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ParticipantRow({ p }: { p: AdminChatParticipant }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      queryClient.invalidateQueries({ queryKey: ['admin-chat-participants'] });
      queryClient.invalidateQueries({ queryKey: ['admin-chat-overview'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="border-b border-white/[0.06] hover:bg-white/[0.02]">
      <td className="py-3 pr-3 pl-4">
        <div className="flex items-center gap-3">
          <ChatPerson user={p.user} />
          {p.isOnline && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> online
            </span>
          )}
        </div>
      </td>
      <td className="py-3 px-2 text-sm text-white/70">{p.messageCount.toLocaleString()}</td>
      <td className="py-3 px-2 text-xs text-white/60 whitespace-nowrap">
        {formatDistanceToNow(new Date(p.lastMessageAt), { addSuffix: true })}
      </td>
      <td className="py-3 px-2">
        {p.isBanned ? (
          <span className="inline-flex text-[11px] text-red-300 bg-red-500/10 border border-red-500/25 rounded-full px-2 py-0.5">banned</span>
        ) : p.isModerator ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-2 py-0.5">
            <ShieldCheck className="w-3 h-3" /> mod
          </span>
        ) : (
          <span className="text-xs text-white/30">member</span>
        )}
      </td>
      <td className="py-3 pr-4">
        <div className="flex items-center justify-end gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin text-white/40" />}
          {p.isBanned ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(() => unbanAdminChatUser(p.user.address), `${p.user.username || 'User'} unbanned`)}>
              Unban
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              className="text-red-300 border-red-400/30 hover:bg-red-500/10"
              onClick={() => {
                if (!window.confirm(`Ban ${p.user.username || p.user.address} from chat?`)) return;
                void run(() => banAdminChatUser(p.user.address), `${p.user.username || 'User'} banned`);
              }}
            >
              <ShieldBan className="w-3.5 h-3.5 mr-1" /> Ban
            </Button>
          )}
          {p.isModerator ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(() => removeAdminChatModerator(p.user.address), 'Moderator removed')}>
              <ShieldOff className="w-3.5 h-3.5 mr-1" /> Remove mod
            </Button>
          ) : (
            !p.isBanned && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(() => addAdminChatModerator(p.user.address), `${p.user.username || 'User'} is now a moderator`)}>
                <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Make mod
              </Button>
            )
          )}
        </div>
      </td>
    </tr>
  );
}

function ParticipantsCard() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ParticipantFilter>('all');
  const [page, setPage] = useState(1);
  const limit = 25;

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['admin-chat-participants', search, filter, page, limit],
    queryFn: () => listAdminChatParticipants({ page, limit, search: search || undefined, filter }),
    staleTime: 15_000,
  });

  const totalPages = data ? Math.max(1, data.pages) : 1;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center gap-2">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setSearch(searchInput.trim());
              setPage(1);
            }
          }}
          placeholder="Search username or address"
          className="h-9 w-full sm:w-64 rounded-xl bg-white/5 border border-white/10 text-xs text-white px-3 outline-none focus:border-white/30 placeholder:text-white/35"
        />
        <div className="flex flex-wrap gap-2">
          {PARTICIPANT_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => {
                setFilter(f.value);
                setPage(1);
              }}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs border transition-colors',
                filter === f.value
                  ? 'bg-white/15 text-white border-white/25'
                  : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-sm text-white/70">
          <span className="text-white font-medium">{(data?.total ?? 0).toLocaleString()}</span> participants
        </span>
        {isFetching && !isLoading && <Loader2 className="w-4 h-4 animate-spin text-white/40" />}
      </div>

      {isLoading ? (
        <DeHubPageLoader minHeight="40vh" />
      ) : isError ? (
        <div className="px-4 py-10 text-center text-sm text-red-300">
          {error instanceof Error ? error.message : 'Failed to load participants'}
        </div>
      ) : !data?.participants.length ? (
        <div className="px-4 py-10 text-center">
          <MessageSquare className="w-8 h-8 text-white/25 mx-auto mb-3" />
          <p className="text-sm text-white/50">No participants match these filters.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-white/40 border-b border-white/10">
                  <th className="py-2.5 pr-3 pl-4 font-medium">Member</th>
                  <th className="py-2.5 px-2 font-medium">Messages</th>
                  <th className="py-2.5 px-2 font-medium">Last message</th>
                  <th className="py-2.5 px-2 font-medium">Status</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.participants.map((p) => (
                  <ParticipantRow key={p.user.address} p={p} />
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between gap-3">
              <span className="text-xs text-white/50">
                Page {data.page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RoomCard() {
  const queryClient = useQueryClient();
  const { data: overview } = useQuery({
    queryKey: ['admin-chat-overview'],
    queryFn: getAdminChatOverview,
    staleTime: 30_000,
  });

  const room = overview?.room;
  const [slowMode, setSlowMode] = useState<boolean | null>(null);
  const [slowModeSeconds, setSlowModeSeconds] = useState<string | null>(null);
  const [minStake, setMinStake] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Null means "still following the server"; editing a field takes over locally.
  const currentSlowMode = slowMode ?? room?.slowMode ?? false;
  const currentSeconds = slowModeSeconds ?? String(room?.slowModeSeconds ?? 5);
  const currentMinStake = minStake ?? String(room?.minStakeRequired ?? 0);

  const save = async () => {
    setSaving(true);
    try {
      await updateAdminChatSettings({
        slowMode: currentSlowMode,
        slowModeSeconds: Math.max(0, parseInt(currentSeconds, 10) || 0),
        minStakeRequired: Math.max(0, parseFloat(currentMinStake) || 0),
      });
      toast.success('Chat settings saved');
      queryClient.invalidateQueries({ queryKey: ['admin-chat-overview'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const stats = [
    { label: 'Online now', value: overview?.onlineCount ?? 0 },
    { label: 'Messages', value: room?.messageCount ?? 0 },
    { label: 'Moderators', value: overview?.moderators.length ?? 0 },
    { label: 'Banned', value: overview?.bannedUsers.length ?? 0 },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden mb-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-white/[0.06] border-b border-white/[0.06]">
        {stats.map((s) => (
          <div key={s.label} className="px-4 py-4">
            <div className="text-xl font-semibold text-white">{s.value.toLocaleString()}</div>
            <div className="text-[11px] uppercase tracking-wide text-white/40 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <span className="text-sm text-white/70 w-full sm:w-auto">Room settings</span>
        <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer select-none">
          <Switch
            checked={currentSlowMode}
            onCheckedChange={(v) => setSlowMode(v)}
          />
          Slow mode
        </label>
        <label className="flex items-center gap-2 text-xs text-white/60">
          seconds
          <input
            type="number"
            min={0}
            value={currentSeconds}
            onChange={(e) => setSlowModeSeconds(e.target.value)}
            className="h-8 w-16 rounded-lg bg-white/5 border border-white/10 text-xs text-white px-2 outline-none focus:border-white/30"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-white/60">
          min stake DHB
          <input
            type="number"
            min={0}
            step="any"
            value={currentMinStake}
            onChange={(e) => setMinStake(e.target.value)}
            className="h-8 w-20 rounded-lg bg-white/5 border border-white/10 text-xs text-white px-2 outline-none focus:border-white/30"
          />
        </label>
        <Button size="sm" disabled={saving} onClick={() => void save()} className="ml-auto">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
          Save
        </Button>
      </div>
    </div>
  );
}

export default function AdminChatPage() {
  const [tab, setTab] = useState<Tab>('messages');

  return (
    <AdminShell title="Chat">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Chat</h1>
        <p className="text-sm text-white/60">
          The community chat room — moderate messages, manage moderators and bans, and tune room settings.
        </p>
      </div>

      <RoomCard />

      <div className="flex gap-2 mb-4">
        {(['messages', 'participants'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs border transition-colors capitalize',
              tab === t
                ? 'bg-white/15 text-white border-white/25'
                : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'messages' ? <MessagesCard /> : <ParticipantsCard />}
    </AdminShell>
  );
}
