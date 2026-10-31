import { useTranslation as _useCopy } from 'react-i18next';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { SUPPORTED_CHAINS, type PostChainId } from '@/components/app/ChainSelector';
import { isSolanaChain } from '@/lib/chains/constants';
import { getSolanaStatus } from '@/lib/api/dehub/solana';
import { DEFAULT_CHAIN_EVENT, NEW_USER_DEFAULT_CHAIN, getDefaultChainId } from '@/lib/chains/default-chain';

const STORAGE_KEY = 'dehub_posting_chain';
const CHANGE_EVENT = 'dehub-posting-chain-change';

function readChain(): PostChainId {
  try {
    // An explicit pick in Settings wins; otherwise BNB, or Base for a wallet
    // that already held Base tokens (lib/chains/default-chain).
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = raw === null ? NaN : Number(raw);
    return SUPPORTED_CHAINS.find(chain => chain.id === stored)?.id ?? getDefaultChainId();
  } catch {
    return getDefaultChainId();
  }
}

function subscribe(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener(DEFAULT_CHAIN_EVENT, listener);
  return () => {
    window.removeEventListener(DEFAULT_CHAIN_EVENT, listener);
    window.removeEventListener('storage', listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

/** Device-local, shared by Settings and every mounted post composer. */
export function usePostingChain() {
  const { t: _copy } = _useCopy();
  const chainId = useSyncExternalStore(subscribe, readChain, () => NEW_USER_DEFAULT_CHAIN);
  const [saving, setSaving] = useState(false);
  const setChainId = useCallback(async (next: PostChainId) => {
    if (!SUPPORTED_CHAINS.some(chain => chain.id === next)) return;
    setSaving(true);
    try {
      if (isSolanaChain(next)) {
        // Keep the existing availability check; a failed status request is optional.
        const status = await getSolanaStatus().catch(() => null);
        if (status?.mintingEnabled === false) {
          toast.error(status.message || _copy("copy.7f16ea6ac0d8", { defaultValue: "Solana posting is temporarily unavailable. Try Base or BNB instead." }));
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
