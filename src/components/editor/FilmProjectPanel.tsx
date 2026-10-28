import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useEditorStore } from '@/store/editorStore';
import { useEditorUiStore } from '@/store/editorUiStore';
import { saveProject } from '@/lib/editor/projectStore';
import { filmShotDraft, filmProjectMediaIds, removeFilmProjectMedia, validFilmProject, type FilmProject, type FilmShot } from '@/lib/editor/filmProject';
import { CinemaDirectionControls } from '../app/creator/studio/CinemaDirectionControls';
import { ReviewedBatchButton } from '../app/creator/ReviewedBatchButton';
import { filmReviewedBatch } from '@/lib/creator/reviewedBatchDrafts';

export function FilmProjectPanel() {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const owner = useRef(walletAddress); owner.current = walletAddress;
  const settings = useEditorStore(state => state.settings);
  const media = useEditorStore(state => state.media);
  const projectId = useEditorStore(state => state.projectId);
  const [selected, setSelected] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [issue, setIssue] = useState(false);
  const film = validFilmProject(settings.filmProject) ? settings.filmProject : undefined;
  const update = (next: FilmProject) => { useEditorStore.getState().updateSettings({ filmProject: next }); setIssue(false); };
  const button = 'rounded-lg border border-white/20 px-3 py-2 text-xs disabled:opacity-40';
  const input = 'w-full rounded-xl border border-white/20 bg-transparent p-2 text-sm';
  if (!film) return <section className="my-4 rounded-2xl border border-white/15 p-3">
    <h3 className="font-semibold">{t('editor.film.title')}</h3>
    <p className="my-2 text-xs opacity-70">{t('editor.film.intro')}</p>
    <button type="button" className={button} onClick={() => update({ version: 1, title: '', brief: '', referenceMediaIds: [], shots: [] })}>{t('editor.film.create')}</button>
  </section>;
  const shot = film.shots.find(item => item.id === selected) ?? film.shots[0];
  const missing = new Set(filmProjectMediaIds(film).filter(id => !media.some(item => item.id === id)));
  const changeShot = (patch: Partial<FilmShot>) => update({ ...film, shots: film.shots.map(item => item.id === shot?.id ? { ...item, ...patch } : item) });
  const chooseReferences = (value: string[], apply: (ids: string[]) => void) => { if (value.length <= 4) apply(value); };
  const references = (value: string[], apply: (ids: string[]) => void, label: string) => <label className="mt-3 block text-xs">{label}
    <select multiple value={value} className={`${input} mt-1`} size={3} onChange={event => chooseReferences(Array.from(event.target.selectedOptions, option => option.value), apply)}>
      {media.filter(item => item.kind === 'image').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
  </label>;
  const prepare = async (kind: 'image' | 'video') => {
    if (preparing || !shot) return;
    const store = useEditorStore.getState(), snapshot = store.toSnapshot(), capturedOwner = owner.current;
    const draft = filmShotDraft(film, shot.id, kind, media, settings.aspectPreset, snapshot.id, capturedOwner);
    if (!draft) { setIssue(true); return; }
    setPreparing(true);
    try {
      await saveProject(snapshot);
      const latest = useEditorStore.getState().toSnapshot();
      if (owner.current !== capturedOwner || latest.id !== snapshot.id || JSON.stringify(latest.settings.filmProject) !== JSON.stringify(film)) { setIssue(true); return; }
      useEditorUiStore.getState().setGeneratePrefill(draft);
      useEditorUiStore.getState().setGeneratorWindow('open');
    } catch { setIssue(true); } finally { setPreparing(false); }
  };
  return <section className="my-4 rounded-2xl border border-white/15 p-3">
    <h3 className="font-semibold">{t('editor.film.title')}</h3>
    <p className="my-2 text-xs opacity-70">{t('editor.film.intro')}</p>
    {missing.size > 0 && <button type="button" className={button} onClick={() => { const clean = removeFilmProjectMedia(film, missing); if (clean) update(clean); }}>{t('editor.film.repairRefs')}</button>}
    <label className="mt-3 block text-xs">{t('editor.film.name')}<input className={`${input} mt-1`} value={film.title} maxLength={200} onChange={event => update({ ...film, title: event.target.value })} /></label>
    <label className="mt-3 block text-xs">{t('editor.film.brief')}<textarea className={`${input} mt-1`} rows={3} value={film.brief} maxLength={3000} onChange={event => update({ ...film, brief: event.target.value })} /></label>
    {references(film.referenceMediaIds, ids => update({ ...film, referenceMediaIds: ids }), t('editor.film.sharedReferences'))}
    <div className="my-3 flex flex-wrap gap-2">
      {film.shots.map((item, index) => <button type="button" key={item.id} aria-pressed={item.id === shot?.id} className={button} onClick={() => setSelected(item.id)}>{index + 1}. {item.title || t('editor.film.shot')}</button>)}
      <button type="button" className={button} disabled={film.shots.length >= 12} onClick={() => {
        const id = crypto.randomUUID(); update({ ...film, shots: [...film.shots, { id, title: '', prompt: '', seconds: 5, referenceMediaIds: [] }] }); setSelected(id);
      }}>{t('editor.film.addShot')}</button>
    </div>
    {shot && <div className="rounded-xl border border-white/15 p-3">
      <label className="block text-xs">{t('editor.film.shotName')}<input className={`${input} mt-1`} value={shot.title} maxLength={200} onChange={event => changeShot({ title: event.target.value })} /></label>
      <label className="mt-3 block text-xs">{t('editor.film.action')}<textarea className={`${input} mt-1`} rows={3} value={shot.prompt} maxLength={2000} onChange={event => changeShot({ prompt: event.target.value })} /></label>
      <label className="mt-3 block text-xs">{t('editor.film.seconds')}<input className={`${input} mt-1`} type="number" min={1} max={30} value={shot.seconds} onChange={event => { const seconds = Number(event.target.value); if (seconds >= 1 && seconds <= 30) changeShot({ seconds }); }} /></label>
      {references(shot.referenceMediaIds, ids => changeShot({ referenceMediaIds: ids }), t('editor.film.shotReferences'))}
      <div className="mt-3"><CinemaDirectionControls value={shot.direction ?? {}} onChange={direction => changeShot({ direction })} mode="video" /></div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={button} disabled={preparing || !shot.prompt.trim()} onClick={() => void prepare('image')}>{t('editor.film.frame')}</button>
        <button type="button" className={button} disabled={preparing || !shot.prompt.trim()} onClick={() => void prepare('video')}>{t('editor.film.video')}</button>
      </div>
      <p className="mt-2 text-xs opacity-70">{t('editor.film.review')}</p>
      <label className="mt-3 block text-xs">{t('editor.film.result')}<select className={`${input} mt-1`} value={shot.resultMediaId ?? ''} onChange={event => changeShot({ resultMediaId: event.target.value || undefined })}>
        <option value="">{t('editor.film.noResult')}</option>
        {media.filter(item => item.kind === 'image' || item.kind === 'video').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      {media.find(item => item.id === shot.resultMediaId)?.kind === 'image' && <img className="mt-3 max-h-40 w-full rounded-xl object-contain" src={media.find(item => item.id === shot.resultMediaId)!.url} alt={t('editor.film.result')} />}
      <p className="mt-2 text-xs opacity-70">{t('editor.film.resultHint')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {[-1, 1].map(offset => <button type="button" key={offset} className={button} disabled={film.shots.indexOf(shot) + offset < 0 || film.shots.indexOf(shot) + offset >= film.shots.length} onClick={() => {
          const shots = [...film.shots], index = shots.indexOf(shot); [shots[index], shots[index + offset]] = [shots[index + offset], shots[index]]; update({ ...film, shots });
        }}>{t(offset < 0 ? 'editor.film.earlier' : 'editor.film.later')}</button>)}
        <button type="button" className={button} onClick={() => update({ ...film, shots: film.shots.filter(item => item.id !== shot.id) })}>{t('editor.film.remove')}</button>
      </div>
    </div>}
    {issue && <p role="alert" className="mt-3 text-xs">{t('editor.film.issue')}</p>}
    {film.shots.length > 0 && <div className="mt-3 flex flex-wrap gap-3">{(['image', 'video'] as const).map(kind => <ReviewedBatchButton key={kind} owner={walletAddress?.toLowerCase() || null}
      scope={JSON.stringify([projectId, film, media.map(item => [item.id, item.url]), settings.aspectPreset])} label={kind === 'image' ? 'creator.batchReviewFilmImages' : 'creator.batchReviewFilmVideos'}
      create={() => filmReviewedBatch(film, kind, media, settings.aspectPreset, projectId, walletAddress || '')}
      beforePrepare={() => saveProject(useEditorStore.getState().toSnapshot())} />)}</div>}
  </section>;
}
