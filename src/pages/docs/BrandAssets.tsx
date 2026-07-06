import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Image as ImageIcon, FileText, Package, Palette, ExternalLink } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import designSystemZip from '@/assets/design-system/dehub-design-system.zip.asset.json';
import wordmarkWhite from '@/assets/design-system/wordmark-white.png.asset.json';
import wordmarkBlack from '@/assets/design-system/wordmark-black.png.asset.json';
import markWhite from '@/assets/design-system/mark-white.png.asset.json';
import markBlack from '@/assets/design-system/mark-black.png.asset.json';

type LogoAsset = {
  id: string;
  name: string;
  description: string;
  url: string;
  filename: string;
  bg: 'dark' | 'light';
};

const BrandAssets = () => {
  const { t } = useLanguage();

  const handleDownload = async (url: string, filename: string) => {
    try {
      const res = await fetch(url, { mode: 'cors' });
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      // Fallback: open in new tab
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const logoAssets: LogoAsset[] = [
    {
      id: 'wordmark-white',
      name: 'Wordmark — White',
      description: 'Full DeHub wordmark for use on dark backgrounds.',
      url: wordmarkWhite.url,
      filename: 'dehub-wordmark-white.png',
      bg: 'dark',
    },
    {
      id: 'wordmark-black',
      name: 'Wordmark — Black',
      description: 'Full DeHub wordmark for use on light backgrounds.',
      url: wordmarkBlack.url,
      filename: 'dehub-wordmark-black.png',
      bg: 'light',
    },
    {
      id: 'mark-white',
      name: 'Mark — White',
      description: 'DeHub icon mark for use on dark backgrounds.',
      url: markWhite.url,
      filename: 'dehub-mark-white.png',
      bg: 'dark',
    },
    {
      id: 'mark-black',
      name: 'Mark — Black',
      description: 'DeHub icon mark for use on light backgrounds.',
      url: markBlack.url,
      filename: 'dehub-mark-black.png',
      bg: 'light',
    },
  ];

  const palette = [
    { name: 'Black', hex: '#000000', text: '#ffffff' },
    { name: 'Graphite', hex: '#0a0b0d', text: '#ffffff' },
    { name: 'Surface', hex: '#16181d', text: '#ffffff' },
    { name: 'Surface +1', hex: '#262a31', text: '#ffffff' },
    { name: 'Grey', hex: '#6b727d', text: '#ffffff' },
    { name: 'Light Grey', hex: '#9aa1ad', text: '#000000' },
    { name: 'Off White', hex: '#eef0f3', text: '#000000' },
    { name: 'White', hex: '#ffffff', text: '#000000' },
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-foreground">{t('brandAssets.title')}</h1>
        <p className="text-xl text-muted-foreground leading-relaxed">{t('brandAssets.subtitle')}</p>
      </div>

      {/* LOGOS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            {t('brandAssets.logoDownloads')}
          </CardTitle>
          <CardDescription>{t('brandAssets.logoDownloadsDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            {logoAssets.map((asset) => (
              <div key={asset.id} className="border border-border rounded-lg p-6 space-y-4">
                <div
                  className={`aspect-video rounded-lg flex items-center justify-center p-6 ${
                    asset.bg === 'dark' ? 'bg-black' : ''
                  }`}
                  style={asset.bg === 'light' ? { backgroundColor: '#ffffff' } : undefined}
                >
                  <img
                    src={asset.url}
                    alt={asset.name}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg text-foreground">{asset.name}</h3>
                  <p className="text-sm text-muted-foreground">{asset.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs bg-muted px-2 py-1 rounded">PNG</span>
                    <Button
                      onClick={() => handleDownload(asset.url, asset.filename)}
                      size="sm"
                      className="flex items-center gap-2"
                    >
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

      {/* MONOCHROME PALETTE */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Monochrome Palette
          </CardTitle>
          <CardDescription>
            DeHub is strictly black, white and grey. No decorative colour.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {palette.map((c) => (
              <div
                key={c.hex}
                className="rounded-xl p-4 border border-border"
                style={{ background: c.hex, color: c.text }}
              >
                <div className="font-semibold text-sm">{c.name}</div>
                <div className="font-mono text-xs opacity-70 mt-1">{c.hex}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* TYPOGRAPHY */}
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
            ].map((f) => (
              <div
                key={f.value}
                className="border border-border rounded-lg p-4 flex flex-col justify-center items-center"
              >
                <p className={`text-5xl ${f.weight}`}>Aa</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{f.label}</p>
                <p className="text-sm text-muted-foreground">{f.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Button variant="outline" asChild>
              <a
                href="https://fonts.google.com/specimen/Exo"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                {t('brandAssets.downloadExoFont')}
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SOCIAL MEDIA TEMPLATES */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Social Media Templates
          </CardTitle>
          <CardDescription>
            Editable Figma templates for social posts, banners and campaigns.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" asChild className="flex items-center gap-2 w-full sm:w-auto">
            <a
              href="https://www.figma.com/design/BjnSoqSIFYXL73yz4svKLh/Dehub-SM-Template-2.0--Copy-"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="w-4 h-4" />
              Copy and edit
            </a>
          </Button>
          <div className="w-full rounded-lg overflow-hidden border border-border bg-black">
            <iframe
              title="DeHub Social Media Templates"
              src="https://embed.figma.com/design/BjnSoqSIFYXL73yz4svKLh/Dehub-SM-Template-2.0--Copy-?node-id=0-1&embed-host=share"
              className="w-full h-[600px] block"
              allowFullScreen
              style={{ border: '1px solid rgba(255,255,255,0.1)' }}
            />
          </div>
        </CardContent>
      </Card>

      {/* COMPLETE PACKAGE */}
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
            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">{t('brandAssets.requestFullBrandKit')}</h3>
              <p className="text-sm text-muted-foreground">{t('brandAssets.requestFullBrandKitDesc')}</p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Button asChild>
                  <a href={designSystemZip.url} download="dehub-design-system.zip">
                    <Download className="w-4 h-4 mr-2" />
                    Download kit
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href="mailto:marketing@dehub.net">{t('brandAssets.contactBrandTeam')}</a>
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BrandAssets;
