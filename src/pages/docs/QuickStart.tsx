import React from 'react';
import { Link } from 'react-router-dom';
import { Copy, CheckCircle, Terminal, Code, Zap } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const QuickStart = () => {
  const { t } = useLanguage();
  const [copiedCode, setCopiedCode] = React.useState<string>('');

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(''), 2000);
  };

  const apiBaseUrl = `https://api.dehub.io/api/docxx`;

  const initCode = `// DeHub API Base URL
const API_BASE = 'https://api.dehub.io/api/docxx';

// Set up your request headers
const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer your-api-key'
};`;

  const exampleCode = `// Make your first API call
const response = await fetch('https://api.dehub.io/api/docxx', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-api-key'
  }
});

const data = await response.json();
console.log(data);`;

  return (
    <div className="max-w-4xl space-y-8">
      <div className="space-y-4">
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <span>{t('quickStart.breadcrumbDocs')}</span>
          <span>/</span>
          <span>{t('quickStart.breadcrumbGettingStarted')}</span>
          <span>/</span>
          <span className="text-foreground">{t('quickStart.title')}</span>
        </div>
        <h1 className="text-4xl font-bold text-foreground">{t('quickStart.title')}</h1>
        <p className="text-xl text-muted-foreground">{t('quickStart.subtitle')}</p>
      </div>

      <div className="docs-glass rounded-lg p-6">
        <div className="flex items-center mb-3">
          <CheckCircle className="w-5 h-5 text-foreground mr-2" />
          <h3 className="text-lg font-semibold text-foreground">{t('quickStart.prerequisites')}</h3>
        </div>
        <ul className="space-y-2 text-muted-foreground">
          <li>• Node.js 16+ or Python 3.8+</li>
          <li>• A valid API key (sign up for free)</li>
          <li>• Basic knowledge of REST APIs</li>
        </ul>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground flex items-center">
          <span className="bg-primary text-primary-foreground w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mr-3">1</span>
          {t('quickStart.apiBaseUrl')}
        </h2>
        <p className="text-muted-foreground">{t('quickStart.apiBaseUrlDesc')}</p>
        <div className="bg-muted border border-border rounded-lg p-4 relative">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground text-sm">{t('quickStart.apiEndpoint')}</span>
            </div>
            <button onClick={() => copyToClipboard(apiBaseUrl, 'api')} className="flex items-center space-x-1 text-muted-foreground hover:text-foreground transition-colors">
              {copiedCode === 'api' ? <CheckCircle className="w-4 h-4 text-foreground" /> : <Copy className="w-4 h-4" />}
              <span className="text-sm">{t('quickStart.copy')}</span>
            </button>
          </div>
          <code className="text-foreground font-mono text-sm">{apiBaseUrl}</code>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground flex items-center">
          <span className="bg-primary text-primary-foreground w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mr-3">2</span>
          {t('quickStart.initializeClient')}
        </h2>
        <p className="text-muted-foreground">{t('quickStart.initializeClientDesc')}</p>
        <div className="bg-muted border border-border rounded-lg p-4 relative">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Code className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground text-sm">JavaScript</span>
            </div>
            <button onClick={() => copyToClipboard(initCode, 'init')} className="flex items-center space-x-1 text-muted-foreground hover:text-foreground transition-colors">
              {copiedCode === 'init' ? <CheckCircle className="w-4 h-4 text-foreground" /> : <Copy className="w-4 h-4" />}
              <span className="text-sm">{t('quickStart.copy')}</span>
            </button>
          </div>
          <pre className="text-foreground font-mono text-sm overflow-x-auto"><code>{initCode}</code></pre>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground flex items-center">
          <span className="bg-primary text-primary-foreground w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mr-3">3</span>
          {t('quickStart.firstApiCall')}
        </h2>
        <p className="text-muted-foreground">{t('quickStart.firstApiCallDesc')}</p>
        <div className="bg-muted border border-border rounded-lg p-4 relative">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground text-sm">{t('quickStart.example')}</span>
            </div>
            <button onClick={() => copyToClipboard(exampleCode, 'example')} className="flex items-center space-x-1 text-muted-foreground hover:text-foreground transition-colors">
              {copiedCode === 'example' ? <CheckCircle className="w-4 h-4 text-foreground" /> : <Copy className="w-4 h-4" />}
              <span className="text-sm">{t('quickStart.copy')}</span>
            </button>
          </div>
          <pre className="text-foreground font-mono text-sm overflow-x-auto"><code>{exampleCode}</code></pre>
        </div>
      </div>

      <div className="docs-glass rounded-lg p-6">
        <div className="flex items-center">
          <CheckCircle className="w-6 h-6 text-foreground mr-3" />
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-1">{t('quickStart.congratulations')}</h3>
            <p className="text-muted-foreground">{t('quickStart.congratulationsDesc')}</p>
          </div>
        </div>
      </div>

      <div className="docs-glass rounded-lg p-6">
        <h3 className="text-xl font-bold text-foreground mb-4">{t('quickStart.whatsNext')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link to="/docs/configuration" className="block p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors">
            <h4 className="font-semibold text-foreground mb-2">{t('quickStart.configurationTitle')}</h4>
            <p className="text-muted-foreground text-sm">{t('quickStart.configurationDesc')}</p>
          </Link>
          <Link to="/docs/endpoints" className="block p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors">
            <h4 className="font-semibold text-foreground mb-2">{t('quickStart.apiReference')}</h4>
            <p className="text-muted-foreground text-sm">{t('quickStart.apiReferenceDesc')}</p>
          </Link>
          <Link to="/docs/examples" className="block p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors">
            <h4 className="font-semibold text-foreground mb-2">{t('quickStart.examples')}</h4>
            <p className="text-muted-foreground text-sm">{t('quickStart.examplesDesc')}</p>
          </Link>
          <Link to="/docs/best-practices" className="block p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors">
            <h4 className="font-semibold text-foreground mb-2">{t('quickStart.bestPractices')}</h4>
            <p className="text-muted-foreground text-sm">{t('quickStart.bestPracticesDesc')}</p>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default QuickStart;
