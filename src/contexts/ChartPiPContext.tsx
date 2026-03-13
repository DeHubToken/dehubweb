/**
 * Chart Picture-in-Picture Context
 * =================================
 * Manages floating chart widgets that persist across navigation and refresh.
 * Charts are stored in localStorage so they survive page reloads.
 */

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { toast } from 'sonner';

export interface ChartPiPItem {
  id: string;
  symbol: string;
  displayName: string;
  logo?: string | null;
  /** Position persisted */
  x?: number;
  y?: number;
  /** Size persisted */
  width?: number;
  height?: number;
}

interface ChartPiPContextType {
  chartPiPs: ChartPiPItem[];
  addChartPiP: (item: Omit<ChartPiPItem, 'id'>) => boolean;
  removeChartPiP: (id: string) => void;
  updateChartPiP: (id: string, updates: Partial<ChartPiPItem>) => void;
  isChartPiP: (symbol: string) => boolean;
}

const ChartPiPContext = createContext<ChartPiPContextType | null>(null);

const STORAGE_KEY = 'dehub-chart-pip';
const MAX_CHART_PIP = 4;

function loadFromStorage(): ChartPiPItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToStorage(items: ChartPiPItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

export function ChartPiPProvider({ children }: { children: ReactNode }) {
  const [chartPiPs, setChartPiPs] = useState<ChartPiPItem[]>(() => loadFromStorage());

  useEffect(() => {
    saveToStorage(chartPiPs);
  }, [chartPiPs]);

  const addChartPiP = useCallback((item: Omit<ChartPiPItem, 'id'>): boolean => {
    const id = `chart-pip-${item.symbol}-${Date.now()}`;
    setChartPiPs(prev => {
      if (prev.some(p => p.symbol.toUpperCase() === item.symbol.toUpperCase())) {
        toast.info(`${item.symbol} chart is already floating`);
        return prev;
      }
      if (prev.length >= MAX_CHART_PIP) {
        toast.error(`Maximum ${MAX_CHART_PIP} floating charts allowed`);
        return prev;
      }
      return [...prev, { ...item, id }];
    });
    return true;
  }, []);

  const removeChartPiP = useCallback((id: string) => {
    setChartPiPs(prev => prev.filter(p => p.id !== id));
  }, []);

  const updateChartPiP = useCallback((id: string, updates: Partial<ChartPiPItem>) => {
    setChartPiPs(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }, []);

  const isChartPiP = useCallback((symbol: string) => {
    return chartPiPs.some(p => p.symbol.toUpperCase() === symbol.toUpperCase());
  }, [chartPiPs]);

  return (
    <ChartPiPContext.Provider value={{ chartPiPs, addChartPiP, removeChartPiP, updateChartPiP, isChartPiP }}>
      {children}
    </ChartPiPContext.Provider>
  );
}

export function useChartPiP() {
  const ctx = useContext(ChartPiPContext);
  if (!ctx) throw new Error('useChartPiP must be used within ChartPiPProvider');
  return ctx;
}
