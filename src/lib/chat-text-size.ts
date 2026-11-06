/**
 * Chat text size — a per-reader choice for every chat (main chat, live chat,
 * community chat, DMs). Kept on this device, like the theme, and applied as a
 * CSS variable on <html> so it works before anything has loaded.
 *
 * Sizes are multipliers on rem, so whatever text size the reader already set
 * in their browser or phone still counts: "Large" here is large on top of it.
 */
import { useSyncExternalStore } from 'react';

export const CHAT_TEXT_SIZES = ['small', 'default', 'large', 'larger', 'largest'] as const;
export type ChatTextSize = (typeof CHAT_TEXT_SIZES)[number];

export const CHAT_TEXT_SCALE: Record<ChatTextSize, number> = {
  small: 0.93,
  default: 1,
  large: 1.2,
  larger: 1.4,
  largest: 1.7,
};

const KEY = 'riftn.chat.textSize';
const EVENT = 'riftn:chat-text-size';

export function isChatTextSize(value: unknown): value is ChatTextSize {
  return typeof value === 'string' && (CHAT_TEXT_SIZES as readonly string[]).includes(value);
}

export function getChatTextSize(): ChatTextSize {
  try {
    const v = localStorage.getItem(KEY);
    return isChatTextSize(v) ? v : 'default';
  } catch {
    return 'default';
  }
}

export function applyChatTextSize(size: ChatTextSize = getChatTextSize()): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--chat-text-scale', String(CHAT_TEXT_SCALE[size]));
  root.dataset.chatText = size;
}

export function setChatTextSize(size: ChatTextSize): void {
  try {
    if (size === 'default') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, size);
  } catch {
    // Private mode: the choice just won't stick.
  }
  applyChatTextSize(size);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    applyChatTextSize();
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function useChatTextSize(): ChatTextSize {
  return useSyncExternalStore(subscribe, getChatTextSize, () => 'default');
}
