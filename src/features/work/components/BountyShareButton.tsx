import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share2 } from 'lucide-react';
import { bountyUrl } from '../seo';
import type { WorkJob } from '../types';

const ShareEntityDrawer = lazy(() =>
  import('@/components/app/ShareEntityDrawer').then((m) => ({ default: m.ShareEntityDrawer }))
);

export function BountyShareButton({ job }: { job: WorkJob }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [activated, setActivated] = useState(false);

  return (
    <>
      <button
        type="button"
        data-no-navigate
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setActivated(true);
          setOpen(true);
        }}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15 transition-colors"
      >
        <Share2 className="w-3.5 h-3.5" /> {t('comments.share')}
      </button>
      {activated && (
        <Suspense fallback={null}>
          <ShareEntityDrawer open={open} onOpenChange={setOpen} url={bountyUrl(job)} shareTitle={job.title} />
        </Suspense>
      )}
    </>
  );
}
