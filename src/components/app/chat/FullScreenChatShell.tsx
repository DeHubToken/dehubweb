import type { CSSProperties, ReactNode } from 'react';
import { useTranslation as _useCopy } from 'react-i18next';
import { AppState } from '@/components/app/AppState';
import { cn } from '@/lib/utils';

/**
 * Messages with nothing else on screen, at riftn.com/chat.
 *
 * Computers: the chat list on the left, the open chat on the right, both kept
 * mounted, so switching threads never reloads the list. Phones: one column at
 * a time; the chat slides in over the list and Back slides it away.
 *
 * `inline` is for the state gallery, which frames the shell in a fixed box
 * inside its own page instead of letting it take the window.
 */
export function FullScreenChatShell({
  list,
  chat,
  chatOpen,
  style,
  inline = false,
}: {
  list: ReactNode;
  chat: ReactNode | null;
  chatOpen: boolean;
  style?: CSSProperties;
  inline?: boolean;
}) {
  const { t: _copy } = _useCopy();
  return (
    <div
      id={inline ? undefined : 'app-root'}
      data-fullscreen-chat
      style={style}
      className={cn(
        'flex overflow-hidden bg-black text-white',
        inline ? 'relative h-[680px] w-full rounded-3xl border border-white/10' : 'fixed inset-0 z-[70] h-[100dvh]',
      )}
    >
      <aside
        data-fsc-list
        className={cn(
          'flex h-full min-h-0 w-full flex-col md:w-[clamp(18rem,30vw,26.5rem)] md:shrink-0 md:border-r md:border-white/[0.07]',
          chatOpen && 'max-md:hidden',
        )}
      >
        {list}
      </aside>
      <section
        data-fsc-chat
        data-fsc-chat-open={chatOpen ? '' : undefined}
        className={cn('relative flex h-full min-h-0 min-w-0 flex-1 flex-col', !chatOpen && 'max-md:hidden')}
      >
        {chat ?? (
          <div data-chat-wallpaper className="flex h-full items-center justify-center">
            <AppState
              icon="messages"
              title={_copy('fullscreenChat.pickTitle', { defaultValue: 'Pick a chat' })}
              description={_copy('fullscreenChat.pickBody', { defaultValue: 'Choose a conversation on the left, or start a new one.' })}
              size="section"
            />
          </div>
        )}
      </section>
    </div>
  );
}
