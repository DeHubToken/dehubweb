/**
 * User Feedback Survey
 * ====================
 * Multi-step survey modal shown once per ROUND to returning users on login.
 * Stores responses in `user_feedback_surveys`.
 *
 * Rounds, not one survey forever. Round 1 ran March–August 2026 and collected
 * 89 answers to a fixed set of five questions, one table column each — which
 * meant asking anything new needed a migration, and there was no way to tell a
 * second round's answers from the first's.
 *
 * Running a new round is now: write a new QUESTIONS array, bump SURVEY_VERSION.
 * Nothing else. The version scopes the "have they already answered?" check and
 * the localStorage key, so everyone who did a previous round is asked the new
 * one exactly once, and earlier rounds' rows stay untouched under their own
 * `survey_version`.
 *
 * Query a round with:
 *   select answers->>'join_reason' q, count(*)
 *   from user_feedback_surveys where survey_version = 3 group by 1 order by 2 desc;
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { withWalletHeader } from '@/lib/supabase-wallet-client';
import { toast } from 'sonner';

/** Bump to run a new round. Round 1 = the original five questions. */
const SURVEY_VERSION = 3;

/** Per-round, so a completed earlier round does not suppress this one. */
const SURVEY_DISMISSED_KEY = `dehub_survey_completed_v${SURVEY_VERSION}`;

interface SurveyQuestion {
  key: string;
  question: string;
  /** 'select' renders the button list; 'text' renders a free-text textarea. */
  type: 'select' | 'text';
  options?: string[];
  placeholder?: string;
}

/**
 * Round 3 — testimonial-gathering. The first two are free text so answers
 * read as real quotes rather than picked options; the consent question is
 * genuinely no-pressure, so "no" is a first-class, equally-styled answer, not
 * a dead end — declining it still lets join_reason/favourite_thing submit.
 */
const QUESTIONS: SurveyQuestion[] = [
  {
    key: 'join_reason',
    question: 'What made you join DeHub?',
    type: 'text',
    placeholder: 'In your own words…',
  },
  {
    key: 'favourite_thing',
    question: 'What do you like most about DeHub?',
    type: 'text',
    placeholder: 'In your own words…',
  },
  {
    key: 'consent_share',
    question: "Are you ok if we shared your name and answers above in promotional materials, tweets, etc? No pressure if not.",
    type: 'select',
    options: ['Yes, go ahead', 'No, keep it private'],
  },
  {
    key: 'video_interview_interest',
    question: 'Would you be open to a short video interview about why you joined / love DeHub, for us to share in promo videos?',
    type: 'select',
    options: ["Yes, I'm interested", 'No, not for me'],
  },
];

export function UserFeedbackSurvey() {
  const { walletAddress, isAuthenticated } = useAuth();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !walletAddress) return;

    // Quick local check first
    const completed = localStorage.getItem(SURVEY_DISMISSED_KEY);
    if (completed) return;

    const isNewAccount = sessionStorage.getItem('dehub_is_new_account');
    if (isNewAccount === 'true') return;

    // Check DB to ensure they haven't already submitted (handles cross-device).
    // The wallet header is required now: the read policy on this table was
    // `USING (true)` — wallet address next to gender next to age range, legible
    // to anyone holding the publishable key — and is now scoped to your own
    // rows. Without the header this query returns 0 and the modal reappears on
    // every login.
    let cancelled = false;
    (async () => {
      try {
        const { count } = await withWalletHeader(
          supabase
            .from('user_feedback_surveys')
            .select('id', { count: 'exact', head: true })
            .eq('wallet_address', walletAddress.toLowerCase())
            .eq('survey_version', SURVEY_VERSION),
          walletAddress,
        );

        if (cancelled) return;
        if (count && count > 0) {
          // Already submitted — persist locally so we never check again
          localStorage.setItem(SURVEY_DISMISSED_KEY, 'true');
          return;
        }
        // Small delay so login flow completes first
        setTimeout(() => { if (!cancelled) setShow(true); }, 2000);
      } catch {
        // On error, don't show survey
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, walletAddress]);

  const currentQuestion = QUESTIONS[step];
  const isLastStep = step === QUESTIONS.length - 1;
  const hasAnswer = !!answers[currentQuestion?.key]?.trim();

  const handleAnswer = (value: string) => {
    setAnswers(prev => ({ ...prev, [currentQuestion.key]: value }));
  };

  const handleNext = async () => {
    if (!hasAnswer) return;

    if (isLastStep) {
      await handleSubmit();
    } else {
      setStep(s => s + 1);
    }
  };

  const handleSubmit = async () => {
    if (!walletAddress) return;
    setSubmitting(true);

    try {
      // Every round's answers go in `answers`, keyed by question. The five
      // round-1 columns are left alone rather than reused: a column called
      // `signup_experience` holding an answer to a differently worded question
      // is how a dataset quietly stops meaning anything.
      const { error } = await supabase.from('user_feedback_surveys').insert({
        wallet_address: walletAddress.toLowerCase(),
        survey_version: SURVEY_VERSION,
        answers,
      });

      if (error) throw error;

      localStorage.setItem(SURVEY_DISMISSED_KEY, 'true');
      toast.success('Thanks for your feedback!');
      setShow(false);
    } catch (err) {
      console.error('[Survey] Submit error:', err);
      toast.error('Failed to submit, try again');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(SURVEY_DISMISSED_KEY, 'true');
    setShow(false);
  };

  if (!show) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={handleDismiss}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-2">
            <div>
              <h2 className="text-white font-bold text-lg">Quick Feedback</h2>
              <p className="text-zinc-500 text-xs mt-0.5">
                Question {step + 1} of {QUESTIONS.length}
              </p>
            </div>
            <button
              onClick={handleDismiss}
              className="text-zinc-500 hover:text-white transition-colors p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="px-5 pt-2 pb-4">
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-white rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>

          {/* Question */}
          <div className="px-5 pb-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <p className="text-white font-medium text-base mb-4">
                  {currentQuestion.question}
                </p>
                {currentQuestion.type === 'text' ? (
                  <textarea
                    value={answers[currentQuestion.key] ?? ''}
                    onChange={e => handleAnswer(e.target.value)}
                    placeholder={currentQuestion.placeholder}
                    rows={4}
                    autoFocus
                    className="w-full resize-none px-4 py-3 rounded-xl border bg-zinc-800/50 text-white text-sm border-zinc-700/50 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    {currentQuestion.options!.map(option => {
                      const isSelected = answers[currentQuestion.key] === option;
                      return (
                        <button
                          key={option}
                          onClick={() => handleAnswer(option)}
                          className={cn(
                            "w-full text-left px-4 py-3 rounded-xl border transition-all text-sm font-medium",
                            isSelected
                              ? "bg-white text-black border-white"
                              : "bg-zinc-800/50 text-zinc-300 border-zinc-700/50 hover:bg-zinc-800 hover:border-zinc-600"
                          )}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="px-5 pb-5 flex items-center justify-between">
            <button
              onClick={handleDismiss}
              className="text-zinc-500 text-sm hover:text-white transition-colors"
            >
              Skip
            </button>
            <button
              onClick={handleNext}
              disabled={!hasAnswer || submitting}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all",
                hasAnswer
                  ? "bg-white text-black hover:bg-zinc-200"
                  : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
              )}
            >
              {submitting ? (
                'Submitting...'
              ) : isLastStep ? (
                <>
                  Submit <Check className="w-4 h-4" />
                </>
              ) : (
                <>
                  Next <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
