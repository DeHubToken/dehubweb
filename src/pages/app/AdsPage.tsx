import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Ads Manager Page (/app/ads)
 * ===========================
 * Self-serve POVR advertising portal: overview KPIs, campaign management
 * (create → review → serve → analyze), and DHB-funded billing. Follows the
 * StoresPage shell (sticky data-page-bento nav + swallow clip + glass tabs).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Rocket, Wallet, Plus } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { useAuth } from '@/contexts/AuthContext';
import { AdsOverviewTab } from '@/components/app/ads/AdsOverviewTab';
import { CampaignsTab } from '@/components/app/ads/CampaignsTab';
import { BillingTab } from '@/components/app/ads/BillingTab';
import { CampaignWizard } from '@/components/app/ads/CampaignWizard';
import { IslandAction, PageBody, PageEmpty, PageIsland, PageTabs } from '@/components/app/page-kit/PageKit';
import { useAdRevenue } from '@/hooks/use-ads';

export default function AdsPage() {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const [tab, setTab] = useState<'overview' | 'campaigns' | 'billing'>('overview');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [focusCampaignId, setFocusCampaignId] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();
  const revenue = useAdRevenue();

  const openCampaign = (id: string) => {
    setFocusCampaignId(id);
    setTab('campaigns');
  };

  return (
    <div className="min-h-screen">
      <SEOHead
        title={t('ads.seoTitle')}
        description={_copy("copy.dac3d679946e", { defaultValue: "Launch POVR ad campaigns on DeHub: proof-of-view-and-rank advertising that targets verified badge holders, with campaigns paid in tokens." })}
      />

      <PageIsland
        className="max-w-4xl mx-auto"
        icon="ads"
        title={t('ads.adsManager')}
        actions={
          isAuthenticated ? (
            <IslandAction label={t('ads.newCampaign')} onClick={() => setWizardOpen(true)}>
              <Plus className="h-[18px] w-[18px]" />
            </IslandAction>
          ) : undefined
        }
        tabs={
          <PageTabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'overview', label: t('ads.tabOverview'), icon: <LayoutDashboard className="w-4 h-4" /> },
              { id: 'campaigns', label: t('ads.tabCampaigns'), icon: <Rocket className="w-4 h-4" /> },
              { id: 'billing', label: t('ads.tabBilling'), icon: <Wallet className="w-4 h-4" /> },
            ]}
          />
        }
      />

      {/* Content */}
      <PageBody className="max-w-4xl mx-auto">
        {isAuthenticated && revenue.data !== undefined ? <div data-kit-section className="rounded-xl border border-foreground/10 p-4">
          <p className="font-medium text-foreground">{_copy("copy.b7c8b1eb6338", { defaultValue: "Your ad revenue · $" })}{revenue.data.toFixed(4)}</p>
          <p className="text-sm text-muted-foreground">{_copy("copy.6d980563c3da", { defaultValue: "Revenue from ads and creator support, awaiting token settlement." })}</p>
        </div> : null}
        {!isAuthenticated ? (
          <PageEmpty
            icon="ads"
            title={t('ads.advertiseOnDehub')}
            body={
              <>{_copy("copy.c2bb07748c24", { defaultValue: "Target verified badge holders with POVR — proof-of-view-and-rank advertising. Connect your wallet to create your first campaign." })}</>
            }
          />
        ) : tab === 'overview' ? (
          <AdsOverviewTab onOpenCampaign={openCampaign} onNewCampaign={() => setWizardOpen(true)} onGoBilling={() => setTab('billing')} />
        ) : tab === 'campaigns' ? (
          <CampaignsTab
            focusCampaignId={focusCampaignId}
            onFocusHandled={() => setFocusCampaignId(null)}
            onNewCampaign={() => setWizardOpen(true)}
          />
        ) : (
          <BillingTab />
        )}
      </PageBody>

      <CampaignWizard open={wizardOpen} onOpenChange={setWizardOpen} onCreated={openCampaign} />
    </div>
  );
}
