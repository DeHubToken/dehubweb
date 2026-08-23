import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, ShieldCheck } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buildAvatarUrl } from '@/lib/media-url';
import {
  listAdminContentReports,
  listAdminUserReports,
  type AdminContentReportItem,
  type AdminContentReportsListResponse,
  type AdminReportStatus,
  type AdminReportsKind,
  type AdminReportStatusSummary,
  type AdminUserReportItem,
  type AdminUserReportsListResponse,
} from '@/lib/api/dehub/admin';
import { cn } from '@/lib/utils';
import { DeHubPageLoader } from '@/components/app/DeHubLoader';

const STATUS_OPTIONS: { value: 'all' | AdminReportStatus; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'action_taken', label: 'Action taken' },
  { value: 'dismissed', label: 'Dismissed' },
];

const REASON_LABELS: Record<string, string> = {
  sexual_content: 'Sexual content',
  violent_content: 'Violent content',
  hateful_content: 'Hateful content',
  harassment_bullying: 'Harassment / bullying',
  harmful_dangerous: 'Harmful / dangerous',
  misinformation: 'Misinformation',
  child_abuse: 'Child abuse',
  spam_misleading: 'Spam / misleading',
  scam_fraud: 'Scam / fraud',
  infringes_rights: 'Infringes rights',
  impersonation: 'Impersonation',
  hateful_behavior: 'Hateful behavior',
  spam: 'Spam',
  underage: 'Underage',
  inappropriate_profile: 'Inappropriate profile',
  other: 'Other',
};

const selectCls =
  'h-10 rounded-xl bg-white/5 border border-white/10 text-sm text-white px-3 outline-none focus:border-white/30';

function reasonLabel(reason?: string): string {
  if (!reason) return '—';
  return (
    REASON_LABELS[reason] ||
    reason.charAt(0).toUpperCase() + reason.slice(1).replace(/_/g, ' ')
  );
}

