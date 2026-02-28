/**
 * Picture-in-Picture Context
 * ==========================
 * Manages up to 3 custom floating mini-players for TV channels.
 * Native PiP only supports 1 window; this creates in-app floating players.
 */

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { toast } from 'sonner';

export interface PiPChannel {
  id: string;
  name: string;
  streamUrl: string;
  logo?: string | null;
  country?: string;
}

interface PiPContextType {
  pipChannels: PiPChannel[];
  addPiP: (channel: PiPChannel) => boolean;
  removePiP: (channelId: string) => void;
  isPiP: (channelId: string) => boolean;
}

const PiPContext = createContext<PiPContextType | null>(null);

const MAX_PIP = 3;

export function PiPProvider({ children }: { children: ReactNode }) {
  const [pipChannels, setPipChannels] = useState<PiPChannel[]>([]);
  const channelsRef = useRef<PiPChannel[]>([]);
  channelsRef.current = pipChannels;

  const addPiP = useCallback((channel: PiPChannel): boolean => {
    const current = channelsRef.current;
    if (current.find(c => c.id === channel.id)) return false;
    if (current.length >= MAX_PIP) {
      toast.error(`Maximum ${MAX_PIP} mini-players allowed`);
      return false;
    }
    setPipChannels(prev => [...prev, channel]);
    return true;
  }, []);

  const removePiP = useCallback((channelId: string) => {
    setPipChannels(prev => prev.filter(c => c.id !== channelId));
  }, []);

  const isPiP = useCallback((channelId: string) => {
    return pipChannels.some(c => c.id === channelId);
  }, [pipChannels]);

  return (
    <PiPContext.Provider value={{ pipChannels, addPiP, removePiP, isPiP }}>
      {children}
    </PiPContext.Provider>
  );
}

export function usePiP() {
  const ctx = useContext(PiPContext);
  if (!ctx) throw new Error('usePiP must be used within PiPProvider');
  return ctx;
}
