import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Loader2, Music2, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import examples from '@/lib/creator/examples.json';
import type { PresetKind } from '@/lib/creator/presets';

const Model3dViewer = lazy(() => import('./Model3dViewer').then((module) => ({ default: module.Model3dViewer })));

/** Published provider examples, labelled separately from presets and personal results. */
export function GenerationExample({ kind }: { kind: PresetKind }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setOpen(false); setFailed(false); }, [kind]);
  const example = examples[kind];
  const label = `${t('creator.exampleOutput')} · ${example.model}`;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={label}
        className="mb-3 flex w-full items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] p-2 text-left transition hover:bg-white/[0.08]">
        <span className="relative flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5">
          {!failed && (kind === 'image' || kind === '3d') && <img src={kind === '3d' ? examples['3d'].posterUrl : example.url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover" />}
          {!failed && kind === 'video' && <video src={`${example.url}#t=0.1`} muted playsInline preload="metadata" onError={() => setFailed(true)} className="h-full w-full object-cover" />}
          {kind === 'audio' ? <Music2 className="h-5 w-5 text-white/60" /> : (failed || kind === 'video') && <Play className="absolute h-5 w-5 text-white drop-shadow" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-white/85">{t('creator.exampleOutput')}</span>
          <span className="mt-1 block truncate text-[11px] text-white/45">{example.model}</span>
        </span>
        {kind === '3d' ? <Box className="mr-2 h-4 w-4 text-white/50" /> : <Play className="mr-2 h-4 w-4 text-white/50" />}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-keep-dark className="max-w-3xl border-white/15 bg-zinc-950 text-white">
          <DialogTitle>{label}</DialogTitle>
          {kind === 'image' && <img src={example.url} alt={label} className="max-h-[70dvh] w-full rounded-lg object-contain" />}
          {kind === 'video' && <video src={example.url} controls playsInline preload="metadata" className="max-h-[70dvh] w-full rounded-lg" />}
          {kind === 'audio' && <audio src={example.url} controls preload="metadata" className="w-full" />}
          {kind === '3d' && <div className="h-[min(60dvh,480px)]"><Suspense fallback={<Loader2 className="m-auto h-6 w-6 animate-spin" />}><Model3dViewer url={example.url} className="h-full" /></Suspense></div>}
        </DialogContent>
      </Dialog>
    </>
  );
}
