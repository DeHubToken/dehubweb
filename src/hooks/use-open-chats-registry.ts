/**
 * Open Chats Registry
 * ===================
 * Tracks currently open (non-minimized) desktop AI chat panels
 * so they can stack side-by-side from the bottom-right.
 */

import { useState, useEffect, useCallback } from 'react';

let openChats: string[] = [];
const listeners = new Set<(chats: string[]) => void>();

function notify() {
  listeners.forEach(l => l([...openChats]));
}

export function useOpenChatsRegistry(chatId: string, isOpen: boolean) {
  const [position, setPosition] = useState(-1);

  useEffect(() => {
    if (isOpen) {
      if (!openChats.includes(chatId)) {
        openChats = [...openChats, chatId];
        notify();
      }
    } else {
      if (openChats.includes(chatId)) {
        openChats = openChats.filter(id => id !== chatId);
        notify();
      }
    }

    return () => {
      openChats = openChats.filter(id => id !== chatId);
      notify();
    };
  }, [chatId, isOpen]);

  useEffect(() => {
    const listener = (chats: string[]) => {
      setPosition(chats.indexOf(chatId));
    };
    listeners.add(listener);
    // Set initial position
    setPosition(openChats.indexOf(chatId));
    return () => { listeners.delete(listener); };
  }, [chatId]);

  return { position, totalOpen: openChats.length };
}
