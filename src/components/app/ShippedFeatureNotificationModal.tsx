/**
 * Shipped Feature Notification Modal
 * ===================================
 * Thanks a user for their feedback once their feature request or bug
 * report ships. Shown once per item on their next login — including
 * items that were already marked shipped before this existed, since
 * eligibility is DB-tracked ("shipped" + "not yet notified"), not based
 * on when it shipped.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUnnotifiedShippedFeatures, useMarkShippedNotified, CATEGORY_LABELS } from '@/hooks/use-feature-requests';

export function ShippedFeatureNotificationModal() {
  const { isAuthenticated, walletAddress, requiresUsername } = useAuth();
  const navigate = useNavigate();
  const { data: shippedItems } = useUnnotifiedShippedFeatures();
  const markNotified = useMarkShippedNotified();
  const [show, setShow] = useState(false);

  const hasItems = !!shippedItems && shippedItems.length > 0;

  useEffect(() => {
    if (!isAuthenticated || !walletAddress || requiresUsername || !hasItems) {
      setShow(false);
      return;
    }
    // Small delay so the login flow (and the mandatory username modal, if any) settles first.
    const timer = setTimeout(() => setShow(true), 2500);
    return () => clearTimeout(timer);
  }, [isAuthenticated, walletAddress, requiresUsername, hasItems]);

  if (!show || !shippedItems || shippedItems.length === 0) return null;

  const handleDismiss = () => {
    setShow(false);
    markNotified.mutate(shippedItems.map((f) => f.id));
  };

  const handleViewShipped = () => {
    handleDismiss();
    navigate('/app/features');
  };

  const isPlural = shippedItems.length > 1;

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
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between px-5 pt-5">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-white/80" />
            </div>
            <button
              onClick={handleDismiss}
              className="text-zinc-500 hover:text-white transition-colors p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-5 pt-3 pb-5">
            <h2 className="text-white font-bold text-lg mb-1.5">Your feedback shipped!</h2>
            <p className="text-zinc-400 text-sm leading-relaxed mb-4">
              Thanks for helping make DeHub better — {isPlural ? `${shippedItems.length} things you asked for are` : 'something you asked for is'} now live:
            </p>

            <div className="flex flex-col gap-2 mb-5 max-h-48 overflow-y-auto">
              {shippedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5"
                >
                  <span className="text-white text-sm font-medium leading-snug flex-1 min-w-0">{item.title}</span>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-lg whitespace-nowrap shrink-0 bg-white/10 text-white/60">
                    {CATEGORY_LABELS[item.category]}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleViewShipped}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white text-black hover:bg-zinc-200 transition-all"
              >
                Check it out
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-white transition-colors"
              >
                Thanks!
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
