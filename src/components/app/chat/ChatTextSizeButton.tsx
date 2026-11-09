/**
 * "Aa" in a chat: pick how big chat text is. Saved on this device and shared
 * with Settings → Appearance → Chat text size.
 */
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { CHAT_TEXT_SCALE, setChatTextSize, useChatTextSize } from '@/lib/chat-text-size';
import { useChatTextSizeOptions } from '@/hooks/use-chat-text-size-options';

export function ChatTextSizeButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const size = useChatTextSize();
  const options = useChatTextSizeOptions();
  const label = t('chatTextSize.title', 'Text size');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-chat-text-size
          aria-label={label}
          title={label}
          className={cn(
            'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-zinc-400 transition-colors hover:bg-zinc-700/60 hover:text-white',
            className,
          )}
        >
          <span aria-hidden="true" className="font-semibold leading-none tracking-tight">
            <span className="text-[11px]">A</span><span className="text-[15px]">a</span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-56 rounded-xl border-zinc-700 bg-zinc-900 p-1.5">
        <p className="px-2 pb-1 pt-0.5 text-xs font-medium text-zinc-400">{label}</p>
        <div role="radiogroup" aria-label={label} className="flex flex-col">
          {options.map((o) => {
            const on = o.value === size;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setChatTextSize(o.value)}
                className={cn(
                  'flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-white transition-colors',
                  on ? 'bg-white/15' : 'hover:bg-white/10',
                )}
                style={{ fontSize: `calc(0.9375rem * ${CHAT_TEXT_SCALE[o.value]})` }}
              >
                <span>{o.label}</span>
                {on && <span aria-hidden="true" className="text-xs text-zinc-400">✓</span>}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
