/**
 * Ads Manager Page (/app/ads)
 * ===========================
 * Self-serve POVR advertising portal: overview KPIs, campaign management
 * (create → review → serve → analyze), and DHB-funded billing. Follows the
 * StoresPage shell (sticky data-page-bento nav + swallow clip + glass tabs).
 */

import { useRef, useState } from 'react';
import { Megaphone, LayoutDashboard, Rocket, Wallet, Plus } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { useAuth } from '@/contexts/AuthContext';
import { AdsOverviewTab } from '@/components/app/ads/AdsOverviewTab';
import { CampaignsTab } from '@/components/app/ads/CampaignsTab';
import { BillingTab } from '@/components/app/ads/BillingTab';
import { CampaignWizard } from '@/components/app/ads/CampaignWizard';

export default function AdsPage() {
  const [tab, setTab] = useState<'overview' | 'campaigns' | 'billing'>('overview');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [focusCampaignId, setFocusCampaignId] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();

  const contentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(contentRef, '[data-feed-nav-outer] > [data-page-bento]');

  const openCampaign = (id: string) => {
    setFocusCampaignId(id);
    setTab('campaigns');
  };

  return (
    <div className="min-h-screen">
      <SEOHead
        title="Ads Manager | DeHub"
        description="Launch POVR ad campaigns on DeHub: badge-tier targeting, transparent CPMs, real-time analytics, paid in DHB."
      />

      {/* Sticky nav pill */}
      <div
        data-feed-nav-outer
        className="sticky top-11 lg:top-0 z-50 bg-black px-2 pt-1 pb-0 sm:px-3 sm:pt-1 sm:pb-0 lg:pt-2 max-w-4xl mx-auto"
      >
        <div data-page-bento className="bg-zinc-900 rounded-2xl px-4 py-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Megaphone className="w-6 h-6 text-white shrink-0" />
              <h1 className="text-xl font-bold text-white truncate">Ads Manager</h1>
            </div>
            {isAuthenticated && (
              <LiquidGlassBubble2
                label="New campaign"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => setWizardOpen(true)}
                width="auto"
                height="36px"
              />
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto">
            <LiquidGlassBubble2
              label="Overview"
              icon={<LayoutDashboard className="w-4 h-4" />}
              onClick={() => setTab('overview')}
              width="auto"
              height="38px"
              active={tab === 'overview'}
              className={tab === 'overview' ? undefined : 'opacity-60'}
            />
            <LiquidGlassBubble2
              label="Campaigns"
              icon={<Rocket className="w-4 h-4" />}
              onClick={() => setTab('campaigns')}
              width="auto"
              height="38px"
              active={tab === 'campaigns'}
              className={tab === 'campaigns' ? undefined : 'opacity-60'}
            />
            <LiquidGlassBubble2
              label="Billing"
              icon={<Wallet className="w-4 h-4" />}
              onClick={() => setTab('billing')}
              width="auto"
              height="38px"
              active={tab === 'billing'}
              className={tab === 'billing' ? undefined : 'opacity-60'}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div ref={contentRef} className="w-full max-w-4xl mx-auto px-2 sm:px-3 pt-3 pb-24 space-y-4">
        {!isAuthenticated ? (
          <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-10 text-center space-y-2">
            <Megaphone className="w-8 h-8 text-muted-foreground mx-auto" />
            <h2 className="text-lg font-semibold text-foreground">Advertise on DeHub</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Target verified badge holders with POVR — proof-of-view-and-rank advertising.
              Connect your wallet to create your first campaign.
            </p>
          </div>
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
      </div>

      <CampaignWizard open={wizardOpen} onOpenChange={setWizardOpen} onCreated={openCampaign} />
    </div>
  );
}