function StatusBadge({ status }: { status: AdminReportStatus }) {
  const styles =
    status === 'pending'
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
      : status === 'action_taken'
        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
        : status === 'reviewed'
          ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
          : 'bg-white/5 text-white/50 border-white/15';
  return (
    <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[11px] border capitalize whitespace-nowrap', styles)}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function PersonCell({
  user,
  fallbackLabel,
}: {
  user?: { address?: string; username?: string; displayName?: string; avatarImageUrl?: string };
  fallbackLabel: string;
}) {
  const name = user?.displayName || user?.username || user?.address?.slice(0, 10) || fallbackLabel;
  const avatar = user?.avatarImageUrl && user?.address ? buildAvatarUrl(user.address, user.avatarImageUrl) : undefined;
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

function TargetCell({ report }: { report: AdminContentReportItem | AdminUserReportItem }) {
  if ('tokenId' in report) {
    const t = report.token;
    return (
      <div className="min-w-[140px]">
        <Link to={`/video/${report.tokenId}`} className="text-sm text-white hover:underline inline-flex items-center gap-1 max-w-[220px] truncate">
          {t?.name || `Post #${report.tokenId}`}
        </Link>
        <div className="text-[11px] text-white/40 capitalize">
          #{report.tokenId}
          {t?.postType ? ` · ${t.postType.replace(/_/g, ' ')}` : ''}
          {t?.status === 'deleted' ? ' · deleted' : ''}
        </div>
      </div>
    );
  }
  const u = report.targetUser;
  if (!u) return <span className="text-sm text-white/40">—</span>;
  return (
    <div className="min-w-[140px]">
      {u.username ? (
        <Link to={`/${u.username}`} className="text-sm text-white hover:underline block max-w-[220px] truncate">
          @{u.username}
        </Link>
      ) : (
        <span className="text-sm text-white/70 font-mono">{u.address?.slice(0, 10) || 'Unknown user'}</span>
      )}
      {u.isBanned && <div className="text-[11px] text-red-300">banned{u.bannedReason ? ` · ${u.bannedReason}` : ''}</div>}
    </div>
  );
}

function ReviewedCell({
  admin,
  reviewedAt,
}: {
  admin?: { email: string; firstName?: string; lastName?: string; role: string };
  reviewedAt?: string;
}) {
  if (!admin) return <span className="text-xs text-white/40">—</span>;
  const name = [admin.firstName, admin.lastName].filter(Boolean).join(' ');
  return (
    <div className="min-w-[150px]">
      <div className="text-sm text-white truncate" title={admin.email}>
        {name || admin.email}
      </div>
      <div className="text-[11px] text-white/40 capitalize">
        {admin.role.replace(/_/g, ' ')}
        {reviewedAt ? ` · ${formatDistanceToNow(new Date(reviewedAt), { addSuffix: true })}` : ''}
      </div>
    </div>
  );
}

type ReportRow = AdminContentReportItem | AdminUserReportItem;
type ReportsResponse = AdminContentReportsListResponse | AdminUserReportsListResponse;

function ReportRowView({ report }: { report: ReportRow }) {
  return (
    <tr className="border-b border-white/[0.06] hover:bg-white/[0.02]">
      <td className="py-3 pr-3 pl-4"><PersonCell user={report.reporter} fallbackLabel="Unknown reporter" /></td>
      <td className="py-3 px-2"><TargetCell report={report} /></td>
      <td className="py-3 px-2">
        <div className="min-w-[160px] max-w-[280px]">
          <div className="text-sm text-white/80">{reasonLabel(report.reason)}</div>
          {('tokenId' in report ? report.additionalInfo || report.description : report.additionalInfo) && (
            <div className="text-[11px] text-white/45 line-clamp-2 mt-0.5">
              {'tokenId' in report ? report.additionalInfo || report.description : report.additionalInfo}
            </div>
          )}
        </div>
      </td>
      <td className="py-3 px-2"><StatusBadge status={report.status} /></td>
      <td className="py-3 px-2"><ReviewedCell admin={report.reviewedByAdmin} reviewedAt={report.reviewedAt} /></td>
      <td className="py-3 pr-4 text-xs text-white/60 whitespace-nowrap">
        {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
      </td>
    </tr>
  );
}

export default function AdminModerationPage() {
  const [kind, setKind] = useState<AdminReportsKind>('content');
  const [status, setStatus] = useState<'all' | AdminReportStatus>('all');
  const [page, setPage] = useState(1);
  const limit = 25;

  const queryKey = useMemo(() => ['admin-reports', kind, page, limit, status], [kind, page, status]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<ReportsResponse, Error>({
    queryKey,
    queryFn: (): Promise<ReportsResponse> =>
      kind === 'content'
        ? listAdminContentReports({ page, limit, status })
        : listAdminUserReports({ page, limit, status }),
    staleTime: 30_000,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const summary: AdminReportStatusSummary | undefined = data?.summary;

  return (
    <AdminShell title="Moderation">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Moderation</h1>
        <p className="text-sm text-white/60">
          Every report filed across DeHub — who reported it, what happened, and which admin handled it.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          {(['content', 'users'] as AdminReportsKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => { setKind(k); setPage(1); }}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs border transition-colors capitalize',
                kind === k
                  ? 'bg-white/15 text-white border-white/25'
                  : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10',
              )}
            >
              {k === 'content' ? 'Content reports' : 'User reports'}
            </button>
          ))}
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as 'all' | AdminReportStatus); setPage(1); }}
          className={cn(selectCls, 'sm:ml-auto')}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-zinc-900">{o.label}</option>
          ))}
        </select>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="text-sm text-white/70">
            {data ? (
              <>
                <span className="text-white font-medium">{data.total.toLocaleString()}</span>{' '}
                {kind === 'content' ? 'content reports' : 'user reports'}
                {summary && summary.pending > 0 && (
                  <> · <span className="text-amber-300">{summary.pending.toLocaleString()} pending</span></>
                )}
                {status !== 'all' && ` · ${STATUS_OPTIONS.find((o) => o.value === status)?.label.toLowerCase()}`}
              </>
            ) : (
              'Loading…'
            )}
          </div>
          {isFetching && !isLoading && <Loader2 className="w-4 h-4 animate-spin text-white/40" />}
        </div>

        {isLoading ? (
          <DeHubPageLoader minHeight="40vh" />
        ) : isError ? (
          <div className="px-4 py-10 text-center">
            <ShieldCheck className="w-8 h-8 text-white/25 mx-auto mb-3" />
            <p className="text-sm text-red-300 mb-3">
              {error instanceof Error ? error.message : 'Failed to load reports'}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : !data?.items.length ? (
          <div className="px-4 py-10 text-center">
            <ShieldCheck className="w-8 h-8 text-white/25 mx-auto mb-3" />
            <p className="text-sm text-white/50">No reports match these filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-white/40 border-b border-white/10">
                  <th className="py-2.5 pr-3 pl-4 font-medium">Reported by</th>
                  <th className="py-2.5 px-2 font-medium">Target</th>
                  <th className="py-2.5 px-2 font-medium">Reason</th>
                  <th className="py-2.5 px-2 font-medium">Outcome</th>
                  <th className="py-2.5 px-2 font-medium">Processed by</th>
                  <th className="py-2.5 pr-4 font-medium">Filed</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((report) => (
                  <ReportRowView key={report._id} report={report} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > data.limit && (
          <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between gap-3">
            <span className="text-xs text-white/50">
              Page {data.page} of {totalPages}
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
