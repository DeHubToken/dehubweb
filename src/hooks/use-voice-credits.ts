/**
 * Voice Credits Hook
 * ==================
 * Manages prepaid voice exchange credits stored in localStorage.
 * Users purchase bundles (10, 100, 500) and each STT+TTS round deducts 1 credit.
 */

import { useState, useCallback, useEffect } from 'react';

export type VoiceBundleSize = 10 | 100 | 500;

export interface VoiceBundle {
  size: VoiceBundleSize;
  label: string;
  /** Per-exchange cost in USD (after markup) */
  perExchangeUsd: number;
  /** Total USD cost */
  totalUsd: number;
  /** Discount percentage vs single purchase */
  discount: number;
}

/** Whisper ($0.03) + Dia TTS ($0.04) = $0.07 base × 2 (100% markup) = $0.14 per exchange */
const PER_EXCHANGE_USD = 0.14;

export const VOICE_BUNDLES: VoiceBundle[] = [
  { size: 10, label: '10 Exchanges', perExchangeUsd: PER_EXCHANGE_USD, totalUsd: 10 * PER_EXCHANGE_USD, discount: 0 },
  { size: 100, label: '100 Exchanges', perExchangeUsd: PER_EXCHANGE_USD * 0.9, totalUsd: 100 * PER_EXCHANGE_USD * 0.9, discount: 10 },
  { size: 500, label: '500 Exchanges', perExchangeUsd: PER_EXCHANGE_USD * 0.8, totalUsd: 500 * PER_EXCHANGE_USD * 0.8, discount: 20 },
];

const STORAGE_KEY = 'dehub_voice_credits';

interface StoredCredits {
  credits: number;
  walletAddress: string;
}

function getStoredCredits(walletAddress: string): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const parsed: StoredCredits = JSON.parse(raw);
    if (parsed.walletAddress?.toLowerCase() !== walletAddress.toLowerCase()) return 0;
    return Math.max(0, parsed.credits || 0);
  } catch {
    return 0;
  }
}

function setStoredCredits(walletAddress: string, credits: number) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ credits, walletAddress: walletAddress.toLowerCase() }));
}

export function useVoiceCredits(walletAddress: string | null) {
  const [credits, setCredits] = useState(0);

  // Load on mount / wallet change
  useEffect(() => {
    if (walletAddress) {
      setCredits(getStoredCredits(walletAddress));
    } else {
      setCredits(0);
    }
  }, [walletAddress]);

  const addCredits = useCallback((amount: number) => {
    if (!walletAddress) return;
    setCredits(prev => {
      const next = prev + amount;
      setStoredCredits(walletAddress, next);
      return next;
    });
  }, [walletAddress]);

  const deductCredit = useCallback((): boolean => {
    if (!walletAddress) return false;
    const current = getStoredCredits(walletAddress);
    if (current <= 0) return false;
    const next = current - 1;
    setStoredCredits(walletAddress, next);
    setCredits(next);
    return true;
  }, [walletAddress]);

  const hasCredits = credits > 0;

  return { credits, hasCredits, addCredits, deductCredit };
}

export function getBundleCostDhb(bundle: VoiceBundle, dhbPriceUsd: number): number {
  if (dhbPriceUsd <= 0) return 0;
  return bundle.totalUsd / dhbPriceUsd;
}
