/**
 * Support Ticket Drawer
 * =====================
 * The Support button's whole surface: what you have already filed, and a form
 * to file something new.
 *
 * Deliberately not a conversation. The assistant can raise a ticket too, but
 * that route spends a paid model round trip to fill in a form, and it reads the
 * statuses back in its own words — which is the last thing somebody chasing a
 * two-week-old bug report wants. This talks to `/api/support` directly: no
 * quote, no DHB transfer, no paraphrase.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, Loader2, Plus, ArrowLeft, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_SEVERITIES,
  createSupportTicket,
  getMySupportTickets,
  isTicketOpen,
  type SupportCategory,
  type SupportSeverity,
  type SupportTicket,
} from '@/lib/api/dehub/support';

export const SUPPORT_TICKETS_QUERY_KEY = ['support', 'tickets'] as const;

interface SupportTicketDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Signed in? The button is hidden when not, but the drawer can be deep-linked. */
  enabled?: boolean;
}

/**
 * Read the caller's tickets. Exported so the header button can show how many
 * are still open without mounting the drawer — the count is the entire reason
 * somebody clicks it.
 */
export function useMySupportTickets(enabled: boolean) {
  return useQuery({
    queryKey: SUPPORT_TICKETS_QUERY_KEY,
    queryFn: () => getMySupportTickets(25),
    enabled,
    staleTime: 60_000,
    // A support desk is not worth a toast on every failed poll; the drawer
    // shows the error, the badge just stays absent.
    retry: 1,
  });
}

