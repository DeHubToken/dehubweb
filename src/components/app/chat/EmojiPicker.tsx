import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Smile } from 'lucide-react';
import { EmojiPanel } from '@/components/app/emoji/EmojiPanel';

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
}

export function EmojiPicker({ onEmojiSelect }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
        >
          <Smile className="w-5 h-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent collisionPadding={8}
        className="w-[calc(100vw-1rem)] sm:w-[22rem] p-0 overflow-hidden" align="start" side="top">
        <EmojiPanel
          onSelect={(emoji, { keepOpen }) => {
            onEmojiSelect(emoji);
            if (!keepOpen) setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
