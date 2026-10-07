import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Film, X } from 'lucide-react';
import { useGenerationStore } from '@/store/generationStore';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export interface CreatorReferenceAsset {
  url: string;
  label: string;
  kind: 'image' | 'video';
  seconds?: number;
  file?: File;
  posterUrl?: string;
}

export const ReferenceAssets = memo(function ReferenceAssets({ assets, onAdd, onRemove, onMention, allowVideo, singleImage = false, libraryOpen, onLibraryOpenChange }: {
  assets: CreatorReferenceAsset[];
  onAdd: (asset: CreatorReferenceAsset) => void;
  onRemove: (asset: CreatorReferenceAsset) => void;
  onMention: (tag: string) => void;
  allowVideo: boolean;
  singleImage?: boolean;
  libraryOpen: boolean;
  onLibraryOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const jobs = useGenerationStore(s => s.jobs);
  const library = jobs.filter(j => j.status === 'done' && j.url && (j.kind === 'image' || (allowVideo && j.kind === 'video')));
  let imageNumber = 0;
  return <div className="mb-2">
    <div className="flex flex-wrap gap-2">
      {assets.map(asset => {
        const tag = asset.kind === 'video' ? '@Video1' : `@Image${++imageNumber}`;
        return <div key={asset.url} className="flex max-w-full items-center gap-2 rounded-xl border border-white/15 bg-black/30 p-1.5">
          {asset.kind === 'image' || asset.posterUrl ? <img src={asset.posterUrl || asset.url} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <video src={`${asset.url}#t=0.1`} muted playsInline preload="metadata" className="h-10 w-10 rounded-lg object-cover" />}
          <button type="button" onClick={() => onMention(tag)} className="min-w-0 text-left" aria-label={t('creator.referenceInsert', { tag })}>
            <span className="block text-xs font-semibold text-white">{tag}</span>
            <span className="block max-w-36 truncate text-[11px] text-white/50">{asset.label}</span>
          </button>
          <button type="button" onClick={() => onRemove(asset)} className="p-2 text-white/60 hover:text-white" aria-label={t('creator.removeAttachedFile')}><X className="h-3.5 w-3.5" /></button>
        </div>;
      })}
    </div>
    {assets.length > 0 && <p className="mt-1 text-xs text-white/50">{t(singleImage ? 'creator.referenceSingle' : 'creator.referenceHint')}</p>}
    <Dialog open={libraryOpen} onOpenChange={onLibraryOpenChange}>
      <DialogContent className="max-h-[80dvh] overflow-y-auto border-white/15 bg-[#111214] text-white">
        <DialogTitle>{t('creator.referenceLibrary')}</DialogTitle>
        {!library.length && <p className="text-sm text-white/60">{t('creator.libraryEmpty')}</p>}
        <div className="grid grid-cols-2 gap-3">
          {library.map(job => <button key={job.id} type="button" className="overflow-hidden rounded-xl border border-white/15 text-left" onClick={() => {
            onAdd({ url: job.url!, label: job.prompt || job.modelName, kind: job.kind as 'image' | 'video', posterUrl: job.posterUrl });
            onLibraryOpenChange(false);
          }}>
            {job.kind === 'image' || job.posterUrl ? <img src={job.posterUrl || job.url} loading="lazy" alt="" className="aspect-square w-full object-cover" /> : <span className="flex aspect-square items-center justify-center"><Film className="h-8 w-8" /></span>}
            <span className="block truncate p-2 text-xs">{job.prompt || job.modelName}</span>
          </button>)}
        </div>
      </DialogContent>
    </Dialog>
  </div>;
});