function StatusPill({ status }: { status: string }) {
  const { t } = useTranslation();
  const open = isTicketOpen(status);
  const Icon = status === 'resolved' ? CheckCircle2 : open ? Clock : AlertCircle;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border shrink-0 ${
        open ? 'border-white/30 text-white' : 'border-white/10 text-white/50'
      }`}
    >
      <Icon className="w-3 h-3" />
      {t(`support.status.${status}`)}
    </span>
  );
}

/** Dates arrive as strings from the API and are occasionally absent. */
function safeDistance(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return formatDistanceToNow(date, { addSuffix: true });
}

function TicketRow({ ticket }: { ticket: SupportTicket }) {
  const { t } = useTranslation();
  const filed = safeDistance(ticket.createdAt);
  const updated = safeDistance(ticket.updatedAt);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-white font-medium truncate">{ticket.subject}</p>
          <p className="text-[11px] text-white/40 mt-0.5">
            {ticket.ref} · {t(`support.category.${ticket.category}`)}
          </p>
        </div>
        <StatusPill status={ticket.status} />
      </div>

      {/* The only thing on a ticket written for the reporter to read. A row
          without one is just a line; a row with one is the answer. */}
      {ticket.resolution && (
        <p className="text-xs text-white/70 border-l-2 border-white/20 pl-2">{ticket.resolution}</p>
      )}

      <p className="text-[11px] text-white/35">
        {t('support.filedAgo', { when: filed })}
        {updated && updated !== filed ? ` · ${t('support.updatedAgo', { when: updated })}` : ''}
      </p>
    </div>
  );
}

export function SupportTicketDrawer({ open, onOpenChange, enabled = true }: SupportTicketDrawerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [composing, setComposing] = useState(false);

  const [category, setCategory] = useState<SupportCategory>('bug');
  const [severity, setSeverity] = useState<SupportSeverity>('normal');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  // Only fetch while the drawer is actually open; the header badge runs the
  // same query and the two share one cache entry.
  const { data, isLoading, isError, refetch } = useMySupportTickets(enabled && open);

  // Opening the drawer is the user asking "what happened to my ticket", so the
  // answer should not be a minute stale.
  useEffect(() => {
    if (open) refetch();
  }, [open, refetch]);

  const { openTickets, closedTickets } = useMemo(() => {
    const tickets = data?.tickets ?? [];
    return {
      openTickets: tickets.filter((ticket) => isTicketOpen(ticket.status)),
      closedTickets: tickets.filter((ticket) => !isTicketOpen(ticket.status)),
    };
  }, [data]);

  const resetForm = () => {
    setSubject('');
    setDescription('');
    setStepsToReproduce('');
    setCategory('bug');
    setSeverity('normal');
  };

  const file = useMutation({
    mutationFn: () =>
      createSupportTicket({
        category,
        severity,
        subject: subject.trim(),
        description: description.trim(),
        stepsToReproduce: stepsToReproduce.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        relatedUrl: window.location.href,
      }),
    onSuccess: (result) => {
      // The server hands back the ticket you already have rather than opening a
      // second one for the same complaint — say so, or it reads as a bug.
      if (result.duplicateOf) {
        toast.info(t('support.alreadyOpen', { ref: result.duplicateOf }));
      } else if (result.emailed) {
        toast.success(t('support.filed', { ref: result.ref }));
      } else {
        // Recorded, but the mail did not leave. The reference still resolves,
        // so this is "we have it", not "try again".
        toast.success(t('support.filedNotEmailed', { ref: result.ref }));
      }
      resetForm();
      setComposing(false);
      queryClient.invalidateQueries({ queryKey: SUPPORT_TICKETS_QUERY_KEY });
    },
    onError: (error: Error) => {
      // The API's refusals are written for the reporter ("the description is
      // too thin to act on", "you have already opened three tickets today") —
      // show them, do not replace them with a generic failure.
      toast.error(error?.message || t('support.filingFailed'));
    },
  });

  const canSubmit = subject.trim().length >= 3 && description.trim().length >= 20 && !file.isPending;

  const fieldClass =
    'w-full bg-zinc-900/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30';

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column glass className="border-t border-white/10">
        <DrawerHeader className="border-b border-white/10">
          <DrawerTitle className="text-white flex items-center gap-2">
            {composing ? (
              <button
                type="button"
                onClick={() => setComposing(false)}
                className="p-1 -ml-1 rounded-lg text-white/60 hover:text-white transition-colors"
                aria-label={t('support.backToTickets')}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <LifeBuoy className="w-5 h-5 text-white" />
            )}
            {composing ? t('support.newTicket') : t('support.title')}
          </DrawerTitle>
          <p className="text-xs text-white/40 text-left">
            {composing ? t('support.newTicketHint') : t('support.subtitle')}
          </p>
        </DrawerHeader>

        <ScrollArea className="h-[70vh]">
          <div className="p-4 space-y-4">
            {composing ? (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (canSubmit) file.mutate();
                }}
              >
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-xs text-white/50">{t('support.categoryLabel')}</span>
                    <select
                      value={category}
                      onChange={(event) => setCategory(event.target.value as SupportCategory)}
                      className={fieldClass}
                    >
                      {SUPPORT_CATEGORIES.map((value) => (
                        <option key={value} value={value} className="bg-zinc-900">
                          {t(`support.category.${value}`)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs text-white/50">{t('support.severityLabel')}</span>
                    <select
                      value={severity}
                      onChange={(event) => setSeverity(event.target.value as SupportSeverity)}
                      className={fieldClass}
                    >
                      {SUPPORT_SEVERITIES.map((value) => (
                        <option key={value} value={value} className="bg-zinc-900">
                          {t(`support.severity.${value}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="text-xs text-white/50">{t('support.subjectLabel')}</span>
                  <input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    maxLength={160}
                    placeholder={t('support.subjectPlaceholder')}
                    className={fieldClass}
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-white/50">{t('support.descriptionLabel')}</span>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={4000}
                    rows={5}
                    placeholder={t('support.descriptionPlaceholder')}
                    className={`${fieldClass} resize-none`}
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-white/50">{t('support.stepsLabel')}</span>
                  <textarea
                    value={stepsToReproduce}
                    onChange={(event) => setStepsToReproduce(event.target.value)}
                    maxLength={2000}
                    rows={3}
                    placeholder={t('support.stepsPlaceholder')}
                    className={`${fieldClass} resize-none`}
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-white/50">{t('support.contactEmailLabel')}</span>
                  <input
                    value={contactEmail}
                    onChange={(event) => setContactEmail(event.target.value)}
                    type="email"
                    placeholder={t('support.contactEmailPlaceholder')}
                    className={fieldClass}
                  />
                </label>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-white text-black py-2.5 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {file.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {file.isPending ? t('support.submitting') : t('support.submit')}
                </button>
              </form>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setComposing(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] py-2.5 text-sm text-white hover:bg-white/10 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {t('support.newTicket')}
                </button>

                {isLoading && (
                  <div className="flex items-center justify-center py-8 text-white/40">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                )}

                {isError && !isLoading && (
                  <p className="text-sm text-white/50 text-center py-6">{t('support.loadFailed')}</p>
                )}

                {!isLoading && !isError && openTickets.length === 0 && closedTickets.length === 0 && (
                  <p className="text-sm text-white/40 text-center py-8">{t('support.noTickets')}</p>
                )}

                {openTickets.length > 0 && (
                  <section className="space-y-2">
                    <h3 className="text-xs uppercase tracking-wider text-white/40">
                      {t('support.openHeading', { n: openTickets.length })}
                    </h3>
                    {openTickets.map((ticket) => (
                      <TicketRow key={ticket.ref} ticket={ticket} />
                    ))}
                  </section>
                )}

                {closedTickets.length > 0 && (
                  <section className="space-y-2">
                    <h3 className="text-xs uppercase tracking-wider text-white/40">
                      {t('support.closedHeading', { n: closedTickets.length })}
                    </h3>
                    {closedTickets.map((ticket) => (
                      <TicketRow key={ticket.ref} ticket={ticket} />
                    ))}
                  </section>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}

export default SupportTicketDrawer;
