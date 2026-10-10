import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { useState } from 'react';
import { Reply } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCommentOnApplication } from '../hooks/use-application-comments';
import type { WorkApplication, WorkApplicationComment } from '../types';
import { WorkUser } from './WorkUser';

export function ApplicationComments({ application, comments, canReply }: {
  application: WorkApplication;
  comments: WorkApplicationComment[];
  canReply: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useSurfaceDraft("features/work/components/ApplicationComments.tsx:body", '', application.id);
  const mutation = useCommentOnApplication();

  return (
    <div>
      {comments.length > 0 && (
        <div className="mt-3 ml-2 border-l border-white/10 pl-3 space-y-3">
          {comments.map(comment => (
            <div key={comment.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <WorkUser address={comment.author_address} />
                <time dateTime={comment.created_at} className="text-[10px] text-white/40">
                  {new Date(comment.created_at).toLocaleString()}
                </time>
              </div>
              <p className="mt-1 text-sm text-white/70 whitespace-pre-wrap break-words">{comment.body}</p>
            </div>
          ))}
        </div>
      )}
      {canReply && !open && (
        <button onClick={() => setOpen(true)} className="mt-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold inline-flex items-center gap-1.5">
          <Reply className="w-3.5 h-3.5" /> {t('messages.reply')}
        </button>
      )}
      {canReply && open && (
        <form className="mt-3 space-y-2" onSubmit={event => {
          event.preventDefault();
          if (!body.trim() || mutation.isPending) return;
          mutation.mutate({ job_id: application.job_id, application_id: application.id, body }, {
            onSuccess: () => { setBody.complete(body, ''); setOpen(false); },
          });
        }}>
          <textarea autoFocus aria-label={t('messages.reply')} placeholder={t('comments.composerPlaceholder')}
            value={body} onChange={event => setBody(event.target.value)} maxLength={2000} rows={3}
            disabled={mutation.isPending}
            className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40" />
          {mutation.isError && <p role="alert" className="text-xs text-red-300">{t('common.somethingWentWrong')}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={!body.trim() || mutation.isPending} className="px-3 py-1.5 rounded-lg bg-white text-black text-xs font-semibold disabled:opacity-40">
              {t('comments.post')}
            </button>
            <button type="button" disabled={mutation.isPending} onClick={() => { mutation.reset(); setOpen(false); }} className="px-3 py-1.5 text-xs text-white/60">
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
