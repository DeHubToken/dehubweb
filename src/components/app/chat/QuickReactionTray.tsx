/**
 * The quick-reaction row in a message's React popover, plus a "+" that opens
 * the full picker in place — so a reaction can be any emoji, skin tone, flag
 * or custom :shortcode:, not only the nine on the row.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { FullEmojiPicker } from '@/components/app/emoji/FullEmojiPicker';
import { QUICK_CHAT_REACTIONS } from './reaction-options';

interface QuickReactionTrayProps {
  /** True when the viewer already holds this reaction (the chip is lit). */
  isMine: (emoji: string) => boolean;
  onPick: (emoji: string) => void;
}

export function QuickReactionTray({ isMine, onPick }: QuickReactionTrayProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (expanded) {
    return <FullEmojiPicker onSelect={onPick} className="w-[20rem] max-w-[calc(100vw-1.5rem)]" height={224} />;
  }

  return (
    <div className="flex gap-0.5">
      {QUICK_CHAT_REACTIONS.map((emoji) => (
        <button
          type="button"
          key={emoji}
          onClick={() => onPick(emoji)}
          className={`w-8 h-8 flex items-center justify-center text-lg rounded-lg transition-colors ${
            isMine(emoji) ? 'bg-white/15 ring-1 ring-white/30' : 'hover:bg-zinc-700'
          }`}
        >
          {emoji}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setExpanded(true)}
        title={t('emojiPicker.moreReactions')}
        aria-label={t('emojiPicker.moreReactions')}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
