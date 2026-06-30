
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Image, FileText, Package } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import designSystemZip from '@/assets/design-system/dehub-design-system.zip.asset.json';
import wordmarkWhite from '@/assets/design-system/wordmark-white.png.asset.json';
import wordmarkBlack from '@/assets/design-system/wordmark-black.png.asset.json';
import markWhite from '@/assets/design-system/mark-white.png.asset.json';
import markBlack from '@/assets/design-system/mark-black.png.asset.json';
import templateSignup from '@/assets/design-system/template-signup.png.asset.json';
import templateAffiliates from '@/assets/design-system/template-affiliates.png.asset.json';


const BrandAssets = () => {
  const { t } = useLanguage();

  const handleDownload = (imagePath: string, filename: string) => {
    const link = document.createElement('a');
    link.href = imagePath;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const logoAssets = [{
    id: 1,
    name: t('brandAssets.logoFullName'),
    description: t('brandAssets.logoFullDesc'),
    imagePath: "/lovable-uploads/40022385-7894-4cb4-a6f9-403a0d9e4e5e.png",
    filename: "dehub-logo-primary.png",
    type: "PNG"
  }, {
    id: 2,
    name: t('brandAssets.logoIconName'),
    description: t('brandAssets.logoIconDesc'),
    imagePath: "/lovable-uploads/5e136fdf-d23f-4cdb-b8ec-54babb5d375b.png",
    filename: "dehub-logo-alternative.png",
    type: "PNG"
  }];

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-foreground">{t('brandAssets.title')}</h1>
        <p className="text-xl text-muted-foreground leading-relaxed">{t('brandAssets.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="w-5 h-5" />
            {t('brandAssets.logoDownloads')}
          </CardTitle>
          <CardDescription>{t('brandAssets.logoDownloadsDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            {logoAssets.map(asset => (
              <div key={asset.id} className="border border-border rounded-lg p-6 space-y-4">
                <div className="aspect-video rounded-lg flex items-center justify-center p-4 bg-zinc-950">
                  <img src={asset.imagePath} alt={asset.name} className="max-w-full max-h-full object-contain" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg text-foreground">{asset.name}</h3>
                  <p className="text-sm text-muted-foreground">{asset.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs bg-muted px-2 py-1 rounded">{asset.type}</span>
                    <Button onClick={() => handleDownload(asset.imagePath, asset.filename)} size="sm" className="flex items-center gap-2">
                      <Download className="w-4 h-4" />
                      {t('brandAssets.download')}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {t('brandAssets.typography')}
          </CardTitle>
          <CardDescription>{t('brandAssets.typographyDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="font-exo grid grid-cols-1 sm:grid-cols-2 gap-4 text-center">
            {[
              { weight: 'font-black', label: 'Exo Black', value: '900' },
              { weight: 'font-semibold', label: 'Exo Semi-bold', value: '600' },
              { weight: 'font-medium', label: 'Exo Medium', value: '500' },
              { weight: 'font-light', label: 'Exo Light', value: '300' },
            ].map(f => (
              <div key={f.value} className="border border-border rounded-lg p-4 flex flex-col justify-center items-center">
                <p className={`text-5xl ${f.weight}`}>Aa</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{f.label}</p>
                <p className="text-sm text-muted-foreground">{f.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Button variant="outline" asChild>
              <a href="https://fonts.google.com/specimen/Exo" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                {t('brandAssets.downloadExoFont')}
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ============ DEHUB DESIGN SYSTEM SHOWCASE ============ */}
      <Card className="overflow-hidden border-white/10 bg-[#0a0b0d] text-[#eef0f3]">
        <CardHeader className="border-b border-white/10">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="font-mono text-xs uppercase tracking-[0.18em] text-[#6b727d] mb-2">
                // type = "design_system"
              </div>
              <CardTitle className="font-exo text-3xl uppercase tracking-[0.04em] text-white">
                dehub — Design System
              </CardTitle>
              <CardDescription className="text-[#9aa1ad] mt-1">
                Machined graphite. Chrome type. Monochrome with status-only color.
              </CardDescription>
            </div>
            <Button asChild className="rounded-2xl bg-white text-black hover:bg-white/90">
              <a href={designSystemZip.url} download="dehub-design-system.zip">
                <Download className="w-4 h-4 mr-2" />
                Download kit
              </a>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Hero with dot-grid blueprint motif */}
          <div
            className="relative px-8 py-14 border-b border-white/10"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)',
              backgroundSize: '28px 28px',
            }}
          >
            <div
              className="font-exo font-black uppercase tracking-[0.04em] text-6xl md:text-8xl leading-none"
              style={{
                backgroundImage:
                  'linear-gradient(180deg, #ffffff 0%, #d8dde3 30%, #6b727d 55%, #c2c8d0 80%, #ffffff 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              DEHUB
            </div>
            <p className="font-mono text-xs mt-4 text-[#6b727d] uppercase tracking-[0.18em]">
              // chrome display · brushed metal · dot-grid blueprint
            </p>
          </div>

          {/* Logo grid */}
          <div className="grid md:grid-cols-2 gap-px bg-white/10">
            <div className="bg-[#0a0b0d] p-8 flex flex-col gap-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#6b727d]">
                wordmark / on dark
              </div>
              <div className="flex-1 flex items-center justify-center min-h-[120px]">
                <img src={wordmarkWhite.url} alt="dehub wordmark white" className="max-h-16" />
              </div>
            </div>
            <div className="bg-[#eef0f3] p-8 flex flex-col gap-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#6b727d]">
                wordmark / on light
              </div>
              <div className="flex-1 flex items-center justify-center min-h-[120px]">
                <img src={wordmarkBlack.url} alt="dehub wordmark black" className="max-h-16" />
              </div>
            </div>
            <div className="bg-[#0a0b0d] p-8 flex flex-col gap-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#6b727d]">
                trident mark / on dark
              </div>
              <div className="flex-1 flex items-center justify-center min-h-[120px]">
                <img src={markWhite.url} alt="dehub mark white" className="max-h-20" />
              </div>
            </div>
            <div className="bg-[#eef0f3] p-8 flex flex-col gap-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#6b727d]">
                trident mark / on light
              </div>
              <div className="flex-1 flex items-center justify-center min-h-[120px]">
                <img src={markBlack.url} alt="dehub mark black" className="max-h-20" />
              </div>
            </div>
          </div>

          {/* Color tokens */}
          <div className="p-8 border-t border-white/10">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-[#6b727d] mb-4">
              // colors
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { name: 'Canvas', hex: '#0a0b0d', text: '#eef0f3' },
                { name: 'Vignette', hex: '#060708', text: '#eef0f3' },
                { name: 'Surface', hex: '#16181d', text: '#eef0f3' },
                { name: 'Surface +1', hex: '#262a31', text: '#eef0f3' },
                { name: 'Text', hex: '#eef0f3', text: '#0a0b0d' },
                { name: 'Text dim', hex: '#6b727d', text: '#0a0b0d' },
                { name: 'Live', hex: '#34e0a1', text: '#0a0b0d' },
                { name: 'Warn', hex: '#ffc043', text: '#0a0b0d' },
                { name: 'Alert', hex: '#ff5468', text: '#0a0b0d' },
                { name: 'Info', hex: '#5b9dff', text: '#0a0b0d' },
              ].map((c) => (
                <div
                  key={c.hex}
                  className="rounded-xl p-4 border border-white/10"
                  style={{ background: c.hex, color: c.text }}
                >
                  <div className="font-exo font-semibold text-sm uppercase tracking-wider">{c.name}</div>
                  <div className="font-mono text-xs opacity-70 mt-1">{c.hex}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-[#6b727d] mt-4">
              Functional color appears <em>only</em> as status — never decoratively.
            </p>
          </div>

          {/* Typography */}
          <div className="p-8 border-t border-white/10 grid md:grid-cols-2 gap-6">
            <div>
              <div className="font-mono text-xs uppercase tracking-[0.18em] text-[#6b727d] mb-3">
                // type / display
              </div>
              <div className="font-exo font-black uppercase tracking-[0.05em] text-5xl text-white leading-tight">
                Simple<br />sign up
              </div>
              <p className="text-xs text-[#6b727d] mt-3">Exo 800 · uppercase · tracking 0.04–0.06em</p>
            </div>
            <div>
              <div className="font-mono text-xs uppercase tracking-[0.18em] text-[#6b727d] mb-3">
                // type / body + mono
              </div>
              <div className="font-exo text-base text-[#eef0f3] leading-relaxed">
                Share your hub, earn on every referral.
              </div>
              <div className="font-mono text-sm text-[#9aa1ad] mt-3">
                file_type = "image"<br />
                threshold = $50<br />
                //dehub.io
              </div>
            </div>
          </div>

          {/* Embossed panel + button samples */}
          <div className="p-8 border-t border-white/10">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-[#6b727d] mb-4">
              // surfaces & controls
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <div
                className="rounded-2xl p-5"
                style={{
                  background: 'linear-gradient(180deg, #1c1f25 0%, #16181d 100%)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  boxShadow:
                    'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.6), 0 12px 32px rgba(0,0,0,0.5)',
                }}
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#6b727d] mb-2">
                  panel
                </div>
                <div className="font-exo font-semibold text-white">Embossed graphite</div>
                <p className="text-xs text-[#9aa1ad] mt-1">radius 16px · 1px translucent border</p>
              </div>

              <div className="rounded-2xl p-5 flex flex-col gap-3 bg-[#16181d] border border-white/10">
                <button
                  className="font-exo font-semibold uppercase tracking-wider text-sm rounded-2xl px-5 py-3 bg-white text-black hover:brightness-110 transition"
                >
                  Continue
                </button>
                <button
                  className="font-exo font-semibold uppercase tracking-wider text-sm rounded-2xl px-5 py-3 border border-white/15 text-white hover:bg-white/5 transition"
                >
                  Ghost action
                </button>
              </div>

              <div className="rounded-2xl p-5 flex flex-col gap-3 bg-[#16181d] border border-white/10">
                <span className="self-start font-mono text-[10px] uppercase tracking-[0.18em] rounded-full px-3 py-1 bg-[#34e0a1]/15 text-[#34e0a1] border border-[#34e0a1]/30">
                  ● Live now in beta
                </span>
                <span className="self-start font-mono text-[10px] uppercase tracking-[0.18em] rounded-full px-3 py-1 bg-white/5 text-[#9aa1ad] border border-white/10">
                  type = "affiliate"
                </span>
                <span className="self-start font-mono text-[10px] uppercase tracking-[0.18em] rounded-full px-3 py-1 bg-[#ffc043]/15 text-[#ffc043] border border-[#ffc043]/30">
                  ● Warn
                </span>
              </div>
            </div>
          </div>

          {/* Reference templates */}
          <div className="p-8 border-t border-white/10">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-[#6b727d] mb-4">
              // reference templates
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-2xl overflow-hidden border border-white/10 bg-black">
                <img src={templateSignup.url} alt="Simple Sign Up template" className="w-full h-auto" loading="lazy" />
              </div>
              <div className="rounded-2xl overflow-hidden border border-white/10 bg-black">
                <img src={templateAffiliates.url} alt="Affiliates template" className="w-full h-auto" loading="lazy" />
              </div>
            </div>
          </div>

          {/* Motifs */}
          <div className="p-8 border-t border-white/10">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-[#6b727d] mb-3">
              // motifs
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                'chrome display text',
                '// mono annotations',
                'dot-grid blueprint',
                'embossed graphite panels',
                'trident U mark',
                'code-as-copy stamps',
                'glass over media',
                'live-green status',
                'QR corners',
              ].map((m) => (
                <span
                  key={m}
                  className="font-mono text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[#eef0f3]"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            {t('brandAssets.completeBrandPackage')}
          </CardTitle>
          <CardDescription>{t('brandAssets.completeBrandPackageDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 rounded-lg p-6 text-center space-y-4">
            <Package className="w-12 h-12 text-muted-foreground mx-auto" />
            <div>
              <h3 className="font-semibold mb-2 text-foreground">{t('brandAssets.requestFullBrandKit')}</h3>
              <p className="text-sm text-muted-foreground mb-4">{t('brandAssets.requestFullBrandKitDesc')}</p>
              <Button variant="outline" asChild>
                <a href="mailto:marketing@dehub.net">{t('brandAssets.contactBrandTeam')}</a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card><></></Card>
    </div>
  );
};

export default BrandAssets;
