/**
 * Packs hub — /packs
 *
 * Your emoji, sticker and GIF packs, the ones you added from other people, and
 * the most-added packs to find new ones. Creating is for badge holders; the
 * tier table here is the same one the creator-packs function enforces.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SEOHead } from '@/components/SEOHead';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  createPack,
  useInvalidatePacks,
  useOwnedPacks,
  usePackStatus,
  useSavedPacks,
  type CreatorPack,
  type PackKind,
} from '@/lib/creator-packs/api';
import { PACK_KINDS, PACK_TIER_ORDER, packLimitsFor } from '@/lib/creator-packs/limits';
import { PackCover } from '@/components/app/packs/PackPickerParts';
import { PackLocked, packErrorMessage } from '@/components/app/packs/PackGate';
import { KitButton, PageBody, PageIsland, PageTabs } from '@/components/app/page-kit/PageKit';

function usePopularPacks(kind: PackKind) {
  return useQuery({
    queryKey: ['creator-packs', 'popular', kind],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('creator_packs' as never)
        .select('id, kind, name, slug, owner, cover_url, item_count, save_count, created_at')
        .eq('kind', kind)
        .gt('item_count', 0)
        .order('save_count', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []) as unknown as CreatorPack[];
    },
    staleTime: 60_000,
  });
}

function PackCard({ pack }: { pack: CreatorPack }) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/packs/${pack.slug}`}
      className="flex items-center gap-3 rounded-xl border border-white/[0.12] bg-white/[0.03] p-3 hover:bg-white/[0.07] transition-colors"
    >
      <div className="w-12 h-12 rounded-lg bg-white/5 overflow-hidden flex-shrink-0 p-1">
        <PackCover pack={pack} className="w-full h-full" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-white truncate">{pack.name}</p>
        <p className="text-[11px] text-zinc-400">
          {t('creatorPacks.itemCount', { count: pack.item_count })} · {t('creatorPacks.saveCount', { count: pack.save_count })}
        </p>
      </div>
    </Link>
  );
}

function TierTable() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div data-kit-section className="border border-white/[0.12] bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-white"
      >
        {t('creatorPacks.tierTable')}
        <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="overflow-x-auto px-2 pb-3">
          <table className="w-full text-xs text-zinc-300">
            <thead>
              <tr className="text-zinc-500">
                <th className="text-left font-medium px-2 py-1">{t('creatorPacks.col.tier')}</th>
                <th className="text-right font-medium px-2 py-1">{t('creatorPacks.col.packs')}</th>
                <th className="text-right font-medium px-2 py-1">{t('creatorPacks.col.emoji')}</th>
                <th className="text-right font-medium px-2 py-1">{t('creatorPacks.col.stickers')}</th>
                <th className="text-right font-medium px-2 py-1">{t('creatorPacks.col.gifs')}</th>
              </tr>
            </thead>
            <tbody>
              {PACK_TIER_ORDER.map((tier) => {
                const l = packLimitsFor(tier);
                return (
                  <tr key={tier} className="border-t border-white/5">
                    <td className="px-2 py-1">{tier}</td>
                    <td className="px-2 py-1 text-right">{l.packs}</td>
                    <td className="px-2 py-1 text-right">{l.items.emoji}</td>
                    <td className="px-2 py-1 text-right">{l.items.sticker}</td>
                    <td className="px-2 py-1 text-right">{l.items.gif}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-2 pt-2 text-[11px] text-zinc-500">{t('creatorPacks.tierTableHint')}</p>
        </div>
      )}
    </div>
  );
}

export default function PacksPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { walletAddress, isAuthenticated, openLoginModal } = useAuth();
  const [kind, setKind] = useState<PackKind>('emoji');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const status = usePackStatus(walletAddress);
  const owned = useOwnedPacks(walletAddress);
  const saved = useSavedPacks(walletAddress);
  const popular = usePopularPacks(kind);
  const invalidate = useInvalidatePacks();

  const mine = (owned.data ?? []).filter((p) => p.kind === kind);
  const added = (saved.data ?? []).filter((p) => p.kind === kind);
  const limits = status.data?.limits;
  const canCreate = !!limits && mine.length < limits.packs;

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const pack = await createPack(kind, name.trim());
      await invalidate();
      setName('');
      navigate(`/packs/${pack.slug}`);
    } catch (err) {
      toast.error(packErrorMessage(err, t, kind));
    } finally {
      setBusy(false);
    }
  };

  const kindTab = (k: PackKind) =>
    t(k === 'emoji' ? 'creatorPacks.tab.emoji' : k === 'sticker' ? 'creatorPacks.tab.sticker' : 'creatorPacks.tab.gif');

  return (
    <div className="min-h-screen">
      <SEOHead
        title={t('creatorPacks.seoTitle')}
        description={t('creatorPacks.seoDescription')}
        url="https://dehub.io/packs"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: t('creatorPacks.seoTitle'),
          description: t('creatorPacks.seoDescription'),
          url: 'https://dehub.io/packs',
        }}
      />
      <PageIsland
        className="max-w-2xl mx-auto"
        title={t('creatorPacks.title')}
        tabs={
          <PageTabs
            value={kind}
            onChange={setKind}
            tabs={PACK_KINDS.map((k) => ({ id: k, label: kindTab(k) }))}
          />
        }
      />

      <PageBody measure className="mx-auto">
      <p className="text-sm text-zinc-400">{t('creatorPacks.subtitle')}</p>

      {isAuthenticated && status.data && (
        status.data.limits.packs === 0 ? (
          <div data-kit-section className="border border-white/[0.12] bg-white/[0.03]"><PackLocked /></div>
        ) : (
          <div data-kit-section className="border border-white/[0.12] bg-white/[0.03] px-4 py-3 text-sm text-zinc-300">
            {t('creatorPacks.yourTier', {
              tier: status.data.tier,
              packs: status.data.limits.packs,
              emoji: status.data.limits.items.emoji,
              stickers: status.data.limits.items.sticker,
              gifs: status.data.limits.items.gif,
            })}
          </div>
        )
      )}
      <TierTable />

      {!isAuthenticated ? (
        <div data-kit-section>
          <KitButton variant="primary" onClick={() => openLoginModal()} className="w-full">
            {t('creatorPacks.signInToCreate')}
          </KitButton>
        </div>
      ) : (
        <section data-kit-section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-white">
            {t('creatorPacks.yourPacks')}
            {limits && limits.packs > 0 && <span className="text-zinc-500 font-normal"> · {mine.length}/{limits.packs}</span>}
          </h2>
          {owned.isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {mine.map((p) => <PackCard key={p.id} pack={p} />)}
              {canCreate && (
                <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/20 p-3">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value.slice(0, 64))}
                    onKeyDown={(e) => e.key === 'Enter' && create()}
                    placeholder={t('creatorPacks.packNamePlaceholder')}
                    className="flex-1 min-w-0 h-9 px-2 rounded-md bg-white/5 border border-white/10 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-white/30"
                  />
                  <button
                    type="button"
                    disabled={busy || !name.trim()}
                    onClick={create}
                    aria-label={t('creatorPacks.createPack')}
                    className="h-9 px-3 rounded-md bg-white text-black text-sm font-medium disabled:opacity-40 flex items-center gap-1"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {t('creatorPacks.createPack')}
                  </button>
                </div>
              )}
              {!mine.length && !canCreate && limits && limits.packs > 0 && (
                <p className="text-xs text-zinc-500">{t('creatorPacks.errors.packLimit')}</p>
              )}
            </div>
          )}

          {added.length > 0 && (
            <>
              <h2 className="text-sm font-medium text-white mt-2">{t('creatorPacks.addedPacks')}</h2>
              <div className="grid sm:grid-cols-2 gap-2">{added.map((p) => <PackCard key={p.id} pack={p} />)}</div>
            </>
          )}
        </section>
      )}

      <section data-kit-section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-white">{t('creatorPacks.popular')}</h2>
        {popular.isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
        ) : popular.data?.length ? (
          <div className="grid sm:grid-cols-2 gap-2">{popular.data.map((p) => <PackCard key={p.id} pack={p} />)}</div>
        ) : (
          <p className="text-xs text-zinc-500">{t('creatorPacks.noneYet')}</p>
        )}
      </section>
      </PageBody>
    </div>
  );
}
