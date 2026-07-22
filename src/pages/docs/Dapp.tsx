import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import BadgeFlowchart from '../../components/BadgeFlowchart';
import TippingFlowchart from '../../components/TippingFlowchart';
// Folded in from their former standalone pages (/docs/depin, /docs/e2e-encryption,
// /docs/ai-toolkits) so the whole dApp lives on one page. Those slugs now redirect
// to the matching anchor below.
import DePIN from './DePIN';
import E2EEncryption from './E2EEncryption';
import AIToolkits from './AIToolkits';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Video, Coins, Shield, Users, Settings, Eye, Zap, Crown, MessageCircle, Lock, Banknote, TrendingUp, Infinity, Percent, Vote, Scale, CheckCircle2, AlertTriangle, Layers, Network, ExternalLink, CreditCard } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Product screenshot with a caption. Lazy so a page this long stays cheap.
 * Intrinsic size is the capture viewport (1440x940): without it the lazy images
 * reserve no space, which both shifts layout and lands #anchor jumps off-target.
 */
const Shot = ({ src, alt }: { src: string; alt: string }) => (
  <figure className="my-6">
    <img
      src={src}
      alt={alt}
      width={1440}
      height={940}
      loading="lazy"
      decoding="async"
      className="w-full h-auto rounded-lg border border-border shadow-sm"
    />
    <figcaption className="text-center text-sm text-muted-foreground mt-3 font-exo">{alt}</figcaption>
  </figure>
);

