/**
 * User Feedback Survey
 * ====================
 * Multi-step survey modal shown once to returning users on login.
 * Stores responses in user_feedback_surveys table.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const SURVEY_DISMISSED_KEY = 'dehub_survey_completed';

interface SurveyQuestion {
  key: string;
  question: string;
  options: string[];
}

const QUESTIONS: SurveyQuestion[] = [
  {
    key: 'signup_experience',
    question: 'How was the sign up process?',
    options: ['Smooth as butter', 'Bit slow / annoying', 'Painful'],
  },
  {
    key: 'referral_source',
    question: 'Where did you hear about us?',
    options: ['Google Ads', 'Instagram Ads', 'TikTok Ads', 'YouTube Ads', 'Influencer', 'Word of Mouth', 'Organic Online'],
  },
  {
    key: 'gender',
    question: 'Are you',
    options: ['Male', 'Female'],
  },
  {
    key: 'age_range',
    question: 'How old are you?',
    options: ['Under 21', '21 to 30', '30 to 40', '40 to 50', '50+'],
  },
  {
    key: 'tipping_or_gifting',
    question: 'Do you prefer',
    options: ['Tipping', 'Gifting'],
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

    // Check DB to ensure they haven't already submitted (handles cross-device)
    let cancelled = false;
    (async () => {
      try {
        const { count } = await supabase
          .from('user_feedback_surveys')
          .select('id', { count: 'exact', head: true })
          .eq('wallet_address', walletAddress.toLowerCase());

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
  const hasAnswer = !!answers[currentQuestion?.key];

  const handleSelect = (option: string) => {
    setAnswers(prev => ({ ...prev, [currentQuestion.key]: option }));
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
      const { error } = await supabase.from('user_feedback_surveys').insert({
        wallet_address: walletAddress.toLowerCase(),
        signup_experience: answers.signup_experience || null,
        referral_source: answers.referral_source || null,
        gender: answers.gender || null,
        age_range: answers.age_range || null,
        tipping_or_gifting: answers.tipping_or_gifting || null,
      } as any);

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
                <div className="flex flex-col gap-2">
                  {currentQuestion.options.map(option => {
                    const isSelected = answers[currentQuestion.key] === option;
                    return (
                      <button
                        key={option}
                        onClick={() => handleSelect(option)}
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
