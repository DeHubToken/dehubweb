import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchJobQuote, useJobQuote } from '@/hooks/use-ai-quote';
import { payForJob } from '@/lib/ai-payment';
import { collectLayers, exportLayers, importLayers, layerJobs, submitLayers, type LayerJob } from '@/lib/creator/imageLayers';
import type { ImageLayerSet, LayerChoice } from '@/lib/creator/imageLayersContract';
import type { GenerationJob } from '@/store/generationStore';
import { resumeLayerSubmission } from '@/lib/creator/layerSubmission';
import { useNavigate } from 'react-router-dom';
import { callCreatorLibrary } from '@/lib/creator/cloudLibrary';

const quoteRequest = { kind: 'tool' as const, modelId: 'qwen-image-layered', quantity: 1 };
export function ImageLayersPanel({ wallet, source, onOpenEditor }: { wallet: string; source: GenerationJob; onOpenEditor(): void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<LayerJob[]>([]), [set, setSet] = useState<ImageLayerSet | null>(null);
  const [choices, setChoices] = useState<LayerChoice[]>([]), [busy, setBusy] = useState(true), [error, setError] = useState('');
  const [preparedSource,setPreparedSource] = useState<{sourceDigest:string;sourcePreviewUrl:string} | null>(null);
  const preparationKey = `creator-layers:${wallet.toLowerCase()}:${source.id}`;
  const active = useRef({ wallet, id: source.id }); active.current = { wallet, id: source.id };
  const controller = useRef(new AbortController());
  const quote = useJobQuote(quoteRequest, !source.layerSetId && !!preparedSource);
  const current = () => active.current.wallet === wallet && active.current.id === source.id && !controller.current.signal.aborted;
  const refresh = async () => {
    const found:LayerJob[] = source.layerSetId ? [{ id: source.layerSetId, status: 'succeeded' }] : await layerJobs(wallet, source.id);
    if (!current()) return;
    setJobs(found);
    if (!source.layerSetId && !preparedSource) {
      const saved = JSON.parse(localStorage.getItem(preparationKey) || 'null');
      const sourceDigest = saved?.sourceDigest || found[0]?.sourceDigest;
      const prepared = await callCreatorLibrary(wallet,{action:'layer-source',sourceAssetId:source.id,...(sourceDigest?{sourceDigest}:{})});
      if (!current()) return; setPreparedSource(prepared);
    }
    if (found[0]) {
      const manifest = await collectLayers(wallet, found[0]);
      if (!current()) return;
      if (manifest) { setSet(manifest); setChoices(previous => previous.length ? previous : manifest.layers.map(layer => ({ id: layer.id, hidden: false }))); }
    }
  };
  useEffect(() => {
    controller.current = new AbortController();
    void refresh().catch(e => { if (current()) setError(e.message); }).finally(() => { if (current()) setBusy(false); });
    return () => controller.current.abort();
    // The parent keys this panel by owner and source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const run = async (action: () => Promise<void>) => {
    if (busy) return; setBusy(true); setError('');
    try { await action(); } catch (e) { if (current()) setError(e instanceof Error ? e.message : 'Could not load layers'); }
    finally { if (current()) setBusy(false); }
  };
  const separate = async () => {
    const fresh = await fetchJobQuote(quoteRequest);
    if (!current() || !preparedSource || fresh.priceDhb !== quote.priceDhb || fresh.priceDhb !== 60) throw new Error('Review the current price');
    const key = `creator-layers:${wallet.toLowerCase()}:${source.id}`;
    if (!navigator.locks) throw new Error('This browser cannot safely reserve a payment. Use a browser with Web Locks support.');
    await navigator.locks.request(key, { ifAvailable: true }, async lock => {
      if (!lock) throw new Error('This image is already being separated in another tab');
      await resumeLayerSubmission({ read: async () => JSON.parse(localStorage.getItem(key) || 'null'), write: async value => { localStorage.setItem(key, JSON.stringify(value)); } },
        { uuid: () => crypto.randomUUID(), sourceDigest:preparedSource.sourceDigest, current,
          beforePay: async () => {
            await callCreatorLibrary(wallet,{action:'layer-source',sourceAssetId:source.id,sourceDigest:preparedSource.sourceDigest});
            const boundaryQuote = await fetchJobQuote(quoteRequest);
            if (!current() || boundaryQuote.priceDhb !== fresh.priceDhb) throw new Error('Review the current price');
          },
          pay: () => payForJob(fresh.priceDhb), submit: (id, txHash, digest) => submitLayers(source.id, id, txHash, fresh.priceDhb, digest) });
    });
    await refresh();
  };
  const move = (index: number, delta: number) => setChoices(previous => {
    const next = [...previous], target = index + delta;
    if (target >= 0 && target < next.length) [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const button = 'min-h-11 rounded-lg border border-white/15 px-3 py-2 text-sm disabled:opacity-40';
  const pending = jobs.some(job => !['failed','canceled','cancelled'].includes(job.status));
  return <section className="space-y-3 rounded-xl border border-white/15 p-3">
    <h3>{t('creator.layerTitle', { defaultValue: 'Separate image layers' })}</h3>
    <p className="text-sm">{t('creator.layerPngRequired', { defaultValue: 'Choose a saved PNG image, up to 12 MiB and four megapixels.' })}</p>
    {!source.layerSetId && preparedSource && <img src={preparedSource.sourcePreviewUrl} alt={t('creator.layerSource', { defaultValue: 'Original image' })} className="max-h-32 object-contain" />}
    <p className="text-sm">{t('creator.layerDescription', { defaultValue: 'Four transparent PNG layers. Text remains part of each image.' })}</p>
    {error && <p role="alert">{error}</p>}
    {!pending && !source.layerSetId && <button className={button} disabled={busy || !preparedSource || quote.isLoading || !!quote.error || !quote.priceDhb} onClick={() => void run(separate)}>
      {t('creator.layerSeparate', { defaultValue: 'Separate layers' })} · {quote.priceDhb || '…'} DHB
    </button>}
    {jobs.length > 0 && !set && <p role="status">{t('creator.layerPending', { defaultValue: 'Saved job: {{status}}. Collect or retry saving without another payment.', status: jobs[0].status })}</p>}
    <button className={button} disabled={busy} onClick={() => void run(refresh)}>{t('creator.layerCollect', { defaultValue: 'Collect / retry save' })}</button>
    {set && <>
      <div className="grid grid-cols-2 gap-2">{choices.map((choice, index) => { const layer = set.layers.find(layer => layer.id === choice.id)!; return <div key={choice.id} className="space-y-1">
        <img src={layer.url} alt={`Layer ${layer.index + 1}`} className="aspect-square w-full object-contain" style={{ backgroundColor: '#eee', backgroundImage: 'conic-gradient(#ccc 25%,transparent 0 50%,#ccc 0 75%,transparent 0)', backgroundSize: '16px 16px', opacity: choice.hidden ? 0.35 : 1 }} />
        <p>Layer {layer.index + 1}</p>
        <button className={button} disabled={busy || index === 0} onClick={() => move(index, -1)}>↑</button><button className={button} disabled={busy || index === 3} onClick={() => move(index, 1)}>↓</button>
        <button className={button} disabled={busy} aria-pressed={choice.hidden} onClick={() => setChoices(previous => previous.map(c => c.id === choice.id ? { ...c, hidden: !c.hidden } : c))}>{t(choice.hidden ? 'editor.layers.show' : 'editor.layers.hide', { defaultValue: choice.hidden ? 'Show' : 'Hide' })}</button>
      </div>; })}</div>
      <button className={button} disabled={busy} onClick={() => void run(async () => { const fresh = await collectLayers(wallet, { id: set.id, status: 'succeeded' }); if (fresh) { await importLayers(fresh, choices, wallet, current, controller.current.signal); if (current()) { onOpenEditor(); navigate('/editor'); } } })}>{t('creator.layerOpen', { defaultValue: 'Open layers in editor' })}</button>
      <button className={button} disabled={busy} onClick={() => void run(async () => { const fresh = await collectLayers(wallet, { id: set.id, status: 'succeeded' }); if (fresh) await exportLayers(fresh, choices, controller.current.signal); })}>{t('creator.layerExport', { defaultValue: 'Export PNG layers + manifest ZIP' })}</button>
    </>}
  </section>;
}