const Dapp = () => {
  const { t } = useLanguage();
  const { hash } = useLocation();
  const navigate = useNavigate();

  // Deep links (/docs/dapps#wallet) land on a page tall enough that a single
  // scroll fires before the layout has settled and lands short. Re-assert the
  // position a few times while lazy images resolve. In-page chip clicks scroll
  // themselves smoothly, so this skips them via the ref below.
  const chipScroll = useRef(false);
  useEffect(() => {
    if (!hash) return;
    if (chipScroll.current) { chipScroll.current = false; return; }
    const id = hash.slice(1);
    let tries = 0;
    let timer = 0;
    const settle = () => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'auto', block: 'start' });
      if (tries++ < 8) timer = window.setTimeout(settle, 120);
    };
    timer = window.setTimeout(settle, 60);
    return () => window.clearTimeout(timer);
  }, [hash]);

  const tocItems: Array<{ id: string; label: string }> = [
    { id: 'getting-started', label: t('dapp.tocIntro') },
    { id: 'feeds', label: t('dapp.tocFeeds') },
    { id: 'uploading', label: t('dapp.tocUploading') },
    { id: 'tokenised-uploads', label: t('dapp.tocTokenised') },
    { id: 'profile', label: t('dapp.tocProfile') },
    { id: 'top-up', label: t('dapp.tocTopUp') },
    { id: 'explore', label: t('dapp.tocExplore') },
    { id: 'badges', label: t('dapp.tocBadges') },
    { id: 'tipping', label: t('dapp.tocTipping') },
    { id: 'governance', label: t('dapp.tocGovernance') },
    { id: 'live-streaming', label: t('dapp.liveStreamingTitle') },
    { id: 'subscriptions', label: t('dapp.subscriptionsTitle') },
    { id: 'messages', label: t('dapp.messagesTitle') },
    { id: 'superpowers', label: t('dapp.superPowersTitle') },
    { id: 'fees', label: t('dapp.tocFees') },
    { id: 'communities', label: t('dapp.communitiesTitle') },
    { id: 'stages', label: t('dapp.stagesTitle') },
    { id: 'tv-radio', label: t('dapp.tvRadioTitle') },
    { id: 'wallet', label: t('dapp.tocWallet') },
    { id: 'work', label: t('dapp.tocBounties') },
    { id: 'stores', label: t('dapp.storesTitle') },
    { id: 'affiliate', label: t('dapp.affiliateTitle') },
    { id: 'ai-suite', label: t('dapp.tocAi') },
    { id: 'encryption', label: t('dapp.tocEncryption') },
    { id: 'depin', label: t('dapp.tocDepin') },
    { id: 'advertising', label: t('dapp.tocAds') },
    { id: 'feature-requests', label: t('dapp.tocRequests') },
    { id: 'connect', label: t('dapp.tocConnect') },
  ];

  const badgeKeys = [
    'badgeNone', 'badgeCrab', 'badgeLobster', 'badgePiranha', 'badgeTortoise',
    'badgeCobra', 'badgeOctopus', 'badgeCrocodile', 'badgeDolphin', 'badgeTigerShark',
    'badgeKillerWhale', 'badgeGreatWhiteShark', 'badgeBlueWhale', 'badgeMegalodon'
  ];

  const feeReductions = [
    { badgeKey: 'badgeNone', threshold: "< 10,000 $DHB", fee: "10.00%", color: "bg-muted", image: null },
    { badgeKey: 'badgeCrab', threshold: "10,000+ $DHB", fee: "9.31%", color: "bg-muted", image: "/lovable-uploads/60bc125c-8efd-4058-9e12-7ca393df4fce.png" },
    { badgeKey: 'badgeLobster', threshold: "25k+ $DHB", fee: "8.62%", color: "bg-muted", image: "/lovable-uploads/2c7200c2-681e-4499-863b-ea24fdbdb70c.png" },
    { badgeKey: 'badgePiranha', threshold: "50k+ $DHB", fee: "7.93%", color: "bg-muted", image: "/lovable-uploads/38387f75-fd38-4380-9588-1f19f68d8435.png" },
    { badgeKey: 'badgeTortoise', threshold: "100k+ $DHB", fee: "7.24%", color: "bg-muted", image: "/lovable-uploads/fc47a759-390a-4f41-ba96-5bc0066e82b9.png" },
    { badgeKey: 'badgeCobra', threshold: "250k+ $DHB", fee: "6.55%", color: "bg-muted", image: "/lovable-uploads/b3306c99-31b8-4bfc-bc25-f73abc68fc38.png" },
    { badgeKey: 'badgeOctopus', threshold: "500k+ $DHB", fee: "5.86%", color: "bg-muted", image: "/lovable-uploads/8fcbb3f6-223d-4e2f-9d82-30082a175491.png" },
    { badgeKey: 'badgeCrocodile', threshold: "1m+ $DHB", fee: "5.17%", color: "bg-muted", image: "/lovable-uploads/c84eee0a-97c7-4938-9b9c-c991c802593e.png" },
    { badgeKey: 'badgeDolphin', threshold: "2m+ $DHB", fee: "4.48%", color: "bg-muted", image: "/lovable-uploads/4558c158-75d9-40fc-adfa-41125344a48e.png" },
    { badgeKey: 'badgeTigerShark', threshold: "3m+ $DHB", fee: "3.79%", color: "bg-muted", image: "/lovable-uploads/6be493f1-51b4-481b-9ca1-340c030b2ef8.png" },
    { badgeKey: 'badgeKillerWhale', threshold: "5m+ $DHB", fee: "3.10%", color: "bg-muted", image: "/lovable-uploads/fcc288eb-67d7-49a0-b561-94bb5d1b8896.png" },
    { badgeKey: 'badgeGreatWhiteShark', threshold: "10m+ $DHB", fee: "2.41%", color: "bg-muted", image: "/lovable-uploads/dfcc3420-f654-486b-bc94-f84f0209ba5c.png" },
    { badgeKey: 'badgeBlueWhale', threshold: "25m+ $DHB", fee: "1.72%", color: "bg-muted", image: "/lovable-uploads/bc6b4bb7-aa43-4015-adb0-194568cc0858.png" },
    { badgeKey: 'badgeMegalodon', threshold: "50m+ $DHB", fee: "1.00%", color: "bg-muted", image: "/lovable-uploads/9282e1c6-fa68-4b7c-b3cd-22d860df35af.png" },
  ];

  return <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-foreground font-exo">{t('dapp.title')}</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-exo"></p>
      </div>
      
      <div className="my-6">
        <img src="/lovable-uploads/docs-hero-videos.png" alt="The DeHub video feed, with the format tabs, creator leaderboard and trending topics" width={1440} height={940} className="w-full h-auto rounded-lg border border-border shadow-sm" />
      </div>
      
      {/* On-this-page quick nav */}
      <nav aria-label={t('dapp.tocTitle')} className="sticky top-16 z-10 -mx-2 px-2 py-3 bg-background/85 backdrop-blur-md border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 font-exo">{t('dapp.tocTitle')}</p>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {tocItems.map(item => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={e => {
                e.preventDefault();
                // Route through the router so the sidebar's active state stays in
                // sync, then scroll (the hash may already match on a re-click).
                chipScroll.current = true;
                navigate(`#${item.id}`, { replace: true });
                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-exo border transition-colors ${
                hash === `#${item.id}`
                  ? 'bg-foreground/10 text-foreground border-foreground/20 font-medium'
                  : 'bg-muted text-muted-foreground border-border hover:bg-foreground/5 hover:text-foreground'
              }`}
            >
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="space-y-8">
        <section id="getting-started" className="scroll-mt-44">
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.intro1')}</p>
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.intro2')}</p>
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.intro3')}</p>
          
          <div className="my-6">
            <img src="/lovable-uploads/docs-connect-wallet.png" alt="Signing in to DeHub with email, SMS, Google, X or Discord, or by connecting a wallet" width={1440} height={940} loading="lazy" decoding="async" className="w-full h-auto rounded-lg border border-border shadow-sm" />
            <p className="text-center text-sm text-muted-foreground mt-3 italic font-exo">{t('dapp.walletCaption')}</p>
          </div>
          
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.intro4')}</p>
        </section>

        <section id="feeds" className="scroll-mt-44">
          <h2 className="text-2xl font-semibold text-foreground mb-4 font-exo">{t('dapp.feedsTitle')}</h2>
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.feedsDesc')}</p>
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.feedsDesc2')}</p>
          <Shot src="/lovable-uploads/docs-feed-home.png" alt="The DeHub home feed, with format tabs across the top and full post controls on every card." />
          <h3 className="text-xl font-semibold text-foreground mb-3 font-exo">{t('dapp.keyFeatures')}</h3>
          <ul className="list-disc list-inside text-foreground/80 space-y-2 mb-4 font-exo">
            <li><strong>{t('dapp.feedsHome')}</strong> {t('dapp.feedsHomeDesc')}</li>
            <li><strong>{t('dapp.feedsShorts')}</strong> {t('dapp.feedsShortsDesc')}</li>
            <li><strong>{t('dapp.feedsStories')}</strong> {t('dapp.feedsStoriesDesc')}</li>
            <li><strong>{t('dapp.feedsPolls')}</strong> {t('dapp.feedsPollsDesc')}</li>
            <li><strong>{t('dapp.feedsTabs')}</strong> {t('dapp.feedsTabsDesc')}</li>
            <li><strong>{t('dapp.feedsBookmarks')}</strong> {t('dapp.feedsBookmarksDesc')}</li>
          </ul>
        </section>

        <section id="uploading" className="scroll-mt-44">
          <h2 className="text-2xl font-semibold text-foreground mb-4 font-exo">{t('dapp.uploadTitle')}</h2>
          
          <div className="my-6">
            <img src="/lovable-uploads/docs-upload.png" alt="The post composer, with title, category, community and subscriber-only options" width={1440} height={940} loading="lazy" decoding="async" className="w-full h-auto rounded-lg border border-border shadow-sm" />
          </div>
          
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.uploadDesc')}</p>
          
          <ul className="list-disc pl-6 space-y-2 text-foreground/80 font-exo">
            <li><strong>{t('dapp.labelWatch2earn')}</strong> {t('dapp.uploadWatch2earn')}</li>
            <li><strong>{t('dapp.labelTokenGated')}</strong> {t('dapp.uploadTokenGated')}</li>
            <li><strong>{t('dapp.labelPPV')}</strong> {t('dapp.uploadPPV')}</li>
            <li><strong>{t('dapp.labelNFT')}</strong> {t('dapp.uploadNFT')}</li>
            <li><strong>{t('dapp.labelEarn')}</strong> {t('dapp.uploadEarn')}</li>
            <li><strong>{t('dapp.labelSubscribers')}</strong> {t('dapp.uploadSubscribers')}</li>
          </ul>
        </section>

        <section id="tokenised-uploads" className="scroll-mt-44">
          <h2 className="text-3xl font-bold text-foreground mb-6 font-exo flex items-center gap-3">
            <Layers className="w-8 h-8" />
            {t('dapp.tokenisedTitle')}
          </h2>
          
          <div className="docs-glass p-6 rounded-lg mb-6">
            <h3 className="text-xl font-semibold text-foreground mb-3 font-exo">{t('dapp.tokenisedSubtitle')}</h3>
            <p className="text-foreground/80 leading-relaxed font-exo">{t('dapp.tokenisedDesc')}</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
            <Card className="docs-glass">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-foreground font-exo flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  {t('dapp.autoFractionalisation')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2 font-exo">
                  <li>• {t('dapp.autoFrac1')}</li>
                  <li>• {t('dapp.autoFrac2')}</li>
                  <li>• {t('dapp.autoFrac3')}</li>
                  <li>• {t('dapp.autoFrac4')}</li>
                  <li>• {t('dapp.autoFrac5')}</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="docs-glass">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-foreground font-exo flex items-center gap-2">
                  <Coins className="w-4 h-4" />
                  {t('dapp.creatorControl')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2 font-exo">
                  <li>• {t('dapp.creatorControl1')}</li>
                  <li>• {t('dapp.creatorControl2')}</li>
                  <li>• {t('dapp.creatorControl3')}</li>
                  <li>• {t('dapp.creatorControl4')}</li>
                  <li>• {t('dapp.creatorControl5')}</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="docs-glass">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-foreground font-exo flex items-center gap-2">
                  <Infinity className="w-4 h-4" />
                  {t('dapp.eternalRevenue')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2 font-exo">
                  <li>• {t('dapp.eternalRev1')}</li>
                  <li>• {t('dapp.eternalRev2')}</li>
                  <li>• {t('dapp.eternalRev3')}</li>
                  <li>• {t('dapp.eternalRev4')}</li>
                  <li>• {t('dapp.eternalRev5')}</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <h3 className="text-2xl font-semibold text-foreground mb-4 font-exo">{t('dapp.fanInvestmentTitle')}</h3>
            
            <div className="docs-glass p-6 rounded-lg mb-6">
              <h4 className="text-xl font-semibold text-foreground mb-3 font-exo">{t('dapp.bettingTitle')}</h4>
              <p className="text-foreground/80 leading-relaxed font-exo">{t('dapp.bettingDesc')}</p>
            </div>
            
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-foreground font-exo">
                    <Settings className="w-5 h-5" />
                    {t('dapp.howFracWorks')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-3 bg-muted rounded-lg">
                      <h4 className="font-semibold text-foreground font-exo mb-2">{t('dapp.fracStep1Title')}</h4>
                      <p className="text-sm text-muted-foreground font-exo">{t('dapp.fracStep1Desc')}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <h4 className="font-semibold text-foreground font-exo mb-2">{t('dapp.fracStep2Title')}</h4>
                      <p className="text-sm text-muted-foreground font-exo">{t('dapp.fracStep2Desc')}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <h4 className="font-semibold text-foreground font-exo mb-2">{t('dapp.fracStep3Title')}</h4>
                      <p className="text-sm text-muted-foreground font-exo">{t('dapp.fracStep3Desc')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-foreground font-exo">
                    <Users className="w-5 h-5" />
                    {t('dapp.benefitsTitle')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-3 bg-muted rounded-lg">
                      <h4 className="font-semibold text-foreground font-exo mb-2">{t('dapp.forCreators')}</h4>
                      <p className="text-sm text-muted-foreground font-exo">{t('dapp.forCreatorsDesc')}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <h4 className="font-semibold text-foreground font-exo mb-2">{t('dapp.forFans')}</h4>
                      <p className="text-sm text-muted-foreground font-exo">{t('dapp.forFansDesc')}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <h4 className="font-semibold text-foreground font-exo mb-2">{t('dapp.forEveryone')}</h4>
                      <p className="text-sm text-muted-foreground font-exo">{t('dapp.forEveryoneDesc')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="mt-8">
            <h3 className="text-2xl font-semibold text-foreground mb-4 font-exo">{t('dapp.comparisonTitle')}</h3>
            
            <div className="docs-glass p-6 rounded-lg mb-6">
              <h4 className="text-xl font-semibold text-foreground mb-3 font-exo">{t('dapp.comparisonSubtitle')}</h4>
              <p className="text-foreground/80 leading-relaxed font-exo">{t('dapp.comparisonDesc')}</p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-border bg-card rounded-lg">
                <thead>
                  <tr className="bg-muted">
                    <th className="border border-border p-3 text-left font-semibold text-foreground font-exo">{t('dapp.thPlatform')}</th>
                    <th className="border border-border p-3 text-left font-semibold text-foreground font-exo">{t('dapp.thContentModel')}</th>
                    <th className="border border-border p-3 text-left font-semibold text-foreground font-exo">{t('dapp.thValueCreation')}</th>
                    <th className="border border-border p-3 text-left font-semibold text-foreground font-exo">{t('dapp.thRevenueModel')}</th>
                    <th className="border border-border p-3 text-left font-semibold text-foreground font-exo">{t('dapp.thOwnership')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-border p-3 font-semibold text-foreground font-exo">DeHub</td>
                    <td className="border border-border p-3 text-muted-foreground font-exo">{t('dapp.dehubModel')}</td>
                    <td className="border border-border p-3 text-foreground font-exo font-semibold">{t('dapp.dehubValue')}</td>
                    <td className="border border-border p-3 text-muted-foreground font-exo">{t('dapp.dehubRevenue')}</td>
                    <td className="border border-border p-3 text-muted-foreground font-exo">{t('dapp.dehubOwnership')}</td>
                  </tr>
                  <tr>
                    <td className="border border-border p-3 font-semibold text-muted-foreground font-exo">Friend.tech</td>
                    <td className="border border-border p-3 text-muted-foreground font-exo">{t('dapp.friendTechModel')}</td>
                    <td className="border border-border p-3 text-foreground font-exo font-semibold">{t('dapp.friendTechValue')}</td>
                    <td className="border border-border p-3 text-muted-foreground font-exo">{t('dapp.friendTechRevenue')}</td>
                    <td className="border border-border p-3 text-muted-foreground font-exo">{t('dapp.friendTechOwnership')}</td>
                  </tr>
                  <tr>
                    <td className="border border-border p-3 font-semibold text-muted-foreground font-exo">Lens Protocol</td>
                    <td className="border border-border p-3 text-muted-foreground font-exo">{t('dapp.lensModel')}</td>
                    <td className="border border-border p-3 text-foreground font-exo font-semibold">{t('dapp.lensValue')}</td>
                    <td className="border border-border p-3 text-muted-foreground font-exo">{t('dapp.lensRevenue')}</td>
                    <td className="border border-border p-3 text-muted-foreground font-exo">{t('dapp.lensOwnership')}</td>
                  </tr>
                  <tr>
                    <td className="border border-border p-3 font-semibold text-muted-foreground font-exo">Zora</td>
                    <td className="border border-border p-3 text-muted-foreground font-exo">{t('dapp.zoraModel')}</td>
                    <td className="border border-border p-3 text-foreground font-exo font-semibold">{t('dapp.zoraValue')}</td>
                    <td className="border border-border p-3 text-muted-foreground font-exo">{t('dapp.zoraRevenue')}</td>
                    <td className="border border-border p-3 text-muted-foreground font-exo">{t('dapp.zoraOwnership')}</td>
                  </tr>
                  <tr>
                    <td className="border border-border p-3 font-semibold text-muted-foreground font-exo">Patreon</td>
                    <td className="border border-border p-3 text-muted-foreground font-exo">{t('dapp.patreonModel')}</td>
                    <td className="border border-border p-3 text-foreground font-exo font-semibold">{t('dapp.patreonValue')}</td>
                    <td className="border border-border p-3 text-muted-foreground font-exo">{t('dapp.patreonRevenue')}</td>
                    <td className="border border-border p-3 text-muted-foreground font-exo">{t('dapp.patreonOwnership')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <Card className="docs-glass">
              <CardHeader>
                <CardTitle className="text-foreground font-exo">{t('dapp.uniqueAdvantages')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2 font-exo">
                   <li>• <strong>{t('dapp.labelSetAndForget')}</strong> {t('dapp.adv1')}</li>
                   <li>• <strong>{t('dapp.labelFanInvestment')}</strong> {t('dapp.adv2')}</li>
                   <li>• <strong>{t('dapp.labelAutoTokenisation')}</strong> {t('dapp.adv3')}</li>
                   <li>• <strong>{t('dapp.labelCensorshipResistance')}</strong> {t('dapp.adv4')}</li>
                   <li>• <strong>{t('dapp.labelCreatorControl')}</strong> {t('dapp.adv5')}</li>
                  <li>• <strong>{t('dapp.labelPermissionless')}</strong> {t('dapp.adv6')}</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="docs-glass">
              <CardHeader>
                <CardTitle className="text-foreground font-exo">{t('dapp.revolutionaryUseCases')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2 font-exo">
                   <li>• <strong>{t('dapp.labelEarlyTalent')}</strong> {t('dapp.useCase1')}</li>
                   <li>• <strong>{t('dapp.labelPortfolio')}</strong> {t('dapp.useCase2')}</li>
                   <li>• <strong>{t('dapp.labelCreatorFunding')}</strong> {t('dapp.useCase3')}</li>
                   <li>• <strong>{t('dapp.labelFanLoyalty')}</strong> {t('dapp.useCase4')}</li>
                   <li>• <strong>{t('dapp.labelViralBetting')}</strong> {t('dapp.useCase5')}</li>
                   <li>• <strong>{t('dapp.labelPassiveIncome')}</strong> {t('dapp.useCase6')}</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="docs-glass p-6 rounded-lg mt-8">
            <h4 className="font-semibold text-foreground font-exo mb-3 flex items-center gap-2">
              <Infinity className="w-5 h-5" />
              {t('dapp.futureTitle')}
            </h4>
            <p className="text-foreground/80 leading-relaxed font-exo">{t('dapp.futureDesc')}</p>
          </div>
        </section>

        <section id="profile" className="scroll-mt-44">
          <h2 className="text-2xl font-semibold text-foreground mb-4 font-exo">{t('dapp.profileTitle')}</h2>
          <p className="text-foreground/80 leading-relaxed mb-6 font-exo">{t('dapp.profileDesc')}</p>
          
          <div className="my-6">
            <img src="/lovable-uploads/docs-profile.png" alt="A DeHub profile page" width={1440} height={940} loading="lazy" decoding="async" className="w-full h-auto rounded-lg border border-border shadow-sm" />
          </div>
        </section>

        <section id="top-up" className="scroll-mt-44">
          <h2 className="text-2xl font-semibold text-foreground mb-4 font-exo">{t('dapp.topUpTitle')}</h2>
          <Shot src="/lovable-uploads/docs-buy.png" alt="Buying DHB directly inside the app." />
          <p className="text-foreground/80 leading-relaxed mb-6 font-exo">{t('dapp.topUpDesc')}</p>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-xl text-foreground flex items-center gap-2">
                {t('dapp.directTitle')}
                <CreditCard className="w-5 h-5" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <a href="https://dehub.io/dpay" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 bg-muted rounded-lg border hover:bg-muted/80 transition-colors cursor-pointer">
                  <div>
                    <h4 className="font-semibold text-foreground font-exo">dehub.io/dpay</h4>
                    <p className="text-muted-foreground font-exo">{t('dapp.dpayDesc')}</p>
                  </div>
                  <ExternalLink className="w-5 h-5 text-muted-foreground" />
                </a>

                <div className="grid md:grid-cols-3 gap-4">
                  <div className="p-4 docs-glass rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="w-5 h-5 text-foreground" />
                      <h4 className="font-semibold text-foreground font-exo">{t('dapp.dehubTokenTitle')}</h4>
                    </div>
                    <p className="text-muted-foreground text-sm font-exo">{t('dapp.dehubTokenDesc')}</p>
                  </div>

                  <div className="p-4 docs-glass rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <CreditCard className="w-5 h-5 text-foreground" />
                      <h4 className="font-semibold text-foreground font-exo">{t('dapp.instantPayments')}</h4>
                    </div>
                    <p className="text-muted-foreground text-sm font-exo">{t('dapp.instantPaymentsDesc')}</p>
                  </div>

                  <div className="p-4 docs-glass rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="w-5 h-5 text-foreground" />
                      <h4 className="font-semibold text-foreground font-exo">{t('dapp.secureGateway')}</h4>
                    </div>
                    <p className="text-muted-foreground text-sm font-exo">{t('dapp.secureGatewayDesc')}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="docs-glass p-6 mt-6 rounded-r-lg">
            <h4 className="font-semibold text-foreground font-exo mb-3 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              {t('dapp.importantNotice')}
            </h4>
            <p className="text-muted-foreground leading-relaxed font-exo">{t('dapp.tokenDisclaimer')}</p>
          </div>
        </section>

        <section id="explore" className="scroll-mt-44">
          <h2 className="text-2xl font-semibold text-foreground mb-4 font-exo">{t('dapp.exploreTitle')}</h2>
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.exploreDesc')}</p>
          
          <ul className="list-disc pl-6 space-y-1 text-foreground/80 mb-4 font-exo">
            <li>{t('dapp.leaderMV')}</li>
            <li>{t('dapp.leaderMS')}</li>
            <li>{t('dapp.leaderBE')}</li>
            <li>{t('dapp.leaderBS')}</li>
          </ul>
          
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.exploreFormula')}</p>
          
          <div className="bg-muted p-4 rounded-lg mb-4 border border-border">
            <code className="text-foreground font-exo">MV + MS + BE + BS = (RG / RS)</code>
          </div>
          
          <p className="text-foreground/80 leading-relaxed font-exo">{t('dapp.exploreAlgorithm')}</p>
        </section>

        <div className="my-6">
          <img src="/lovable-uploads/docs-explore.png" alt="The Explore page, searching people, posts and media across DeHub" width={1440} height={940} loading="lazy" decoding="async" className="w-full h-auto rounded-lg border border-border shadow-sm" />
        </div>

        <section id="badges" className="scroll-mt-44">
          <h2 className="text-2xl font-semibold text-foreground mb-4 font-exo">{t('dapp.badgeTitle')}</h2>
          <h3 className="text-xl font-medium text-foreground mb-3 font-exo">{t('dapp.badgeSubtitle')}</h3>
          <p className="text-foreground/80 leading-relaxed mb-6 font-exo">{t('dapp.badgeDesc')}</p>
          
          <BadgeFlowchart />
        </section>

        <section id="tipping" className="scroll-mt-44">
          <h2 className="text-2xl font-semibold text-foreground mb-4 font-exo">{t('dapp.tipTitle')}</h2>
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.tipDesc1')}</p>
          <p className="text-foreground/80 leading-relaxed mb-6 font-exo">{t('dapp.tipDesc2')}</p>
          
          <TippingFlowchart />
        </section>

        <section id="governance" className="scroll-mt-44">
          <h2 className="text-2xl font-semibold text-foreground mb-4 font-exo">{t('dapp.mineTitle')}</h2>
          <h3 className="text-xl font-medium text-foreground mb-3 font-exo">{t('dapp.mineSubtitle')}</h3>
          
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.mineDesc1')}</p>
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.mineDesc2')}</p>
          <p className="italic text-muted-foreground font-exo text-base text-left py-0 my-[30px]">{t('dapp.mineDynamic')}</p>

          <div className="docs-glass p-6 rounded-lg mb-6">
            <h3 className="text-xl font-semibold text-foreground mb-3 font-exo">{t('dapp.govTitle')}</h3>
            <p className="text-foreground/80 leading-relaxed font-exo">{t('dapp.govDesc')}</p>
          </div>

          <div className="space-y-8">
            <div>
              <h4 className="text-lg font-semibold text-foreground mb-4 font-exo">{t('dapp.tokenUtilityDesign')}</h4>
              <p className="text-foreground/80 leading-relaxed mb-3 font-exo">{t('dapp.tokenUtilityDesc')}</p>
              <ul className="list-disc pl-6 space-y-1 text-foreground/80 font-exo mb-4">
                <li>{t('dapp.tokenUtilityRole1')}</li>
                <li>{t('dapp.tokenUtilityRole2')}</li>
                <li>{t('dapp.tokenUtilityRole3')}</li>
              </ul>
              <div className="docs-glass p-4 mb-4">
                 <p className="text-foreground font-medium font-exo">
                   <strong>{t('dapp.labelKeyPrinciple')}</strong> {t('dapp.keyPrinciple')}
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-lg font-semibold text-foreground mb-4 font-exo">{t('dapp.quadraticVoting')}</h4>
              <p className="text-foreground/80 leading-relaxed mb-3 font-exo">{t('dapp.quadraticDesc')}</p>
              <ul className="list-disc pl-6 space-y-1 text-foreground/80 font-exo mb-4">
                <li>{t('dapp.quadratic1')}</li>
                <li>{t('dapp.quadratic2')}</li>
                <li>{t('dapp.quadratic3')}</li>
              </ul>
            </div>

            <div>
              <h4 className="text-lg font-semibold text-foreground mb-4 font-exo">{t('dapp.modStakingPools')}</h4>
              <ul className="list-disc pl-6 space-y-1 text-foreground/80 font-exo mb-4">
                <li>{t('dapp.modStaking1')}</li>
                <li>{t('dapp.modStaking2')}</li>
                <li>{t('dapp.modStaking3')}</li>
                <li>{t('dapp.modStaking4')}</li>
              </ul>
              <div className="docs-glass p-4 mb-4">
                 <p className="text-foreground font-medium font-exo">
                   <strong>{t('dapp.labelIncentive')}</strong> {t('dapp.modStakingIncentive')}
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-lg font-semibold text-foreground mb-4 font-exo">{t('dapp.delegatedMod')}</h4>
              <ul className="list-disc pl-6 space-y-1 text-foreground/80 font-exo mb-4">
                <li>{t('dapp.delegated1')}</li>
                <li>{t('dapp.delegated2')}</li>
                <li>{t('dapp.delegated3')}</li>
              </ul>
            </div>

            <div>
              <h4 className="text-lg font-semibold text-foreground mb-4 font-exo">{t('dapp.contentTiering')}</h4>
              <ul className="list-disc pl-6 space-y-1 text-foreground/80 font-exo mb-4">
                <li>{t('dapp.curation1')}</li>
                <li>{t('dapp.curation2')}</li>
                <li>{t('dapp.curation3')}</li>
              </ul>
            </div>

            <div>
              <h4 className="text-lg font-semibold text-foreground mb-4 font-exo">{t('dapp.daoAppeals')}</h4>
              <ul className="list-disc pl-6 space-y-1 text-foreground/80 font-exo mb-4">
                <li>{t('dapp.dao1')}</li>
                <li>{t('dapp.dao2')}</li>
                <li>{t('dapp.dao3')}</li>
              </ul>
            </div>

            <div>
              <h4 className="text-lg font-semibold text-foreground mb-4 font-exo">{t('dapp.progressiveAccess')}</h4>
              <p className="text-foreground/80 leading-relaxed mb-3 font-exo">{t('dapp.progressiveDesc')}</p>
              <ul className="list-disc pl-6 space-y-1 text-foreground/80 font-exo mb-4">
                <li>{t('dapp.progressive1')}</li>
                <li>{t('dapp.progressive2')}</li>
                <li>{t('dapp.progressive3')}</li>
              </ul>
            </div>

            <div>
              <h4 className="text-lg font-semibold text-foreground mb-4 font-exo">{t('dapp.incentiveFlywheel')}</h4>
              <ul className="list-disc pl-6 space-y-1 text-foreground/80 font-exo mb-4">
                <li>{t('dapp.flywheel1')}</li>
                <li>{t('dapp.flywheel2')}</li>
                <li>{t('dapp.flywheel3')}</li>
                <li>{t('dapp.flywheel4')}</li>
              </ul>
              <div className="docs-glass p-4 mb-6">
                <p className="text-foreground font-medium font-exo">{t('dapp.flywheelSummary')}</p>
              </div>
            </div>

            <div>
              <h4 className="text-lg font-semibold text-foreground mb-4 font-exo flex items-center gap-2">
                <Shield className="w-5 h-5" />
                🔐 {t('dapp.antiManipulation')}
              </h4>
              <ul className="list-disc pl-6 space-y-1 text-foreground/80 font-exo mb-6">
                <li>{t('dapp.anti1')}</li>
                <li>{t('dapp.anti2')}</li>
                <li>{t('dapp.anti3')}</li>
              </ul>
            </div>
          </div>

          <div className="mt-8">
            <h3 className="text-2xl font-semibold text-foreground mb-4 font-exo">{t('dapp.architecture')}</h3>
            <div className="my-6">
              <img src="/lovable-uploads/a083bba0-a7c6-4c03-9a01-2402717f9f20.png" alt="Decentralized Streaming App Architecture" className="w-full rounded-lg border border-border shadow-sm" />
            </div>
          </div>
        </section>

        <section id="live-streaming" className="scroll-mt-44">
          <h2 className="text-3xl font-bold text-foreground mb-6 font-exo flex items-center gap-3">
            <Video className="w-8 h-8" />
            {t('dapp.liveStreamingTitle')}
          </h2>
          
          <div className="docs-glass p-6 rounded-lg mb-6">
            <h3 className="text-xl font-semibold text-foreground mb-3 font-exo">{t('dapp.liveStreamOverview')}</h3>
            <p className="text-foreground/80 leading-relaxed font-exo">{t('dapp.liveStreamDesc')}</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 mb-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground font-exo">
                  <Zap className="w-5 h-5" />
                  {t('dapp.keyFeatures')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-foreground/80 font-exo">
                  <li>• {t('dapp.keyFeat1')}</li>
                  <li>• {t('dapp.keyFeat2')}</li>
                  <li>• {t('dapp.keyFeat3')}</li>
                  <li>• {t('dapp.keyFeat4')}</li>
                  <li>• {t('dapp.keyFeat5')}</li>
                  <li>• {t('dapp.keyFeat6')}</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground font-exo">
                  <Coins className="w-5 h-5" />
                  {t('dapp.supportedTokens')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {['DHB', 'FLOKI', 'USDC', 'USDT', 'BNB', 'ETH', 'PEPE', 'DOGE'].map(token => <span key={token} className="px-3 py-1 bg-muted text-foreground rounded-full text-sm font-medium font-exo">
                      {token}
                    </span>)}
                </div>
                <p className="text-sm text-muted-foreground mt-3 font-exo">{t('dapp.supportedTokensDesc')}</p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <h3 className="text-2xl font-semibold text-foreground mb-4 font-exo">{t('dapp.livestreamFeatures')}</h3>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="docs-glass">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg text-foreground font-exo flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    {t('dapp.streamCreation')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm text-muted-foreground space-y-1 font-exo">
                    <li>• {t('dapp.streamCreation1')}</li>
                    <li>• {t('dapp.streamCreation2')}</li>
                    <li>• {t('dapp.streamCreation3')}</li>
                    <li>• {t('dapp.streamCreation4')}</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="docs-glass">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg text-foreground font-exo flex items-center gap-2">
                    <Coins className="w-4 h-4" />
                    {t('dapp.tippingSystem')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm text-muted-foreground space-y-1 font-exo">
                    <li>• {t('dapp.tipping1')}</li>
                    <li>• {t('dapp.tipping2')}</li>
                    <li>• {t('dapp.tipping3')}</li>
                    <li>• {t('dapp.tipping4')}</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="docs-glass">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg text-foreground font-exo flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    {t('dapp.tokenGating')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm text-muted-foreground space-y-1 font-exo">
                    <li>• {t('dapp.gating1')}</li>
                    <li>• {t('dapp.gating2')}</li>
                    <li>• {t('dapp.gating3')}</li>
                    <li>• {t('dapp.gating4')}</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="docs-glass">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg text-foreground font-exo flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    {t('dapp.ppvBounties')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm text-muted-foreground space-y-1 font-exo">
                    <li>• {t('dapp.ppv1')}</li>
                    <li>• {t('dapp.ppv2')}</li>
                    <li>• {t('dapp.ppv3')}</li>
                    <li>• {t('dapp.ppv4')}</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground font-exo">
                  <Settings className="w-5 h-5" />
                  {t('dapp.streamingMethods')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-3 bg-muted rounded-lg">
                    <h4 className="font-semibold text-foreground font-exo">{t('dapp.webStreaming')}</h4>
                    <p className="text-sm text-muted-foreground font-exo">{t('dapp.webStreamingDesc')}</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <h4 className="font-semibold text-foreground font-exo">{t('dapp.externalStreaming')}</h4>
                    <p className="text-sm text-muted-foreground font-exo">{t('dapp.externalStreamingDesc')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground font-exo">
                  <Eye className="w-5 h-5" />
                  {t('dapp.analyticsMetrics')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-foreground/80 font-exo">{t('dapp.liveViewers')}</span>
                    <span className="text-sm bg-muted text-foreground px-2 py-1 rounded font-exo">{t('dapp.realtime')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-foreground/80 font-exo">{t('dapp.tipsReceived')}</span>
                    <span className="text-sm bg-muted text-foreground px-2 py-1 rounded font-exo">{t('dapp.multiToken')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-foreground/80 font-exo">{t('dapp.streamLikes')}</span>
                    <span className="text-sm bg-muted text-foreground px-2 py-1 rounded font-exo">{t('dapp.engagement')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-foreground/80 font-exo">{t('dapp.chatActivity')}</span>
                    <span className="text-sm bg-muted text-foreground px-2 py-1 rounded font-exo">{t('dapp.interactive')}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6 docs-glass">
            <CardHeader>
              <CardTitle className="text-foreground font-exo">{t('dapp.techInfrastructure')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-3 bg-card/50 rounded-lg">
                  <h4 className="font-semibold text-foreground font-exo">{t('dapp.backendLabel')}</h4>
                  <p className="text-sm text-foreground/80 font-exo">{t('dapp.backendDesc')}</p>
                </div>
                <div className="p-3 bg-card/50 rounded-lg">
                  <h4 className="font-semibold text-foreground font-exo">{t('dapp.frontendLabel')}</h4>
                  <p className="text-sm text-foreground/80 font-exo">{t('dapp.frontendDesc')}</p>
                </div>
                <div className="p-3 bg-card/50 rounded-lg">
                  <h4 className="font-semibold text-foreground font-exo">{t('dapp.streamingLabel')}</h4>
                  <p className="text-sm text-foreground/80 font-exo">{t('dapp.streamingLabelDesc')}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <section id="subscriptions" className="mt-12 scroll-mt-44">
            <h2 className="text-3xl font-bold text-foreground mb-6 font-exo flex items-center gap-3">
              <Crown className="w-8 h-8" />
              {t('dapp.subscriptionsTitle')}
            </h2>
            
            <div className="docs-glass p-6 rounded-lg mb-6">
              <h3 className="text-xl font-semibold text-foreground mb-3 font-exo">{t('dapp.subsOverview')}</h3>
              <p className="text-foreground/80 leading-relaxed font-exo">{t('dapp.subsDesc')}</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
              <Card className="docs-glass">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg text-foreground font-exo flex items-center gap-2">
                    <Crown className="w-4 h-4" />
                    {t('dapp.subsCreatorControl')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm text-muted-foreground space-y-2 font-exo">
                    <li>• {t('dapp.subsCc1')}</li>
                    <li>• {t('dapp.subsCc2')}</li>
                    <li>• {t('dapp.subsCc3')}</li>
                    <li>• {t('dapp.subsCc4')}</li>
                    <li>• {t('dapp.subsCc5')}</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="docs-glass">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg text-foreground font-exo flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    {t('dapp.nftIntegration')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm text-muted-foreground space-y-2 font-exo">
                    <li>• {t('dapp.nft1')}</li>
                    <li>• {t('dapp.nft2')}</li>
                    <li>• {t('dapp.nft3')}</li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <div className="mt-8">
              <h3 className="text-2xl font-semibold text-foreground mb-4 font-exo">{t('dapp.communityFeatures')}</h3>
              
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card className="docs-glass">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-foreground font-exo flex items-center gap-2">
                      <MessageCircle className="w-4 h-4" />
                      {t('dapp.tierBasedChats')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground font-exo">{t('dapp.tierChatsDesc')}</p>
                  </CardContent>
                </Card>

                <Card className="docs-glass">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-foreground font-exo flex items-center gap-2">
                      <Crown className="w-4 h-4" />
                      {t('dapp.premiumPerks')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground font-exo">{t('dapp.premiumPerksDesc')}</p>
                  </CardContent>
                </Card>

                <Card className="docs-glass">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-foreground font-exo flex items-center gap-2">
                      <Eye className="w-4 h-4" />
                      {t('dapp.subscriberAnalytics')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground font-exo">{t('dapp.subscriberAnalyticsDesc')}</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <Card className="mt-6 docs-glass">
              <CardHeader>
                <CardTitle className="text-foreground font-exo">{t('dapp.subscriptionBenefits')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="font-semibold text-foreground font-exo mb-2">{t('dapp.forCreators')}</h4>
                    <ul className="text-sm text-foreground/80 space-y-1 font-exo">
                      <li>• {t('dapp.forCreatorsSubs1')}</li>
                      <li>• {t('dapp.forCreatorsSubs2')}</li>
                      <li>• {t('dapp.forCreatorsSubs3')}</li>
                      <li>• {t('dapp.forCreatorsSubs4')}</li>
                      <li>• {t('dapp.forCreatorsSubs5')}</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground font-exo mb-2">{t('dapp.forSubscribers')}</h4>
                    <ul className="text-sm text-foreground/80 space-y-1 font-exo">
                      <li>• {t('dapp.forSubs1')}</li>
                      <li>• {t('dapp.forSubs2')}</li>
                      <li>• {t('dapp.forSubs3')}</li>
                      <li>• {t('dapp.forSubs4')}</li>
                      <li>• {t('dapp.forSubs5')}</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section id="messages" className="mt-12 scroll-mt-44">
            <h2 className="text-3xl font-bold text-foreground mb-6 font-exo flex items-center gap-3">
              <MessageCircle className="w-8 h-8" />
              {t('dapp.messagesTitle')}
            </h2>
            
            <div className="docs-glass p-6 rounded-lg mb-6">
              <h3 className="text-xl font-semibold text-foreground mb-3 font-exo">{t('dapp.messagesOverview')}</h3>
              <p className="text-foreground/80 leading-relaxed font-exo">{t('dapp.messagesDesc')}</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
              <Card className="docs-glass">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg text-foreground font-exo flex items-center gap-2">
                    <MessageCircle className="w-4 h-4" />
                    {t('dapp.directGroupMessaging')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm text-muted-foreground space-y-2 font-exo">
                    <li>• {t('dapp.msg1')}</li>
                    <li>• {t('dapp.msg2')}</li>
                    <li>• {t('dapp.msg3')}</li>
                    <li>• {t('dapp.msg4')}</li>
                    <li>• {t('dapp.msg5')}</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="docs-glass">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg text-foreground font-exo flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    {t('dapp.privacyControls')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm text-muted-foreground space-y-2 font-exo">
                    <li>• {t('dapp.priv1')}</li>
                    <li>• {t('dapp.priv2')}</li>
                    <li>• {t('dapp.priv3')}</li>
                    <li>• {t('dapp.priv4')}</li>
                    <li>• {t('dapp.priv5')}</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="docs-glass">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg text-foreground font-exo flex items-center gap-2">
                    <Coins className="w-4 h-4" />
                    {t('dapp.monetizedMessaging')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm text-muted-foreground space-y-2 font-exo">
                    <li>• {t('dapp.mon1')}</li>
                    <li>• {t('dapp.mon2')}</li>
                    <li>• {t('dapp.mon3')}</li>
                    <li>• {t('dapp.mon4')}</li>
                    <li>• {t('dapp.mon5')}</li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <h3 className="text-2xl font-semibold text-foreground mb-4 font-exo">{t('dapp.advancedFeatures')}</h3>
              
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground font-exo">
                      <Lock className="w-5 h-5" />
                      {t('dapp.paywallTitle')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="p-3 bg-muted rounded-lg">
                        <h4 className="font-semibold text-foreground font-exo mb-2">{t('dapp.mediaMonetization')}</h4>
                        <p className="text-sm text-muted-foreground font-exo">{t('dapp.mediaMonDesc')}</p>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <h4 className="font-semibold text-foreground font-exo mb-2">{t('dapp.flexiblePricing')}</h4>
                        <p className="text-sm text-muted-foreground font-exo">{t('dapp.flexiblePricingDesc')}</p>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <h4 className="font-semibold text-foreground font-exo mb-2">{t('dapp.previewSystem')}</h4>
                        <p className="text-sm text-muted-foreground font-exo">{t('dapp.previewSystemDesc')}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground font-exo">
                      <Shield className="w-5 h-5" />
                      {t('dapp.e2eTitle')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="p-3 bg-muted rounded-lg">
                        <h4 className="font-semibold text-foreground font-exo mb-2">{t('dapp.militaryGrade')}</h4>
                        <p className="text-sm text-muted-foreground font-exo">{t('dapp.militaryGradeDesc')}</p>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <h4 className="font-semibold text-foreground font-exo mb-2">{t('dapp.privateByDesign')}</h4>
                        <p className="text-sm text-muted-foreground font-exo">{t('dapp.privateByDesignDesc')}</p>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <h4 className="font-semibold text-foreground font-exo mb-2">{t('dapp.secureMediaSharing')}</h4>
                        <p className="text-sm text-muted-foreground font-exo">{t('dapp.secureMediaDesc')}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="mt-8">
              <h3 className="text-2xl font-semibold text-foreground mb-4 font-exo">{t('dapp.messageTypes')}</h3>
              
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="docs-glass">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-foreground font-exo">{t('dapp.standardMessages')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-sm text-muted-foreground space-y-1 font-exo">
                      <li>• {t('dapp.std1')}</li>
                      <li>• {t('dapp.std2')}</li>
                      <li>• {t('dapp.std3')}</li>
                      <li>• {t('dapp.std4')}</li>
                    </ul>
                  </CardContent>
                </Card>

                <Card className="docs-glass">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-foreground font-exo">{t('dapp.priorityMessages')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-sm text-muted-foreground space-y-1 font-exo">
                      <li>• {t('dapp.pri1')}</li>
                      <li>• {t('dapp.pri2')}</li>
                      <li>• {t('dapp.pri3')}</li>
                      <li>• {t('dapp.pri4')}</li>
                    </ul>
                  </CardContent>
                </Card>

                <Card className="docs-glass">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-foreground font-exo">{t('dapp.premiumContent')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-sm text-muted-foreground space-y-1 font-exo">
                      <li>• {t('dapp.prem1')}</li>
                      <li>• {t('dapp.prem2')}</li>
                      <li>• {t('dapp.prem3')}</li>
                      <li>• {t('dapp.prem4')}</li>
                    </ul>
                  </CardContent>
                </Card>

                <Card className="docs-glass">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-foreground font-exo">{t('dapp.groupFeatures')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-sm text-muted-foreground space-y-1 font-exo">
                      <li>• {t('dapp.grp1')}</li>
                      <li>• {t('dapp.grp2')}</li>
                      <li>• {t('dapp.grp3')}</li>
                      <li>• {t('dapp.grp4')}</li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>

            <Card className="mt-6 docs-glass">
              <CardHeader>
                <CardTitle className="text-foreground font-exo">{t('dapp.commRevolution')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="font-semibold text-foreground font-exo mb-2">{t('dapp.forCreators')}</h4>
                    <ul className="text-sm text-foreground/80 space-y-1 font-exo">
                      <li>• {t('dapp.commCreator1')}</li>
                      <li>• {t('dapp.commCreator2')}</li>
                      <li>• {t('dapp.commCreator3')}</li>
                      <li>• {t('dapp.commCreator4')}</li>
                      <li>• {t('dapp.commCreator5')}</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground font-exo mb-2">{t('dapp.commForUsers')}</h4>
                    <ul className="text-sm text-foreground/80 space-y-1 font-exo">
                      <li>• {t('dapp.commUser1')}</li>
                      <li>• {t('dapp.commUser2')}</li>
                      <li>• {t('dapp.commUser3')}</li>
                      <li>• {t('dapp.commUser4')}</li>
                      <li>• {t('dapp.commUser5')}</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section id="superpowers" className="mt-12 scroll-mt-44">
            <h2 className="text-3xl font-bold text-foreground mb-6 font-exo">{t('dapp.superPowersTitle')}</h2>
            
            <div className="space-y-6">
              <p className="text-lg text-muted-foreground leading-relaxed font-exo">{t('dapp.superPowersDesc')}</p>
              
              <div className="grid gap-6 md:grid-cols-2">
                <Card className="border-border hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <CardTitle className="text-foreground font-exo flex items-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      {t('dapp.trendJacker')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground font-exo">{t('dapp.trendJackerDesc')}</p>
                  </CardContent>
                </Card>

                <Card className="border-border hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <CardTitle className="text-foreground font-exo flex items-center gap-2">
                      <Zap className="w-5 h-5" />
                      {t('dapp.timelineBomber')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground font-exo">{t('dapp.timelineBomberDesc')}</p>
                  </CardContent>
                </Card>

                <Card className="border-border hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <CardTitle className="text-foreground font-exo flex items-center gap-2">
                      <Eye className="w-5 h-5" />
                      {t('dapp.precisionStrike')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground font-exo">{t('dapp.precisionStrikeDesc')}</p>
                  </CardContent>
                </Card>

                <Card className="border-border hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <CardTitle className="text-foreground font-exo flex items-center gap-2">
                      <Crown className="w-5 h-5" />
                      {t('dapp.harpoon')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground font-exo">{t('dapp.harpoonDesc')}</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          <section id="fees" className="mt-12 scroll-mt-44">
            <h2 className="text-3xl font-bold text-foreground mb-6 font-exo">{t('dapp.feeTierTitle')}</h2>
            
            <div className="docs-glass p-6 rounded-lg mb-6">
              <h3 className="text-xl font-semibold text-foreground mb-3 font-exo">{t('dapp.feeTierSubtitle')}</h3>
              <p className="text-foreground/80 leading-relaxed font-exo">{t('dapp.feeTierDesc')}</p>
            </div>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-foreground font-exo flex items-center gap-2">
                  <Percent className="w-5 h-5" />
                  {t('dapp.platformFeeStructure')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {feeReductions.map((tier, index) => <div key={tier.badgeKey} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                      <div className="flex items-center gap-3">
                        {tier.image ? <img src={tier.image} alt={t(`dapp.${tier.badgeKey}`)} className="w-8 h-8 object-contain dark:invert" /> : <div className="w-8 h-8 rounded-full bg-muted border border-border"></div>}
                        <div className="flex flex-col">
                          <span className="font-medium">{t(`dapp.${tier.badgeKey}`)}</span>
                          <span className="text-sm text-muted-foreground">{tier.threshold}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-bold text-foreground">{tier.fee}</span>
                        <span className="text-sm text-muted-foreground ml-1">{t('dapp.fee')}</span>
                      </div>
                    </div>)}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
              <Card className="docs-glass">
                <CardHeader>
                  <CardTitle className="text-foreground font-exo">{t('dapp.feeCalcBenefits')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm text-muted-foreground space-y-2 font-exo">
                    <li>• {t('dapp.feeCalc1')}</li>
                    <li>• {t('dapp.feeCalc2')}</li>
                    <li>• {t('dapp.feeCalc3')}</li>
                    <li>• {t('dapp.feeCalc4')}</li>
                    <li>• {t('dapp.feeCalc5')}</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="docs-glass">
                <CardHeader>
                  <CardTitle className="text-foreground font-exo">{t('dapp.affectedTransactions')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm text-muted-foreground space-y-2 font-exo">
                    <li>• {t('dapp.affected1')}</li>
                    <li>• {t('dapp.affected2')}</li>
                    <li>• {t('dapp.affected3')}</li>
                    <li>• {t('dapp.affected4')}</li>
                    <li>• {t('dapp.affected5')}</li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <div className="docs-glass p-6 rounded-lg mt-6">
              <h4 className="font-semibold text-foreground font-exo mb-3">{t('dapp.exampleSavings')}</h4>
              <div className="grid gap-4 md:grid-cols-3">
                 <div className="p-3 bg-card/50 rounded-lg">
                   <h5 className="font-medium text-foreground font-exo">$1,000 {t('dapp.exTransaction')}</h5>
                   <p className="text-sm text-muted-foreground font-exo">{t('dapp.exStandard')} $100</p>
                   <p className="text-sm text-muted-foreground font-exo">{t('dapp.exMegalodon')} $10</p>
                   <p className="text-sm font-semibold text-foreground font-exo">{t('dapp.exSaves')} $90</p>
                 </div>
                 <div className="p-3 bg-card/50 rounded-lg">
                   <h5 className="font-medium text-foreground font-exo">$10,000 {t('dapp.exTransaction')}</h5>
                   <p className="text-sm text-muted-foreground font-exo">{t('dapp.exStandard')} $1,000</p>
                   <p className="text-sm text-muted-foreground font-exo">{t('dapp.exMegalodon')} $100</p>
                   <p className="text-sm font-semibold text-foreground font-exo">{t('dapp.exSaves')} $900</p>
                 </div>
                 <div className="p-3 bg-card/50 rounded-lg">
                   <h5 className="font-medium text-foreground font-exo">$100,000 {t('dapp.exTransaction')}</h5>
                   <p className="text-sm text-muted-foreground font-exo">{t('dapp.exStandard')} $10,000</p>
                   <p className="text-sm text-muted-foreground font-exo">{t('dapp.exMegalodon')} $1,000</p>
                   <p className="text-sm font-semibold text-foreground font-exo">{t('dapp.exSaves')} $9,000</p>
                 </div>
              </div>
            </div>

            <div className="docs-glass p-6 mt-6 rounded-r-lg">
              <h4 className="font-semibold text-foreground font-exo mb-3 flex items-center gap-2">
                <Banknote className="w-5 h-5" />
                {t('dapp.feeDisclaimer')}
              </h4>
              <p className="text-muted-foreground leading-relaxed font-exo">{t('dapp.feeDisclaimerDesc')}</p>
            </div>
          </section>
        </section>

        <section id="communities" className="scroll-mt-44">
          <h2 className="text-3xl font-bold text-foreground mb-6 font-exo flex items-center gap-3">
            <Users className="w-8 h-8" />
            {t('dapp.communitiesTitle')}
          </h2>
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.communitiesDesc')}</p>
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.communitiesDesc2')}</p>
          <Shot src="/lovable-uploads/docs-communities.png" alt="The Communities page, listing public communities with their member counts." />
          <h3 className="text-xl font-semibold text-foreground mb-3 font-exo">{t('dapp.keyFeatures')}</h3>
          <ul className="list-disc list-inside text-foreground/80 space-y-2 mb-4 font-exo">
            <li><strong>{t('dapp.communitiesB1')}</strong> {t('dapp.communitiesB1Desc')}</li>
            <li><strong>{t('dapp.communitiesB2')}</strong> {t('dapp.communitiesB2Desc')}</li>
            <li><strong>{t('dapp.communitiesB3')}</strong> {t('dapp.communitiesB3Desc')}</li>
          </ul>
        </section>

        <section id="stages" className="scroll-mt-44">
          <h2 className="text-3xl font-bold text-foreground mb-6 font-exo flex items-center gap-3">
            <MessageCircle className="w-8 h-8" />
            {t('dapp.stagesTitle')}
          </h2>
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.stagesDesc')}</p>
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.stagesDesc2')}</p>
          <Shot src="/lovable-uploads/docs-stages.png" alt="The Stages page, with Live and Recorded tabs and a control to start a stage." />
          <h3 className="text-xl font-semibold text-foreground mb-3 font-exo">{t('dapp.keyFeatures')}</h3>
          <ul className="list-disc list-inside text-foreground/80 space-y-2 mb-4 font-exo">
            <li><strong>{t('dapp.stagesB1')}</strong> {t('dapp.stagesB1Desc')}</li>
            <li><strong>{t('dapp.stagesB2')}</strong> {t('dapp.stagesB2Desc')}</li>
            <li><strong>{t('dapp.stagesB3')}</strong> {t('dapp.stagesB3Desc')}</li>
            <li><strong>{t('dapp.stagesB4')}</strong> {t('dapp.stagesB4Desc')}</li>
          </ul>
        </section>

        <section id="tv-radio" className="scroll-mt-44">
          <h2 className="text-3xl font-bold text-foreground mb-6 font-exo flex items-center gap-3">
            <Video className="w-8 h-8" />
            {t('dapp.tvRadioTitle')}
          </h2>
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.tvRadioDesc')}</p>
          <ul className="list-disc list-inside text-foreground/80 space-y-2 mb-4 font-exo">
            <li><strong>{t('dapp.tvRadioB1')}</strong> {t('dapp.tvRadioB1Desc')}</li>
            <li><strong>{t('dapp.tvRadioB2')}</strong> {t('dapp.tvRadioB2Desc')}</li>
            <li><strong>{t('dapp.tvRadioB3')}</strong> {t('dapp.tvRadioB3Desc')}</li>
          </ul>
          <Shot src="/lovable-uploads/docs-tv.png" alt="DeHub TV, with continuously running live channels." />
          <Shot src="/lovable-uploads/docs-music.png" alt="The Music hub, covering tracks, videos, podcasts and radio stations." />
        </section>

        <section id="wallet" className="scroll-mt-44">
          <h2 className="text-3xl font-bold text-foreground mb-6 font-exo flex items-center gap-3">
            <Banknote className="w-8 h-8" />
            {t('dapp.walletHubTitle')}
          </h2>
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.walletHubDesc')}</p>
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.walletHubDesc2')}</p>
          <Shot src="/lovable-uploads/docs-wallet.png" alt="The built-in wallet, showing token balances and the Receive, Send, Buy, Stake, Bridge and Cash Out actions." />
          <Shot src="/lovable-uploads/docs-command-centre.png" alt="The Command Centre, the creator finance dashboard for income and transactions." />
          <h3 className="text-xl font-semibold text-foreground mb-3 font-exo">{t('dapp.keyFeatures')}</h3>
          <ul className="list-disc list-inside text-foreground/80 space-y-2 mb-4 font-exo">
            <li><strong>{t('dapp.walletHubB1')}</strong> {t('dapp.walletHubB1Desc')}</li>
            <li><strong>{t('dapp.walletHubB2')}</strong> {t('dapp.walletHubB2Desc')}</li>
            <li><strong>{t('dapp.walletHubB3')}</strong> {t('dapp.walletHubB3Desc')}</li>
            <li><strong>{t('dapp.walletHubB4')}</strong> {t('dapp.walletHubB4Desc')}</li>
          </ul>
          <p className="text-foreground/80 font-exo">
            <Link to="/docs/token/utility" className="text-primary hover:underline inline-flex items-center gap-1">
              {t('dapp.walletHubLink')} <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </p>
        </section>

        <section id="work" className="scroll-mt-44">
          <h2 className="text-3xl font-bold text-foreground mb-6 font-exo flex items-center gap-3">
            <Scale className="w-8 h-8" />
            {t('dapp.workTitle')}
          </h2>
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.workDesc')}</p>
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.workDesc2')}</p>
          <Shot src="/lovable-uploads/docs-bounties.png" alt="The Bounties board, filterable by category and currency, with Post a Bounty." />
          <h3 className="text-xl font-semibold text-foreground mb-3 font-exo">{t('dapp.keyFeatures')}</h3>
          <ul className="list-disc list-inside text-foreground/80 space-y-2 mb-4 font-exo">
            <li><strong>{t('dapp.workB1')}</strong> {t('dapp.workB1Desc')}</li>
            <li><strong>{t('dapp.workB2')}</strong> {t('dapp.workB2Desc')}</li>
            <li><strong>{t('dapp.workB3')}</strong> {t('dapp.workB3Desc')}</li>
            <li><strong>{t('dapp.workB4')}</strong> {t('dapp.workB4Desc')}</li>
            <li><strong>{t('dapp.workB5')}</strong> {t('dapp.workB5Desc')}</li>
            <li><strong>{t('dapp.workB6')}</strong> {t('dapp.workB6Desc')}</li>
          </ul>
        </section>

        <section id="stores" className="scroll-mt-44">
          <h2 className="text-2xl font-semibold text-foreground mb-4 font-exo">{t('dapp.storesTitle')}</h2>
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.storesDesc')}</p>
          <Shot src="/lovable-uploads/docs-stores.png" alt="The Stores page, where creators and businesses run a native storefront." />
          <ul className="list-disc list-inside text-foreground/80 space-y-2 mb-4 font-exo">
            <li><strong>{t('dapp.storesB1')}</strong> {t('dapp.storesB1Desc')}</li>
            <li><strong>{t('dapp.storesB2')}</strong> {t('dapp.storesB2Desc')}</li>
            <li><strong>{t('dapp.storesB3')}</strong> {t('dapp.storesB3Desc')}</li>
          </ul>
        </section>

        <section id="affiliate" className="scroll-mt-44">
          <h2 className="text-2xl font-semibold text-foreground mb-4 font-exo">{t('dapp.affiliateTitle')}</h2>
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.affiliateDesc')}</p>
          <ul className="list-disc list-inside text-foreground/80 space-y-2 mb-4 font-exo">
            <li><strong>{t('dapp.affiliateB1')}</strong> {t('dapp.affiliateB1Desc')}</li>
            <li><strong>{t('dapp.affiliateB2')}</strong> {t('dapp.affiliateB2Desc')}</li>
            <li><strong>{t('dapp.affiliateB3')}</strong> {t('dapp.affiliateB3Desc')}</li>
          </ul>
        </section>

        <section id="ai-suite" className="scroll-mt-44">
          <h2 className="text-3xl font-bold text-foreground mb-6 font-exo flex items-center gap-3">
            <Zap className="w-8 h-8" />
            {t('dapp.aiSuiteTitle')}
          </h2>
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.aiSuiteDesc')}</p>
          <ul className="list-disc list-inside text-foreground/80 space-y-2 mb-4 font-exo">
            <li><strong>{t('dapp.aiSuiteB1')}</strong> {t('dapp.aiSuiteB1Desc')}</li>
            <li><strong>{t('dapp.aiSuiteB2')}</strong> {t('dapp.aiSuiteB2Desc')}</li>
            <li><strong>{t('dapp.aiSuiteB3')}</strong> {t('dapp.aiSuiteB3Desc')}</li>
          </ul>
          <Shot src="/lovable-uploads/docs-assistant.png" alt="The AI Assistant, available to every account inside the app." />
          {/* Full AI Toolkits reference, folded in from /docs/ai-toolkits */}
          <div className="mt-8">
            <AIToolkits />
          </div>
        </section>

        <section id="encryption" className="scroll-mt-44">
          {/* Folded in from /docs/e2e-encryption */}
          <E2EEncryption />
        </section>

        <section id="depin" className="scroll-mt-44">
          {/* Folded in from /docs/depin */}
          <DePIN />
        </section>

        <section id="advertising" className="scroll-mt-44">
          <h2 className="text-2xl font-semibold text-foreground mb-4 font-exo">{t('dapp.adsPortalTitle')}</h2>
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.adsPortalDesc')}</p>
          <Shot src="/lovable-uploads/docs-ads.png" alt="The self-serve advertising portal for creating and funding campaigns." />
          <p className="text-foreground/80 font-exo">
            <Link to="/docs/advertising" className="text-primary hover:underline inline-flex items-center gap-1">
              {t('dapp.adsPortalLink')} <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </p>
        </section>

        <section id="feature-requests" className="scroll-mt-44">
          <h2 className="text-2xl font-semibold text-foreground mb-4 font-exo">{t('dapp.featureBoardTitle')}</h2>
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.featureBoardDesc')}</p>
          <Shot src="/lovable-uploads/docs-features.png" alt="The feature request board, where the community submits and votes on ideas." />
        </section>

        <section id="connect" className="scroll-mt-44">
          <h2 className="text-2xl font-semibold text-foreground mb-4 font-exo">{t('dapp.connectTitle')}</h2>
          <p className="text-foreground/80 leading-relaxed mb-4 font-exo">{t('dapp.connectDesc')}</p>
          <Shot src="/lovable-uploads/docs-connect.png" alt="The Connect page, for linking DeHub to ChatGPT or Claude over MCP." />
        </section>
      </div>
    </div>;
};
export default Dapp;
