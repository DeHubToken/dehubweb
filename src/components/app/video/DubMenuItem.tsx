/**
 * "Dub" row for a video post's options sheet.
 *
 * Flips the same switch as the CC menu's Audio toggle, pointed at the app
 * language. Everything that can stop a dub from being heard is checked here
 * first, so the row either works or says why — never switches on to silence.
 */
import { useTranslation } from 'react-i18next';
import { Check, Languages } from 'lucide-react';
import { toast } from 'sonner';
import { useVideoTranscript } from '@/hooks/use-video-transcript';
import { useDubPreference, loadVoices, pickVoice, primeSpeech } from '@/hooks/dub-preference';

interface Props {
  tokenId: number | string;
  className?: string;
  /** Called after the sheet's work is done, on or off. */
  onDone: () => void;
  /** Called when dubbing was switched on, so the player can unmute. */
  onEnabled?: () => void;
}

const base = (l: string | null | undefined) => (l ?? '').toLowerCase().split('-')[0];

export function DubMenuItem({ tokenId, className, onDone, onEnabled }: Props) {
  const { t, i18n } = useTranslation();
  const { on, setDub } = useDubPreference();
  const numericId = Number(tokenId);
  const { transcript, refetch, canRetry, start } = useVideoTranscript(
    Number.isFinite(numericId) && numericId > 0 ? numericId : null,
  );

  const handleClick = async () => {
    // Must run inside the tap itself, before any await (iOS Safari).
    if (!on) primeSpeech();
    if (on) {
      setDub(false, null);
      onDone();
      return;
    }

    const lang = i18n.resolvedLanguage || i18n.language || 'en';
    const row = transcript ?? (await refetch()).data ?? null;
    if (!row || row.status !== 'ready') {
      // Same as the CC button: a video nobody has transcribed yet gets one
      // started, while the attempt budget allows.
      if (!row && canRetry) start.mutate();
      toast(t('dub.noTranscript'));
      return;
    }

    const source = base(row.source_lang) || 'en';
    if (base(lang) === source) {
      toast(t('dub.sameLanguage'));
      return;
    }

    if (!pickVoice(await loadVoices(), lang)) {
      toast(t('dub.noVoice'));
      return;
    }

    setDub(true, lang);
    onEnabled?.();
    onDone();
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => { void handleClick(); }}
      className={className}
    >
      <Languages className="w-5 h-5" /> {t('dub.menuItem')}
      {on && <Check className="w-4 h-4 ml-auto" />}
    </button>
  );
}
