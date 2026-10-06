/**
 * $DHB listing-soon card
 * ======================
 * What a $DHB search shows while the token is not trading: "Token listing
 * soon!" and a "Notify me" button that puts the person on the listing email
 * list.
 *
 * The button uses the address the person signs in with when there is one, so
 * a Google or email login is one tap. Wallet-first, phone and Telegram
 * accounts have no usable address (and logged-out visitors have none at all),
 * so for them the button opens an email field instead.
 */

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import dhbCoinIcon from '@/assets/dehub-coin.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import {
  getSignInEmail,
  isValidListingEmail,
  joinDhbListingWaitlist,
  readJoinedEmail,
  rememberJoinedEmail,
} from '@/lib/market/dhb-listing';

type Step = 'idle' | 'ask' | 'joined';

export function DhbListingSoonCard({ source = 'explore' }: { source?: string }) {
  const { t } = useTranslation();
  const { user, walletAddress } = useAuth();
  const [joinedEmail, setJoinedEmail] = useState<string | null>(() => readJoinedEmail());
  const [step, setStep] = useState<Step>(() => (joinedEmail ? 'joined' : 'idle'));
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (address: string) => {
    setBusy(true);
    try {
      await joinDhbListingWaitlist({
        email: address,
        walletAddress,
        username: user?.username ?? null,
        source,
      });
      rememberJoinedEmail(address);
      setJoinedEmail(address.trim().toLowerCase());
      setStep('joined');
      toast.success(t('dhbListing.joined', "You're on the list. We'll email {{email}} the moment $DHB lists.", { email: address.trim().toLowerCase() }));
    } catch {
      toast.error(t('careers.applicationFailed', 'Failed to submit. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const handleNotify = async () => {
    setBusy(true);
    const signInEmail = await getSignInEmail();
    setBusy(false);
    if (signInEmail) {
      await submit(signInEmail);
    } else {
      setStep('ask');
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isValidListingEmail(email)) {
      toast.error(t('loginModal.invalidEmail', 'Please enter a valid email address'));
      return;
    }
    void submit(email);
  };

  return (
    <div
      data-dhb-listing-card
      className="bg-zinc-800/60 border border-zinc-700/50 rounded-2xl p-4 sm:p-5 mb-4"
    >
      <div className="flex items-center gap-3">
        <img src={dhbCoinIcon} alt="DHB" className="w-11 h-11 rounded-full flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-semibold">$DHB</span>
            <span className="text-zinc-400 text-sm">Dehub</span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              {t('hero.comingSoon', 'Coming Soon')}
            </span>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-white mt-0.5">
            {t('dhbListing.title', 'Token listing soon!')}
          </h3>
        </div>
      </div>

      {step === 'joined' ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3 py-2.5">
          <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <p className="text-sm text-zinc-200 break-words min-w-0">
            {t('dhbListing.joined', "You're on the list. We'll email {{email}} the moment $DHB lists.", { email: joinedEmail ?? '' })}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-zinc-400 mt-3">
            {t('dhbListing.body', "$DHB isn't trading yet. Get an email the moment it lists.")}
          </p>

          {step === 'ask' ? (
            <form onSubmit={handleSubmit} className="mt-4 flex flex-col sm:flex-row gap-2">
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('loginModal.emailPlaceholder', 'Enter your email')}
                aria-label={t('loginModal.emailPlaceholder', 'Enter your email')}
                className="flex-1 bg-zinc-900 border-zinc-700 text-white"
              />
              <Button type="submit" disabled={busy} className="gap-2">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                {t('dhbListing.notifyMe', 'Notify me')}
              </Button>
            </form>
          ) : (
            <Button onClick={handleNotify} disabled={busy} className="mt-4 w-full sm:w-auto gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
              {t('dhbListing.notifyMe', 'Notify me')}
            </Button>
          )}

          {step === 'ask' && (
            <p className="text-xs text-zinc-500 mt-2">
              {t('dhbListing.privacy', "We'll only use this to tell you when $DHB lists.")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
