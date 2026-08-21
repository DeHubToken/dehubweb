/**
 * StageCaptions — live subtitles under a stage, in the viewer's language.
 *
 * The overlay is a passive reader: it subscribes to the caption broadcast and
 * draws whatever arrives. Nothing here transcribes or translates, so it is
 * safe to mount on any surface showing a room, including for a signed-out
 * guest on an invite link.
 *
 * Unfinished lines are drawn at reduced opacity, and so are lines still
 * waiting on their translation. That is the only cue a viewer gets that the
 * words may still change, and it is worth having — live transcription revises
 * itself mid-sentence, and text that silently rewrites reads as a glitch
 * unless it looked provisional first.
 */

import { Captions, CaptionsOff, Check, Headphones, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useStageCaptionFeed } from '@/hooks/use-stage-captions';
import { useStageDubbing } from '@/hooks/use-stage-dubbing';
import {
  CAPTION_LANGUAGES,
  setCaptionLanguage,
  setSendCaptions,
  setShowCaptions,
  useCaptionLanguage,
  useSendCaptions,
  useShowCaptions,
} from '@/lib/stage-captions';

interface StageCaptionsOverlayProps {
  spaceId: string | undefined | null;
  className?: string;
}

export function StageCaptionsOverlay({ spaceId, className }: StageCaptionsOverlayProps) {
  const show = useShowCaptions();
  const language = useCaptionLanguage();
  const lines = useStageCaptionFeed(spaceId, show);

  if (!show || lines.length === 0) return null;

  return (
    <div
      className={cn(
        // Bounded height, bottom-aligned, clipped: on a phone this shows the
        // newest line or two and on a laptop all three, without a long
        // sentence ever pushing the room's controls off screen.
        'pointer-events-none flex flex-col items-center justify-end gap-1 px-3',
        'max-h-24 sm:max-h-32 overflow-hidden',
        className,
      )}
      aria-live="polite"
    >
      {lines.map((line) => {
        const translated = language ? line.translations?.[language] : undefined;
        // Until the translation lands, the source line stands in. Showing
        // nothing would blank the overlay for the second it takes, which reads
        // as captions breaking rather than as translation being in flight.
        const awaitingTranslation = !!language && !translated;
        const text = translated ?? line.text;

        return (
          <div
            key={line.id}
            className={cn(
              'max-w-[92vw] sm:max-w-xl rounded-xl bg-black/70 backdrop-blur-[24px] border border-white/10',
              'px-2.5 py-1 sm:px-3 sm:py-1.5',
              // line-clamp on the pill, not the text span: it needs display
              // -webkit-box, which on the span would break the name out onto
              // its own line instead of clamping the two together.
              'text-xs sm:text-sm leading-snug text-white text-center transition-opacity duration-200 line-clamp-3',
              line.final && !awaitingTranslation ? 'opacity-100' : 'opacity-70',
            )}
          >
            <span
              className={cn(
                'mr-1.5 text-[10px] sm:text-xs font-medium',
                line.kind === 'ai' ? 'text-white/50 italic' : 'text-white/60',
              )}
            >
              {line.name}
            </span>
            <span>{text}</span>
          </div>
        );
      })}
    </div>
  );
}

interface StageCaptionsButtonProps {
  /** Speakers get the extra switch for their own microphone; listeners have nothing to send. */
  isSpeaker: boolean;
  /** Needed to price and buy dubbing; without it the audio section stays hidden. */
  spaceId?: string | null;
  /** The buyer. Dubbing is metered per minute, so it needs a wallet to charge. */
  wallet?: string | null;
  className?: string;
}

