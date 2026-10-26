import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import { ensureFreshToken } from '@/lib/api/dehub/core';
import { useProductImporter, type ImportedProduct } from '@/lib/creator/marketingProductImport';

export function MarketingProductImport({ onUse }: { onUse: (product: ImportedProduct, sourceUrl: string) => void }) {
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const [url, setUrl] = useSurfaceDraft('creator.marketingProductUrl.v1', '', 'campaign');
  const importer = useProductImporter(walletAddress, ensureFreshToken);
  return <div className="mt-5 rounded-2xl border border-white/15 p-4">
    <label className="block text-sm font-medium">{t('creator.marketing.import.url')}
      <input type="url" maxLength={4096} value={url} onChange={event => setUrl(event.target.value)} placeholder="https://" className="mt-2 w-full rounded-xl border border-white/20 bg-transparent p-3 text-sm" />
    </label>
    <button type="button" disabled={!url.trim() || importer.loading} onClick={() => void importer.run(url)} className="mt-3 rounded-xl border border-current px-4 py-2 text-sm disabled:opacity-40">{t(importer.loading ? 'creator.marketing.import.loading' : 'creator.marketing.import.action')}</button>
    <p className="mt-2 text-xs opacity-70">{t('creator.marketing.import.hint')}</p>
    {importer.issue && <p role="alert" className="mt-3 text-sm">{t(`creator.marketing.import.errors.${importer.issue}`)}</p>}
    {importer.result && <div className="mt-4" aria-live="polite">
      <p className="break-all text-xs opacity-70">{t('creator.marketing.import.source')}: {importer.result.finalUrl}</p>
      <p className="mt-1 text-xs opacity-70">{t('creator.marketing.import.review')}</p>
      {importer.result.products.map((product, index) => <article key={index} className="mt-3 rounded-xl border border-white/15 p-3">
        <h3 className="break-words font-semibold">{product.name}</h3>
        <p className="mt-1 break-words text-sm opacity-75">{product.description}</p>
        {product.brand && <p className="mt-1 text-xs opacity-70">{product.brand}</p>}
        <button type="button" className="mt-3 rounded-xl border border-current px-3 py-2 text-sm" onClick={() => onUse(product, importer.result!.finalUrl)}>{t('creator.marketing.import.use')}</button>
      </article>)}
    </div>}
  </div>;
}
