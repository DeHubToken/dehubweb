/**
 * Getting Started Bento
 * =====================
 * The opt-in guided walkthrough, as a bento in the right rail: one step at a
 * time, a plain sentence, a Go button, a tick, a Skip link, and — once a step
 * is behind you — "Was this easy?".
 *
 * Deliberately NOT part of HomeIntro. That panel is prerendered into
 * index.html by scripts/build-home-intro-html.mjs, so it may not use hooks,
 * `window` or `localStorage`, and it is signed-out marketing besides. This is
 * a signed-in, per-account, multi-day thing and has to be its own component.
 *
 * Three states, in order of how often they are drawn:
 *   1. the opt-in card, for a brand-new account that has not been asked;
 *   2. the checklist, once somebody says yes;
 *   3. a thank-you with a chip, once every step is done or skipped.
 *
 * The rating is the whole point of the feature and is asked per step rather
 * than once at the end: "was the app easy" produces a mood, "was setting a
 * username easy" produces a fix.
 *
 * @module components/app/GettingStartedBento
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Check,
  MessageCircle,
  PenLine,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trophy,
  UserRound,
  UsersRound,
  Wallet,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useOnboarding } from '@/contexts/OnboardingChecklistContext';
import { useOptionalGlobalDropZone } from '@/hooks/use-global-drop-zone';
import {
  ONBOARDING_STEPS,
  nextOnboardingStep,
  type OnboardingStepDef,
} from '@/lib/onboarding-steps';
import { cn } from '@/lib/utils';

const ICONS = {
  UserRound,
  Wallet,
  Sparkles,
  PenLine,
  UsersRound,
  MessageCircle,
  Trophy,
} as const;

/** Same chrome as the panels either side of it in the rail. */
const BENTO_CLASS = 'bg-zinc-900 rounded-2xl p-4';

export function GettingStartedBento() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const onboarding = useOnboarding();
  const dropZone = useOptionalGlobalDropZone();

  // The step somebody is actually looking at is the first unsettled one, and
  // that is the only step a render should count as "viewed". Recording a view
  // for all seven at once would make the drop-off map say every member reached
  // every step, which is the one thing it exists to disprove.
  const nextStepId = onboarding ? nextOnboardingStep(onboarding.steps)?.id ?? null : null;
  const recordView = onboarding?.recordView;
  const showingChecklist =
    !!onboarding && !onboarding.loading && !!onboarding.progress && onboarding.active && !onboarding.complete;

  useEffect(() => {
    if (showingChecklist && nextStepId) recordView?.(nextStepId);
  }, [showingChecklist, nextStepId, recordView]);

  if (!onboarding || onboarding.loading) return null;

  const { progress, steps, settled, total, percentage, complete, active, shouldOffer } = onboarding;

  // ── 1. The offer ──────────────────────────────────────────────────────────
  if (shouldOffer) {
    return (
      <div data-side-panel className={BENTO_CLASS}>
        <h2 className="text-base font-bold text-white">{t('onboarding.optIn.title')}</h2>
        <p className="mt-1 text-sm leading-5 text-zinc-400">{t('onboarding.optIn.body')}</p>
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" className="rounded-xl" onClick={onboarding.start}>
            {t('onboarding.optIn.yes')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="rounded-xl text-zinc-400"
            onClick={onboarding.decline}
          >
            {t('onboarding.optIn.no')}
          </Button>
        </div>
      </div>
    );
  }

  if (!progress || !active) return null;

  // ── 3. The thank-you ──────────────────────────────────────────────────────
  if (complete) {
    return (
      <div data-side-panel className={BENTO_CLASS}>
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-bold text-white">{t('onboarding.checklist.finishedTitle')}</h2>
          <button
            type="button"
            onClick={onboarding.dismiss}
            aria-label={t('onboarding.checklist.dismiss')}
            className="rounded-lg p-1 text-zinc-500 transition-colors hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-sm leading-5 text-zinc-400">
          {t('onboarding.checklist.finishedBody')}
        </p>
        <span className="mt-3 inline-flex items-center gap-1 rounded-md border border-white/[0.12] bg-white/[0.12] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white/75">
          <Trophy className="h-2.5 w-2.5" />
          {t('onboarding.checklist.chip')}
        </span>
      </div>
    );
  }

  // ── 2. The checklist ──────────────────────────────────────────────────────
  const go = (step: OnboardingStepDef) => {
    onboarding.recordView(step.id);
    if (step.route) navigate(step.route);
    else dropZone?.openPostModal();
  };

  return (
    <div data-side-panel className={BENTO_CLASS}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-white">{t('onboarding.checklist.title')}</h2>
          <p className="text-xs text-zinc-500">{t('onboarding.checklist.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={onboarding.dismiss}
          aria-label={t('onboarding.checklist.dismiss')}
          className="rounded-lg p-1 text-zinc-500 transition-colors hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-white/70 transition-[width] duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-zinc-500">
          {t('onboarding.checklist.progress', { done: settled, total })}
        </p>
      </div>

      <ul className="mt-3 space-y-2">
        {ONBOARDING_STEPS.map((step) => {
          const state = steps[step.id] || {};
          const Icon = ICONS[step.icon];
          const settledStep = !!state.done || !!state.skipped;
          return (
            <li
              key={step.id}
              className={cn(
                'rounded-xl bg-zinc-800/60 p-3 transition-opacity',
                settledStep && 'opacity-70',
              )}
            >
              <div className="flex items-start gap-2.5">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'text-sm font-medium leading-5 text-white',
                      state.done && 'line-through decoration-zinc-500',
                    )}
                  >
                    {t(`onboarding.steps.${step.id}.title`)}
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-zinc-400">
                    {t(`onboarding.steps.${step.id}.body`)}
                  </p>

                  {!settledStep && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        className="h-7 rounded-lg px-2.5 text-xs"
                        onClick={() => go(step)}
                      >
                        {t('onboarding.checklist.go')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 rounded-lg px-2.5 text-xs"
                        onClick={() => onboarding.markDone(step.id)}
                      >
                        <Check className="mr-1 h-3 w-3" />
                        {t('onboarding.checklist.done')}
                      </Button>
                      <button
                        type="button"
                        onClick={() => onboarding.skip(step.id)}
                        className="text-xs text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-300 hover:underline"
                      >
                        {t('onboarding.checklist.skip')}
                      </button>
                    </div>
                  )}

                  {/* The rating only makes sense about something you actually
                      did, so a skipped step is never asked. */}
                  {state.done && (
                    <div className="mt-2 flex items-center gap-2">
                      {state.rating ? (
                        <span className="text-xs text-zinc-500">
                          {t('onboarding.rating.thanks')}
                        </span>
                      ) : (
                        <>
                          <span className="text-xs text-zinc-400">
                            {t('onboarding.rating.question')}
                          </span>
                          <button
                            type="button"
                            aria-label={t('onboarding.rating.easy')}
                            onClick={() => onboarding.rate(step.id, 'easy')}
                            className="rounded-lg p-1 text-zinc-500 transition-colors hover:text-white"
                          >
                            <ThumbsUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={t('onboarding.rating.hard')}
                            onClick={() => onboarding.rate(step.id, 'hard')}
                            className="rounded-lg p-1 text-zinc-500 transition-colors hover:text-white"
                          >
                            <ThumbsDown className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
