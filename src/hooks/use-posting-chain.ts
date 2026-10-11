import { useTranslation as _useCopy } from 'react-i18next';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { SUPPORTED_CHAINS, type PostChainId } from '@/components/app/ChainSelector';
import { isSolanaChain } from '@/lib/chains/constants';
import { getSolanaStatus } from '@/lib/api/dehub/solana';

const STORAGE_KEY = 'dehub_posting_chain';
const CHANGE_EVENT = 'dehub-posting-chain-change';
const DEFAULT_CHAIN: PostChainId = 8453;

function readChain(): PostChainId {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return SUPPORTED_CHAINS.find(chain => chain.id === stored)?.id ?? DEFAULT_CHAIN;
  } catch {
    return DEFAULT_CHAIN;
  }
}

function subscribe(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

/** Device-local, shared by Settings and every mounted post composer. */
export function usePostingChain() {
  const { t: _copy } = _useCopy();
  const chainId = useSyncExternalStore(subscribe, readChain, () => DEFAULT_CHAIN);
  const [saving, setSaving] = useState(false);
  const setChainId = useCallback(async (next: PostChainId) => {
    if (!SUPPORTED_CHAINS.some(chain => chain.id === next)) return;
    setSaving(true);
    try {
      if (isSolanaChain(next)) {
        // Keep the existing availability check; a failed status request is optional.
        const status = await getSolanaStatus().catch(() => null);
        if (status?.mintingEnabled === false) {
          toast.error(status.message || 'Solana posting is temporarily unavailable. Try Base or BNB instead.');
          return;
        }
      }
      localStorage.setItem(STORAGE_KEY, String(next));
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      toast.error(_copy("copy.b17c87d6ac6b", { defaultValue: "Could not save posting chain. Please try again." }));
    } finally {
      setSaving(false);
    }
  }, [_copy]);

  return { chainId, setChainId, saving };
}
