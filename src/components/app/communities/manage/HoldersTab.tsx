/**
 * Holders tab
 * ===========
 * Owner-only switch that turns a community into a holder group: pick a chain,
 * a token and a minimum. The database then checks every joiner's balance
 * itself; this form only stores the rule.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Community, CommunityMember } from '@/hooks/use-communities';
import dehubCoin from '@/assets/dehub-coin.png';
import {
  DEHUB_TOKEN_BY_CHAIN,
  HOLDER_GATE_CHAINS,
  holderGateOf,
  isDehubToken,
  readTokenMeta,
  useSetHolderGate,
} from '@/hooks/use-holder-gate';
import { TopHolders } from '../TopHolders';

export interface HoldersTabProps {
  community: Community;
  membership: CommunityMember | null | undefined;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function HoldersTab({ community }: HoldersTabProps) {
  const { t } = useTranslation();
  const saved = holderGateOf(community);
  const setGate = useSetHolderGate();

  const fallbackChain = 56;

  const [enabled, setEnabled] = useState(!!saved);
  const [chainId, setChainId] = useState<number>(saved?.chainId ?? fallbackChain);
  // DeHub tokens by default; any other token is one tap away.
  const [useDehub, setUseDehub] = useState(!saved || isDehubToken(saved));
  const [otherToken, setOtherToken] = useState(saved && !isDehubToken(saved) ? saved.token : (community.ticker_contract_address ?? ''));
  const token = useDehub ? DEHUB_TOKEN_BY_CHAIN[chainId] : otherToken;
  const setToken = setOtherToken;
  const [min, setMin] = useState(saved ? String(saved.min) : '1');
  const [meta, setMeta] = useState<{ symbol: string | null; decimals: number | null }>({
    symbol: saved?.symbol ?? null,
    decimals: saved?.decimals ?? null,
  });
  const [readingMeta, setReadingMeta] = useState(false);

  useEffect(() => {
    if (useDehub) { setMeta({ symbol: 'DHB', decimals: 18 }); return; }
    if (!ADDRESS.test(token)) return;
    let cancelled = false;
    setReadingMeta(true);
    readTokenMeta(chainId, token)
      .then(result => { if (!cancelled) setMeta({ symbol: result.symbol, decimals: result.decimals }); })
      .finally(() => { if (!cancelled) setReadingMeta(false); });
    return () => { cancelled = true; };
  }, [chainId, token, useDehub]);

  const minNumber = Number(min);
  const valid = ADDRESS.test(token) && Number.isFinite(minNumber) && minNumber >= 0;

  const save = () => {
    if (!enabled) {
      setGate.mutate(
        { communityId: community.id, gate: null },
        { onSuccess: () => toast.success(t('communities.holderGate.cleared', { defaultValue: 'Anyone can join again' })) },
      );
      return;
    }
    if (!valid) return;
    setGate.mutate(
      {
        communityId: community.id,
        gate: { chainId, token: token.toLowerCase(), min: minNumber, symbol: meta.symbol, decimals: meta.decimals ?? 18 },
      },
      { onSuccess: () => toast.success(t('communities.holderGate.saved', { defaultValue: 'Holder rule saved' })) },
    );
  };

  const toggle = (next: boolean) => {
    setEnabled(next);
    // Turning it off is one tap, like Telegram's switches.
    if (!next && saved) {
      setGate.mutate(
        { communityId: community.id, gate: null },
        { onSuccess: () => toast.success(t('communities.holderGate.cleared', { defaultValue: 'Anyone can join again' })) },
      );
    }
  };

  return (
    <div className="space-y-3" data-holders-tab>
      <section className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-white font-medium text-sm">
              {t('communities.holderGate.title', { defaultValue: 'Holders only' })}
            </h3>
            <p className="text-zinc-500 text-xs mt-1">
              {t('communities.holderGate.explain', {
                defaultValue: 'Only wallets holding this token can join and chat. Balances are read from the chain when someone joins.',
              })}
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={toggle} disabled={setGate.isPending} aria-label={t('communities.holderGate.title', { defaultValue: 'Holders only' })} />
        </div>

        {enabled && (
          <div className="mt-3.5 space-y-2.5">
            <label className="block">
              <span className="text-zinc-400 text-xs">{t('communities.holderGate.chain', { defaultValue: 'Chain' })}</span>
              <Select value={String(chainId)} onValueChange={v => setChainId(Number(v))}>
                <SelectTrigger className="mt-1 h-9 rounded-xl border-white/10 bg-white/[0.04] text-sm text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOLDER_GATE_CHAINS.map(chain => (
                    <SelectItem key={chain.id} value={String(chain.id)}>{chain.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <div>
              <span className="text-zinc-400 text-xs">{t('communities.holderGate.which', { defaultValue: 'Token' })}</span>
              <div className="mt-1 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setUseDehub(true)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs ${useDehub ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.04] text-zinc-300'}`}
                >
                  <img src={dehubCoin} alt="" className="w-4 h-4" />
                  {t('communities.holderGate.dehubTokens', { defaultValue: 'DeHub tokens' })}
                </button>
                <button
                  type="button"
                  onClick={() => setUseDehub(false)}
                  className={`rounded-xl border px-3 py-1.5 text-xs ${!useDehub ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.04] text-zinc-300'}`}
                >
                  {t('communities.holderGate.otherToken', { defaultValue: 'Another token' })}
                </button>
              </div>
            </div>

            {!useDehub && <label className="block">
              <span className="text-zinc-400 text-xs">{t('communities.holderGate.token', { defaultValue: 'Token contract' })}</span>
              <Input
                value={token}
                onChange={e => setToken(e.target.value.trim())}
                placeholder="0x…"
                spellCheck={false}
                className="mt-1 h-9 rounded-xl border-white/10 bg-white/[0.04] font-mono text-xs text-white"
              />
              <span className="mt-1 block text-[11px] text-zinc-500 min-h-[16px]">
                {readingMeta
                  ? t('communities.holderGate.reading', { defaultValue: 'Reading token…' })
                  : meta.symbol
                    ? `${meta.symbol}${meta.decimals != null ? ` · ${meta.decimals} decimals` : ''}`
                    : token && !ADDRESS.test(token)
                      ? t('communities.holderGate.badAddress', { defaultValue: 'That is not a token address' })
                      : ''}
              </span>
            </label>}

            <label className="block">
              <span className="text-zinc-400 text-xs">{t('communities.holderGate.minimum', { defaultValue: 'Minimum to hold' })}</span>
              <Input
                value={min}
                onChange={e => setMin(e.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal"
                className="mt-1 h-9 rounded-xl border-white/10 bg-white/[0.04] text-sm text-white"
              />
            </label>

            <Button
              onClick={save}
              disabled={!valid || setGate.isPending}
              className="w-full h-9 rounded-xl bg-white text-black hover:bg-white/90 text-sm font-medium"
            >
              {setGate.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
              {t('communities.holderGate.save', { defaultValue: 'Save holder rule' })}
            </Button>
          </div>
        )}
      </section>

      {saved && <TopHolders community={community} />}
    </div>
  );
}
