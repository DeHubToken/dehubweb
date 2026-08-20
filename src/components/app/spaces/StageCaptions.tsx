/**
 * StageCaptions — live subtitles under a stage.
 *
 * The overlay is a passive reader: it subscribes to the caption broadcast and
 * draws whatever arrives. Nothing here transcribes, so it is safe to mount on
 * any surface showing a room, including for a signed-out guest on an invite
 * link.
 *
 * Unfinished lines are drawn at reduced opacity. That is the only cue a viewer
 * gets that the words may still change, and it is worth having — live
 * transcription revises itself mid-sentence, and text that silently rewrites
 * reads as a glitch unless it looks provisional first.
 */

import { Captions, CaptionsOff, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useStageCaptionFeed } from '@/hooks/use-stage-captions';
import {
  setSendCaptions,
  setShowCaptions,
  useSendCaptions,
  useShowCaptions,
} from '@/lib/stage-captions';

interface StageCaptionsOverlayProps {
  spaceId: string | undefined | null;
  className?: string;
}

export function StageCaptionsOverlay({ spaceId, className }: StageCaptionsOverlayProps) {
  const show = useShowCaptions();
  const lines = useStageCaptionFeed(spaceId, show);

  if (!show || lines.length === 0) return null;

  return (
    <div
      className={cn(
        'pointer-events-none flex flex-col items-center gap-1 px-3',
        className,
      )}
      aria-live="polite"
    >
      {lines.map((line) => (
        <div
          key={line.id}
          className={cn(
            'max-w-xl rounded-xl bg-black/70 backdrop-blur-[24px] border border-white/10 px-3 py-1.5',
            'text-sm leading-snug text-white text-center transition-opacity duration-200',
            line.final ? 'opacity-100' : 'opacity-70',
          )}
        >
          <span
            className={cn(
              'mr-1.5 text-xs font-medium',
              line.kind === 'ai' ? 'text-white/50 italic' : 'text-white/60',
            )}
          >
            {line.name}
          </span>
          <span>{line.text}</span>
        </div>
      ))}
    </div>
  );
}

interface StageCaptionsButtonProps {
  /** Speakers get the extra switch for their own microphone; listeners have nothing to send. */
  isSpeaker: boolean;
  className?: string;
}

export function StageCaptionsButton({ isSpeaker, className }: StageCaptionsButtonProps) {
  const show = useShowCaptions();
  const send = useSendCaptions();

  const icon = show ? <Captions className="w-5 h-5" /> : <CaptionsOff className="w-5 h-5" />;
  const buttonClass = cn(
    'rounded-xl w-12 h-12',
    show
      ? 'bg-white/20 hover:bg-white/30 text-white ring-2 ring-white/30'
      : 'bg-white/10 backdrop-blur-md border border-white/10 hover:bg-white/20 text-white',
    className,
  );

  // A listener has exactly one choice to make, so it is a button, not a menu.
  if (!isSpeaker) {
    return (
      <Button
        onClick={() => setShowCaptions(!show)}
        size="lg"
        className={buttonClass}
        title={show ? 'Hide subtitles' : 'Show subtitles'}
      >
        {icon}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="lg" className={buttonClass} title="Subtitles">
          {icon}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-56">
        <DropdownMenuItem onSelect={() => setShowCaptions(!show)}>
          <Check className={cn('w-4 h-4 mr-2', show ? 'opacity-100' : 'opacity-0')} />
          Show subtitles
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setSendCaptions(!send)}>
          <Check className={cn('w-4 h-4 mr-2', send ? 'opacity-100' : 'opacity-0')} />
          Subtitle my voice
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