export function StageCaptionsButton({ isSpeaker, spaceId, wallet, className }: StageCaptionsButtonProps) {
  const show = useShowCaptions();
  const send = useSendCaptions();
  const language = useCaptionLanguage();

  const dubbing = useStageDubbing(spaceId, wallet ?? null);
  const dubQuote = dubbing.quote;

  const active = CAPTION_LANGUAGES.find((l) => l.code === language);

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="lg"
          className={cn(
            'relative rounded-xl w-12 h-12 shrink-0',
            show
              ? 'bg-white/20 hover:bg-white/30 text-white ring-2 ring-white/30'
              : 'bg-white/10 backdrop-blur-md border border-white/10 hover:bg-white/20 text-white',
            className,
          )}
          title={active ? `Subtitles · ${active.name}` : 'Subtitles'}
          aria-label="Subtitles"
        >
          {show ? <Captions className="w-5 h-5" /> : <CaptionsOff className="w-5 h-5" />}
          {/* Which language you are reading, without opening the menu. */}
          {show && active && (
            <span className="absolute bottom-0.5 inset-x-0 text-[9px] font-semibold uppercase tracking-wide text-white/80">
              {active.code}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      {/* One flat scrolling menu rather than a nested submenu: nested menus are
          awkward to open on touch, and this is one tap fewer on every device. */}
      <DropdownMenuContent align="center" className="w-56 max-h-[60vh] overflow-y-auto">
        <DropdownMenuItem onSelect={() => setShowCaptions(!show)}>
          <Check className={cn('w-4 h-4 mr-2 shrink-0', show ? 'opacity-100' : 'opacity-0')} />
          Show subtitles
        </DropdownMenuItem>
        {isSpeaker && (
          <DropdownMenuItem onSelect={() => setSendCaptions(!send)}>
            <Check className={cn('w-4 h-4 mr-2 shrink-0', send ? 'opacity-100' : 'opacity-0')} />
            Subtitle my voice
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Language</DropdownMenuLabel>

        <DropdownMenuItem onSelect={() => setCaptionLanguage(null)}>
          <Check className={cn('w-4 h-4 mr-2 shrink-0', language ? 'opacity-0' : 'opacity-100')} />
          As spoken
        </DropdownMenuItem>
        {CAPTION_LANGUAGES.map((option) => (
          <DropdownMenuItem key={option.code} onSelect={() => setCaptionLanguage(option.code)}>
            <Check
              className={cn(
                'w-4 h-4 mr-2 shrink-0',
                language === option.code ? 'opacity-100' : 'opacity-0',
              )}
            />
            {option.name}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Audio
        </DropdownMenuLabel>

        {/* Dubbing follows the subtitle language rather than offering its own
            picker. Reading Turkish and hearing Spanish is not a thing anyone
            wants, and two lists for one decision is two chances to get it
            wrong — including expensively, since this one is metered. */}
        {!language ? (
          <DropdownMenuItem disabled className="text-xs">
            Pick a language above to hear it dubbed
          </DropdownMenuItem>
        ) : dubbing.language ? (
          <DropdownMenuItem onSelect={() => dubbing.stop()}>
            <Volume2 className="w-4 h-4 mr-2 shrink-0 text-primary" />
            <span className="flex-1">Stop dubbing</span>
            <span className="ml-2 text-[10px] font-mono text-muted-foreground tabular-nums">
              {dubbing.minutes} min
            </span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            disabled={dubbing.starting || !dubQuote}
            onSelect={(event) => {
              // Money leaves the wallet on this click. Keep the menu open so
              // the price and the failure toast land on the same surface the
              // decision was made on.
              event.preventDefault();
              void dubbing.start(language);
            }}
          >
            <Headphones className="w-4 h-4 mr-2 shrink-0" />
            <span className="flex-1">Hear it in {active?.name ?? language}</span>
            {dubQuote && (
              <span className="ml-2 text-[10px] font-mono text-muted-foreground tabular-nums">
                {dubQuote.pricePerMinuteDhb}/min
              </span>
            )}
          </DropdownMenuItem>
        )}
        {dubQuote && !dubQuote.clonedVoice && language && (
          <DropdownMenuLabel className="text-[10px] font-normal text-muted-foreground pt-0">
            Stock voice — the host has not recorded theirs
          </DropdownMenuLabel>
        )}
      </DropdownMenuContent>
    </DropdownMenu>

      {/* The one moment money moves. Raised when listening stops, never on a
          timer and never silently — the whole point of running a tab is that
          the charge is a thing the listener does, not a thing that happens. */}
      <AlertDialog open={!!dubbing.bill} onOpenChange={(open) => { if (!open) dubbing.dismissBill(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pay for dubbing?</AlertDialogTitle>
            <AlertDialogDescription>
              You listened to{' '}
              <span className="font-medium text-foreground tabular-nums">
                {dubbing.bill?.minutes} minute{dubbing.bill?.minutes === 1 ? '' : 's'}
              </span>{' '}
              of dubbed audio. That comes to{' '}
              <span className="font-medium text-foreground tabular-nums">{dubbing.bill?.owedDhb} DHB</span>,
              sent from your wallet in one transfer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* Not paying leaves the session open, and an open session blocks
                the next one. Saying so here beats a confusing refusal later. */}
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction disabled={dubbing.settling} onClick={(event) => { event.preventDefault(); void dubbing.settle(); }}>
              {dubbing.settling ? 'Paying…' : `Pay ${dubbing.bill?.owedDhb} DHB`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
