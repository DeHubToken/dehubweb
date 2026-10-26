import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { useAuth } from '@/contexts/AuthContext';
import { SEOHead } from '@/components/SEOHead';
import { CreatorStudio } from '@/components/app/creator/studio/CreatorStudio';
import { CREATOR_LESSONS, gradeLearningAnswer, learningExerciseDraft, learningProgress, lessonKey } from '@/lib/creator/learning';

export default function CreatorLearningPage() {
  const { t } = useTranslation(), navigate = useNavigate(), { walletAddress } = useAuth();
  const [selection, setSelection] = useSurfaceDraft<string>('creator.learning.lesson.v1', 'brief', 'learning');
  const [saved, setSaved] = useSurfaceDraft<string[]>('creator.learning.progress.v1', [], 'learning');
  const [answers, setAnswers] = useSurfaceDraft<Record<string, number>>('creator.learning.answers.v1', {}, 'learning');
  const [checked, setChecked] = useSurfaceDraft<Record<string, boolean>>('creator.learning.checked.v1', {}, 'learning');
  const [exercise, setExercise] = useSurfaceDraft<string | null>('creator.learning.exercise.v1', null, 'learning');
  const lesson = CREATOR_LESSONS.find(item => item.id === selection) ?? CREATOR_LESSONS[0], progress = learningProgress(saved);
  const draft = exercise ? learningExerciseDraft(exercise, key => t(key), walletAddress) : null;
  const passed = progress.includes(lesson.id), answer = answers?.[lesson.id];
  const button = 'rounded-xl border border-current px-4 py-2 text-sm disabled:opacity-40';
  return <main className="mx-auto min-h-screen max-w-5xl bg-black px-4 py-8 text-white sm:px-6">
    <SEOHead title={t('creator.learn.title')} description={t('creator.learn.intro')} />
    <Link to="/creator" className="text-sm underline">{t('creator.learn.back')}</Link>
    <h1 className="mt-5 text-3xl font-bold">{t('creator.learn.title')}</h1>
    <p className="mt-3 max-w-3xl text-sm opacity-75">{t('creator.learn.intro')}</p>
    <p className="mt-2 text-xs opacity-60">{t('creator.learn.progress', { completed: progress.length, total: CREATOR_LESSONS.length })}</p>
    <nav className="my-6 flex flex-wrap gap-3" aria-label={t('creator.learn.lessons')}>
      {CREATOR_LESSONS.map((item, index) => <button type="button" key={item.id} className={button} aria-pressed={item.id === lesson.id} onClick={() => setSelection(item.id)}>{index + 1}. {t(lessonKey(item.id, 'title'))}{progress.includes(item.id) ? ' ✓' : ''}</button>)}
    </nav>
    <article className="rounded-3xl border border-white/15 p-5 sm:p-7">
      <h2 className="text-xl font-semibold">{t(lessonKey(lesson.id, 'title'))}</h2>
      {[1, 2, 3].map(index => <p key={index} className="mt-4 leading-relaxed opacity-80">{t(lessonKey(lesson.id, `body${index}`))}</p>)}
      <fieldset className="mt-7 border-t border-white/15 pt-5">
        <legend className="font-semibold">{t(lessonKey(lesson.id, 'question'))}</legend>
        {[0, 1, 2].map(index => <label key={index} className="mt-3 flex items-start gap-3 rounded-xl border border-white/15 p-3 text-sm"><input type="radio" name={`answer-${lesson.id}`} checked={answer === index} onChange={() => { setAnswers({ ...answers, [lesson.id]: index }); setChecked({ ...checked, [lesson.id]: false }); }} /><span>{t(lessonKey(lesson.id, `answer${index}`))}</span></label>)}
        <button type="button" className={`${button} mt-4`} disabled={!Number.isInteger(answer)} onClick={() => { const correct = gradeLearningAnswer(lesson.id, answer); setSaved(correct ? learningProgress([...progress, lesson.id]) : progress.filter(id => id !== lesson.id)); setChecked({ ...checked, [lesson.id]: true }); }}>{t('creator.learn.check')}</button>
        {checked?.[lesson.id] && <p role="status" className="mt-3 text-sm">{t(passed ? 'creator.learn.correct' : 'creator.learn.retry')}</p>}
      </fieldset>
      <h3 className="mt-7 font-semibold">{t('creator.learn.exerciseTitle')}</h3>
      <p className="mt-2 text-sm opacity-75">{t('creator.learn.exerciseHint')}</p>
      <p className="my-3 rounded-xl border border-white/15 p-3 text-sm">{t(lessonKey(lesson.id, 'exercise'))}</p>
      <button type="button" className={button} onClick={() => setExercise(lesson.id)}>{t('creator.learn.openExercise')}</button>
    </article>
    {draft && <section className="mt-7" aria-label={t('creator.learn.exerciseTitle')}>
      <button type="button" className={button} onClick={() => setExercise(null)}>{t('creator.learn.closeExercise')}</button>
      <CreatorStudio embedded snapshotScope={draft.workspaceId} generationDraft={draft} generationDraftId={draft.draftId} onOpenEditor={() => navigate('/editor')} />
    </section>}
  </main>;
}
