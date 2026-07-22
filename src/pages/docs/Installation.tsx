import React from 'react';
import { Link } from 'react-router-dom';
import { Package, Download, Settings, CheckCircle, AlertTriangle, Terminal } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const Installation = () => {
  const { t } = useLanguage();

  const installMethods = [
    { name: 'npm', code: 'npm install @yourplatform/sdk', description: t('installation.mostPopular') },
    { name: 'yarn', code: 'yarn add @yourplatform/sdk', description: t('installation.fastReliable') },
    { name: 'pnpm', code: 'pnpm add @yourplatform/sdk', description: t('installation.efficient') }
  ];

  return (
    <div className="max-w-4xl space-y-8">
      <div className="space-y-4">
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <span>{t('installation.breadcrumbDocs')}</span>
          <span>/</span>
          <span>{t('installation.breadcrumbGettingStarted')}</span>
          <span>/</span>
          <span className="text-foreground">{t('installation.title')}</span>
        </div>
        <h1 className="text-4xl font-bold text-foreground">{t('installation.title')}</h1>
        <p className="text-xl text-muted-foreground">{t('installation.subtitle')}</p>
      </div>

      <div className="docs-glass rounded-lg p-6">
        <div className="flex items-center mb-4">
          <Settings className="w-5 h-5 text-foreground mr-2" />
          <h3 className="text-lg font-semibold text-foreground">{t('installation.systemRequirements')}</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-foreground mb-2">{t('installation.nodeEnvironment')}</h4>
            <ul className="space-y-1 text-muted-foreground text-sm">
              <li>• Node.js 16.0.0 or higher</li>
              <li>• npm 7.0.0 or higher</li>
              <li>• TypeScript 4.5+ (optional)</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-foreground mb-2">{t('installation.browserSupport')}</h4>
            <ul className="space-y-1 text-muted-foreground text-sm">
              <li>• Chrome 90+</li>
              <li>• Firefox 88+</li>
              <li>• Safari 14+</li>
              <li>• Edge 90+</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-foreground flex items-center">
          <Package className="w-6 h-6 mr-3 text-foreground" />
          {t('installation.packageManagerInstallation')}
        </h2>
        <p className="text-muted-foreground">{t('installation.packageManagerDesc')}</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {installMethods.map((method) => (
            <div key={method.name} className="docs-glass rounded-lg p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-foreground">{method.name}</h3>
                <Terminal className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm mb-4">{method.description}</p>
              <div className="bg-muted border border-border rounded p-3">
                <code className="text-foreground font-mono text-sm">{method.code}</code>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground flex items-center">
          <Download className="w-6 h-6 mr-3 text-foreground" />
          {t('installation.cdnInstallation')}
        </h2>
        <p className="text-muted-foreground">{t('installation.cdnDesc')}</p>
        <div className="bg-muted border border-border rounded-lg p-4">
          <pre className="text-foreground font-mono text-sm overflow-x-auto">
            <code>{`<!-- Latest version -->
<script src="https://cdn.yourplatform.com/sdk/latest/yourplatform.min.js"></script>

<!-- Specific version (recommended for production) -->
<script src="https://cdn.yourplatform.com/sdk/v2.1.0/yourplatform.min.js"></script>`}</code>
          </pre>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground">{t('installation.environmentSetup')}</h2>
        <p className="text-muted-foreground">{t('installation.environmentSetupDesc')}</p>
        <div className="docs-glass rounded-lg p-4">
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-foreground mr-2 mt-0.5" />
            <div>
              <p className="text-foreground font-medium">{t('installation.environmentVariables')}</p>
              <p className="text-muted-foreground text-sm mt-1">
                {t('installation.envFileDesc')}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-muted border border-border rounded-lg p-4">
          <pre className="text-foreground font-mono text-sm">
            <code>{`# API Configuration
YOURPLATFORM_API_KEY=your_api_key_here
YOURPLATFORM_ENVIRONMENT=production
YOURPLATFORM_BASE_URL=https://api.yourplatform.com

# Optional Settings
YOURPLATFORM_TIMEOUT=30000
YOURPLATFORM_RETRY_ATTEMPTS=3`}</code>
          </pre>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground">{t('installation.verifyInstallation')}</h2>
        <p className="text-muted-foreground">{t('installation.verifyDesc')}</p>
        <div className="bg-muted border border-border rounded-lg p-4">
          <pre className="text-foreground font-mono text-sm overflow-x-auto">
            <code>{`import { YourPlatform } from '@yourplatform/sdk';

// Verify the SDK is properly installed
console.log('SDK Version:', YourPlatform.version);

// Test basic initialization
const client = new YourPlatform({
  apiKey: process.env.YOURPLATFORM_API_KEY
});

console.log('✅ Installation successful!');`}</code>
          </pre>
        </div>
      </div>

      <div className="docs-glass rounded-lg p-6">
        <div className="flex items-center">
          <CheckCircle className="w-6 h-6 text-foreground mr-3" />
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-1">{t('installation.installationComplete')}</h3>
            <p className="text-muted-foreground">{t('installation.installationCompleteDesc')}</p>
          </div>
        </div>
      </div>

      <div className="docs-glass rounded-lg p-6">
        <h3 className="text-xl font-bold text-foreground mb-4">{t('installation.nextSteps')}</h3>
        <div className="space-y-3">
          <Link to="/docs/quickstart" className="flex items-center text-primary hover:text-primary/80 transition-colors">
            <span className="font-medium">{t('installation.quickStartGuide')}</span>
            <span className="ml-2 text-muted-foreground">{t('installation.quickStartGuideDesc')}</span>
          </Link>
          <Link to="/docs/configuration" className="flex items-center text-primary hover:text-primary/80 transition-colors">
            <span className="font-medium">{t('installation.configuration')}</span>
            <span className="ml-2 text-muted-foreground">{t('installation.configurationDesc')}</span>
          </Link>
          <Link to="/docs/auth" className="flex items-center text-primary hover:text-primary/80 transition-colors">
            <span className="font-medium">{t('installation.authentication')}</span>
            <span className="ml-2 text-muted-foreground">{t('installation.authenticationDesc')}</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Installation;
