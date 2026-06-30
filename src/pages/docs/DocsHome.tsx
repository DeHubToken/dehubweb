import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Book, Code, Zap, Shield, Users, Database, Rocket, Star, CheckCircle, ExternalLink, Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePerformance } from '@/hooks/usePerformance';
import { getLatestPost } from '@/utils/blogUtils';
import SEO from '@/components/SEO';
import { useLanguage } from '@/contexts/LanguageContext';

// Declare the global build time variable
declare const __BUILD_TIME__: string;
const DocsHome = () => {
  const {
    toast
  } = useToast();
  const [copiedAddress, setCopiedAddress] = useState<string>('');
  const { t } = useLanguage();

  // Monitor performance for this page
  usePerformance();

  // Get the latest blog post
  const latestPost = getLatestPost();
  let bannerImage = latestPost?.bannerImage;
  let bannerImageAlt = latestPost?.bannerImageAlt;
  if (latestPost) {
    if (latestPost.slug === '1-million-dollar-raise-completed') {
      bannerImage = '/lovable-uploads/bdd1dd4c-eb62-44e7-a205-fced995bdf9f.png';
      bannerImageAlt = '$1,000,000 Fundraise';
    } else if (latestPost.slug === 'get-ready-players-final-snapshot-for-last-chad-standing-airdrop---a-dehub-milestone-from-q2-2025') {
      bannerImage = '/lovable-uploads/6d868478-769e-4981-b285-4ca5fa215dc5.png';
      bannerImageAlt = 'Last Chad Standing helicopter';
    } else if (latestPost.slug === 'main-event-ready-last-chad-standing-full-trailer-gains-mma-promoter-attention---a-dehub-milestone-from-q1-2025') {
      bannerImage = '/lovable-uploads/b632bee7-0228-48be-b4ac-7ac0ab5e9994.png';
      bannerImageAlt = 'Last Chad Standing character helmet';
    } else if (latestPost.slug === 'fresh-experience-revamped-app-feed-with-audio-replies--live-talk-spaces---a-dehub-milestone-from-q2-2025') {
      bannerImage = '/lovable-uploads/eeb2e5c9-2347-4865-876e-31f38fe4412a.png';
      bannerImageAlt = 'DeHub Revamped App Feed';
    } else if (latestPost.slug === 'transparency-hub-dhbscancom-launches-for-contract-activity-tracking---a-dehub-milestone-from-q2-2025') {
      bannerImage = '/lovable-uploads/3b0272d6-6cae-4b9a-a303-5fdf970d17e7.png';
      bannerImageAlt = 'DHBScan Metrics';
    } else if (latestPost.slug === 'dhb-tradable-on-coinbase-soon') {
      bannerImage = '/lovable-uploads/c238e114-80c3-42ac-9e7a-d4617111466c.png';
      bannerImageAlt = 'Coinbase logo on mobile device with trading charts in background';
    }
  }
  const copyToClipboard = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      toast({
        title: t('common.contractAddressCopied'),
        description: t('common.contractAddressCopiedDesc'),
      });
      setTimeout(() => setCopiedAddress(''), 2000);
    } catch (err) {
      toast({
        title: t('common.copyFailed'),
        description: t('common.copyFailedDesc'),
        variant: "destructive"
      });
    }
  };
  const handleComingSoonClick = (e: React.MouseEvent) => {
    e.preventDefault();
    toast({
      title: t('common.comingSoon'),
      description: t('common.comingSoonDesc'),
    });
  };

  // Manual last updated date - update this when you publish changes
  const lastPublishedDate = new Date('2026-02-22T22:22:00Z'); // February 22, 2026 at 22:22 UTC

  // Quick Links
  const quickLinks = [{
    title: 'Basescan',
    icon: ExternalLink,
    path: 'https://basescan.org/token/0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c',
    color: 'from-middle-blue to-sky-blue',
    external: true,
    contractAddress: '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c'
  }, {
    title: 'BSCScan',
    icon: ExternalLink,
    path: 'https://bscscan.com/token/0x680d3113caf77b61b510f332d5ef4cf5b41a761d',
    color: 'from-sky-blue to-middle-blue',
    external: true,
    contractAddress: '0x680d3113caf77b61b510f332d5ef4cf5b41a761d'
  }, {
    title: 'DHBScan',
    icon: ExternalLink,
    path: 'https://dhbscan.com',
    color: 'from-royal-blue to-sky-blue',
    external: true
  }, {
    title: 'DeHub App',
    icon: ExternalLink,
    path: 'https://dehub.io',
    color: 'from-middle-blue to-royal-blue',
    external: true
  }];

  // Features
  const features = [{
    icon: Zap,
    title: t('home.featureFast'),
    description: t('home.featureFastDesc'),
  }, {
    icon: Shield,
    title: t('home.featureSecure'),
    description: t('home.featureSecureDesc'),
  }, {
    icon: Code,
    title: t('home.featureDevSupport'),
    description: t('home.featureDevSupportDesc'),
  }, {
    icon: Users,
    title: t('home.featureCommunity'),
    description: t('home.featureCommunityDesc'),
  }];
  return <>
      <SEO title="DeHub Documentation - Build on the Decentralized Future" description="Everything you need to use, integrate, build, and scale with DeHub platform. From quick start guides to advanced configurations for decentralized applications." image="/lovable-uploads/7668607f-3b0b-4512-ab17-e7ba5fce395f.png" url="/docs" type="website" tags={['DeHub', 'documentation', 'blockchain', 'decentralized', 'DHB token', 'developer tools']} />
      <div className="space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-6">
          <h1 className="text-5xl font-bold text-foreground leading-tight font-exo">
            {t('home.welcomeTo')}
            <span className="block bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">{t('home.ourDocs')}</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed font-exo">
            {t('home.heroDescription')}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link to="/docs/overview" className="inline-flex items-center justify-center min-w-[180px] px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all duration-200 shadow-lg hover:shadow-xl font-exo">
              {t('common.getStarted')}
            </Link>
            <a href="https://play.google.com/store/apps/details?id=io.dehub.mobile&hl" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center min-w-[180px] px-6 py-3 border border-border text-foreground font-semibold rounded-lg hover:bg-muted transition-all duration-200 font-exo">
              {t('common.downloadApp')}
              <ExternalLink className="w-4 h-4 ml-2" />
            </a>
          </div>
        </div>

        {/* Quick Links */}
        <div className="flex justify-center">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-sm sm:max-w-none">
            {quickLinks.map(link => link.external ? <a key={link.path} href={link.path} target="_blank" rel="noopener noreferrer" className="group block p-6 bg-card rounded-xl border border-border hover:border-primary/40 transition-all duration-200 hover:shadow-lg text-center">
                  <div className={`w-12 h-12 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-200`}>
                    <link.icon className="w-6 h-6 text-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2 font-exo">{link.title}</h3>
                  <div className="flex flex-row lg:flex-col items-center justify-center gap-2 mt-3">
                    {!link.contractAddress && <div className="flex items-center justify-center text-sm text-muted-foreground group-hover:text-foreground font-exo">
                        Visit site
                        <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-1 transition-transform duration-200" />
                      </div>}
                    {link.contractAddress && <button onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                copyToClipboard(link.contractAddress!);
              }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted">
                        {copiedAddress === link.contractAddress ? <>
                            <Check className="w-3 h-3 text-green-500" />
                            <span className="text-green-500">{t('common.copied')}</span>
                          </> : <>
                            <Copy className="w-3 h-3" />
                            <span>{t('common.copyCA')}</span>
                          </>}
                      </button>}
                  </div>
                </a> : <Link key={link.path} to={link.path} className="group block p-6 bg-card rounded-xl border border-border hover:border-primary/40 transition-all duration-200 hover:shadow-lg text-center">
                  <div className={`w-12 h-12 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-200`}>
                    <link.icon className="w-6 h-6 text-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2 font-exo">{link.title}</h3>
                  <div className="flex items-center justify-center mt-3 text-sm text-muted-foreground group-hover:text-foreground font-exo">
                    {t('common.learnMore')}
                    <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-1 transition-transform duration-200" />
                  </div>
                </Link>)}
          </div>
        </div>

        {/* Latest Blog Post Promotion */}
        {latestPost && <div className="bg-card rounded-2xl border border-border p-8">
            <div className="flex flex-col gap-6">
              <div className="text-center">
                <span className="inline-block bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-semibold">{t('home.latestFromBlog')}</span>
              </div>
              <Link to={`/docs/blog/${latestPost.slug}`} className="w-full block">
                <img src={bannerImage} alt={bannerImageAlt} className="w-full aspect-video object-cover rounded-xl hover:opacity-95 transition-opacity cursor-pointer" />
              </Link>
              <div className="text-center">
                <div className="mb-4">
                  <h2 className="text-2xl lg:text-3xl font-bold text-foreground mb-3 font-exo">
                    {latestPost.title}
                  </h2>
                  <p className="text-muted-foreground mb-6 font-exo">
                    {latestPost.excerpt}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to={`/docs/blog/${latestPost.slug}`} className="flex justify-center sm:inline-flex sm:items-center px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all duration-200 shadow-lg hover:shadow-xl font-exo text-center">
                    {t('common.readArticle')}
                  </Link>
                  <Link to="/docs/blog" className="flex justify-center sm:inline-flex sm:items-center px-6 py-3 border border-border text-foreground font-semibold rounded-lg hover:bg-muted transition-all duration-200 font-exo text-center">
                    {t('common.visitOurBlog')}
                  </Link>
                </div>
              </div>
            </div>
          </div>}

        {/* Features */}
        <div className="bg-card rounded-2xl border border-border p-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-foreground mb-4 font-exo">{t('home.whyBuildOnDeHub')}</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto font-exo">{t('home.whyBuildDescription')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map(feature => <div key={feature.title} className="text-center">
                <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <feature.icon className="w-8 h-8 text-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2 font-exo">{feature.title}</h3>
                <p className="text-muted-foreground text-sm font-exo">{feature.description}</p>
              </div>)}
          </div>
        </div>

        {/* Getting Started */}
        <div className="rounded-2xl p-8 text-center shadow-2xl hover:shadow-3xl transition-shadow duration-300 bg-muted">
          <h2 className="text-3xl font-bold mb-4 font-exo text-popover-foreground">{t('home.readyToGetStarted')}</h2>
          <p className="mb-6 max-w-2xl mx-auto font-exo text-muted-foreground dark:text-black">
            {t('home.readyDescription')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link to="/docs/quickstart" className="inline-flex items-center px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-100 transition-all duration-200 font-exo">
              {t('common.startBuilding')}
              <ArrowRight className="w-4 h-4 ml-2 text-black" />
            </Link>
            
          </div>
        </div>

        {/* Last Updated */}
        <div className="text-center pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground font-exo">
            {t('common.lastUpdated')}: {lastPublishedDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}, 04:44
          </p>
        </div>
      </div>
    </>;
};
export default DocsHome;