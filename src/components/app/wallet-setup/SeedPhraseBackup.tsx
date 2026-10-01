/**
 * The 12-word backup, shown once right after a new wallet is made (optional,
 * "Skip for now" goes straight in) and on demand from Settings → Back up
 * wallet. The words stay blurred until tapped, blur again when the tab loses
 * focus, and a copy clears the clipboard after 30s. Nothing here is logged or
 * sent anywhere; the caller records only that a backup happened.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Copy, Eye } from 'lucide-react';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { copyThenClear } from '@/lib/wallet-core/clipboard';

type Stage = 'intro' | 'words' | 'check';

interface SeedPhraseBackupProps {
  phrase: string;
  /** Opens on this stage instead of the variant's first one (state gallery). */
  initialStage?: Stage;
  /** 'signup' opens on the Save now / Skip for now choice and ends on a one-tap check. */
  variant: 'signup' | 'settings';
  /** saved = the person went through the words (not a skip). */
  onFinished: (saved: boolean) => void;
  busy?: boolean;
}

const primaryClass = 'w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl';
const secondaryClass = 'w-full h-12 bg-transparent hover:bg-white/5 text-white rounded-xl border-white/10';

function pickCheck(words: string[]) {
  const index = Math.floor(Math.random() * words.length);
  const others = words.filter((w, i) => i !== index && w !== words[index]);
  const decoys: string[] = [];
  while (decoys.length < 2 && others.length > 0) {
    const [w] = others.splice(Math.floor(Math.random() * others.length), 1);
    if (!decoys.includes(w)) decoys.push(w);
  }
  const choices = [words[index], ...decoys].sort(() => Math.random() - 0.5);
  return { index, choices };
}

export function SeedPhraseBackup({ phrase, variant, onFinished, busy = false, initialStage }: SeedPhraseBackupProps) {
  const { t } = useTranslation();
  const words = useMemo(() => phrase.trim().split(/\s+/), [phrase]);
  const [stage, setStage] = useState<Stage>(initialStage ?? (variant === 'signup' ? 'intro' : 'words'));
  const [revealed, setRevealed] = useState(false);
  const [check] = useState(() => pickCheck(words));
  const [wrong, setWrong] = useState(false);

  // Someone glancing at a screen share or a returning tab should not find the
  // words sitting there in the clear.
  useEffect(() => {
    const hide = () => setRevealed(false);
    const onVisibility = () => { if (document.hidden) hide(); };
    window.addEventListener('blur', hide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', hide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  if (stage === 'intro') {
    return (
      <div className="space-y-4" data-testid="seed-backup-intro">
        <div className="flex flex-col items-center text-center gap-2 pt-2">
          <ThemedIcon icon="lock" alt="" className="w-12 h-12 object-contain" />
          <h3 className="text-lg font-semibold text-white">{t('walletBackup.introTitle', 'Back up your wallet?')}</h3>
          <p className="text-sm text-white/60">
            {t('walletBackup.introBody', '12 words that bring your wallet back if you lose your phone or password. Takes 30 seconds.')}
          </p>
        </div>
        <Button onClick={() => setStage('words')} disabled={busy} className={primaryClass}>
          {t('walletBackup.saveNow', 'Save now')}
        </Button>
        <button
          type="button"
          onClick={() => onFinished(false)}
          disabled={busy}
          className="w-full py-2 text-sm text-white/60 hover:text-white transition-colors disabled:opacity-50"
        >
          {t('walletBackup.skipForNow', 'Skip for now')}
        </button>
      </div>
    );
  }

  if (stage === 'check') {
    return (
      <div className="space-y-4" data-testid="seed-backup-check">
        <p className="text-center text-white font-medium">
          {t('walletBackup.checkPrompt', 'Quick check: tap word #{{n}}', { n: check.index + 1 })}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {check.choices.map((choice) => (
            <Button
              key={choice}
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (choice === words[check.index]) onFinished(true);
                else setWrong(true);
              }}
              className="h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl border-white/10"
            >
              {choice}
            </Button>
          ))}
        </div>
        {wrong && (
          <p className="text-sm text-red-400 text-center">
            {t('walletBackup.checkWrong', 'Not that one. Check your words and try again.')}
          </p>
        )}
        <button
          type="button"
          onClick={() => { setWrong(false); setStage('words'); }}
          className="w-full py-1 text-sm text-white/60 hover:text-white transition-colors"
        >
          {t('walletBackup.showAgain', 'Show my words again')}
        </button>
        <button
          type="button"
          onClick={() => onFinished(true)}
          disabled={busy}
          className="w-full py-1 text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          {t('walletBackup.skipCheck', 'Skip check')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="seed-backup-words">
      <div className="flex items-start gap-2 rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-sm text-white">
        <AlertTriangle className="w-4 h-4 mt-0.5 text-red-400 shrink-0" />
        <ul className="space-y-1">
          <li>{t('walletBackup.warnOwns', 'Anyone with these words owns your wallet.')}</li>
          <li>{t('walletBackup.warnNeverAsk', 'DeHub will never ask for them.')}</li>
          <li>{t('walletBackup.warnPaper', 'Write them on paper, not in a screenshot or notes app.')}</li>
        </ul>
      </div>
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        aria-label={revealed ? t('walletBackup.hideWords', 'Hide words') : t('walletBackup.revealWords', 'Tap to reveal')}
        className="relative w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left"
      >
        <ol className={`grid grid-cols-3 gap-2 transition ${revealed ? '' : 'blur-md select-none'}`} aria-hidden={!revealed}>
          {words.map((word, i) => (
            <li key={i} className="flex items-baseline gap-1.5 rounded-lg bg-white/5 px-2 py-1.5 text-sm text-white">
              <span className="text-white/40 text-xs tabular-nums">{i + 1}</span>
              <span className="font-medium">{revealed ? word : '•••••'}</span>
            </li>
          ))}
        </ol>
        {!revealed && (
          // Inline colours on purpose: theme remaps (light, glass) must not
          // turn the scrim or pill pale, or the label stops being readable.
          <span
            className="absolute inset-0 flex items-center justify-center rounded-xl"
            style={{ background: 'rgba(0, 0, 0, 0.45)' }}
          >
            <span
              className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-lg"
              style={{ background: 'rgba(12, 12, 16, 0.88)', borderColor: 'rgba(255, 255, 255, 0.18)', borderRadius: 9999, color: '#fff' }}
            >
              <Eye className="w-4 h-4" stroke="#fff" style={{ color: '#fff' }} /> {t('walletBackup.revealWords', 'Tap to reveal')}
            </span>
          </span>
        )}
      </button>
      <Button
        variant="outline"
        onClick={async () => {
          await copyThenClear(words.join(' '));
          toast.success(t('walletBackup.copied', 'Copied. Clipboard clears in 30s'));
        }}
        className={secondaryClass}
      >
        <Copy className="w-4 h-4 mr-2" /> {t('walletBackup.copyWords', 'Copy words')}
      </Button>
      <Button
        onClick={() => (variant === 'signup' ? setStage('check') : onFinished(true))}
        disabled={busy}
        className={primaryClass}
      >
        {variant === 'signup' ? t('walletBackup.savedThem', "I've saved them") : t('walletBackup.done', 'Done')}
      </Button>
      {variant === 'signup' && (
        <button
          type="button"
          onClick={() => onFinished(false)}
          disabled={busy}
          className="w-full py-1 text-sm text-white/60 hover:text-white transition-colors"
        >
          {t('walletBackup.skipForNow', 'Skip for now')}
        </button>
      )}
    </div>
  );
}
