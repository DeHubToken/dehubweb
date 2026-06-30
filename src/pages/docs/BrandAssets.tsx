
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Image, FileText, Package } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

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

      <Card>
        <CardHeader>
          <CardTitle>{t('brandAssets.brandGuidelines')}</CardTitle>
          <CardDescription>{t('brandAssets.brandGuidelinesDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-hidden rounded-lg">
            <iframe src="https://docs.google.com/presentation/d/e/2PACX-1vQgLJgskx5DzNQhbHmteH7CR9QqzsboG8RaVYZ7IwSW-PfoXRic3K9SX2gyrydR-7qwlL5UkvlLTObH/pubembed?start=false&loop=false&delayms=30000" frameBorder="0" width="100%" height="569" allowFullScreen={true} className="w-full" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('brandAssets.shakeUp2025')}</CardTitle>
          <CardDescription>{t('brandAssets.shakeUp2025Desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-hidden rounded-lg">
            <iframe 
              style={{border: "1px solid rgba(0, 0, 0, 0.1)"}} 
              width="800" 
              height="450" 
              src="https://embed.figma.com/slides/22r8W9g98g3KZz5vUwqWND/Dehub-Product-Design?node-id=1-42&embed-host=share" 
              allowFullScreen={true} 
              className="w-full" 
            />
          </div>
        </CardContent>
      </Card>

      <Card><></></Card>

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
