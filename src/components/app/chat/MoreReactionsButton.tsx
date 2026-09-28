import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EmojiPanel } from '@/components/app/emoji/EmojiPanel';
import { cn } from '@/lib/utils';

interface MoreReactionsButtonProps {
  /** Called with the picked emoji; the caller's own toggle decides add vs remove. */
  onPick: (emoji: string) => void;
  /** The message's reactions (emoji → addresses), to mark the viewer's own. */
  reactions?: Record<string, string[]> | null;
  viewerAddress?: string | null;
  className?: string;
}

/**
 * The "+" at the end of a chat message's quick-reaction tray: opens the full
 * emoji panel so a reaction is not limited to the nine quick ones. Reactions
 * are stored keyed by the emoji string, so any emoji works end to end.
 */
export function MoreReactionsButton({ onPick, reactions, viewerAddress, className }: MoreReactionsButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const mine = useMemo(() => {
    if (!reactions || !viewerAddress) return [];
    const me = viewerAddress.toLowerCase();
    return Object.entries(reactions)
      .filter(([, addresses]) => addresses?.some((a) => a.toLowerCase() === me))
      .map(([emoji]) => emoji);
  }, [reactions, viewerAddress]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors',
            className,
          )}
          aria-label={t('emojiPicker.moreReactions')}
          title={t('emojiPicker.moreReactions')}
        >
          <Plus className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" collisionPadding={8}
        className="w-[calc(100vw-1rem)] sm:w-[22rem] p-0 overflow-hidden">
        <EmojiPanel
          selected={mine}
          onSelect={(emoji, { keepOpen }) => {
            onPick(emoji);
            if (!keepOpen) setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
