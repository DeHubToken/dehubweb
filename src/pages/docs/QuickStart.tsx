import React from 'react';
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
        <div className="flex items-center space-x-2 text-sm text-slate-500">
          <span>{t('quickStart.breadcrumbDocs')}</span>
          <span>/</span>
          <span>{t('quickStart.breadcrumbGettingStarted')}</span>
          <span>/</span>
          <span className="text-slate-900">{t('quickStart.title')}</span>
        </div>
        <h1 className="text-4xl font-bold text-slate-900">{t('quickStart.title')}</h1>
        <p className="text-xl text-slate-600">{t('quickStart.subtitle')}</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-center mb-3">
          <CheckCircle className="w-5 h-5 text-blue-600 mr-2" />
          <h3 className="text-lg font-semibold text-blue-900">{t('quickStart.prerequisites')}</h3>
        </div>
        <ul className="space-y-2 text-blue-800">
          <li>• Node.js 16+ or Python 3.8+</li>
          <li>• A valid API key (sign up for free)</li>
          <li>• Basic knowledge of REST APIs</li>
        </ul>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center">
          <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mr-3">1</span>
          {t('quickStart.apiBaseUrl')}
        </h2>
        <p className="text-slate-600">{t('quickStart.apiBaseUrlDesc')}</p>
        <div className="bg-slate-900 rounded-lg p-4 relative">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-green-400" />
              <span className="text-slate-300 text-sm">{t('quickStart.apiEndpoint')}</span>
            </div>
            <button onClick={() => copyToClipboard(apiBaseUrl, 'api')} className="flex items-center space-x-1 text-slate-400 hover:text-white transition-colors">
              {copiedCode === 'api' ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              <span className="text-sm">{t('quickStart.copy')}</span>
            </button>
          </div>
          <code className="text-green-400 font-mono text-sm">{apiBaseUrl}</code>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center">
          <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mr-3">2</span>
          {t('quickStart.initializeClient')}
        </h2>
        <p className="text-slate-600">{t('quickStart.initializeClientDesc')}</p>
        <div className="bg-slate-900 rounded-lg p-4 relative">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Code className="w-4 h-4 text-blue-400" />
              <span className="text-slate-300 text-sm">JavaScript</span>
            </div>
            <button onClick={() => copyToClipboard(initCode, 'init')} className="flex items-center space-x-1 text-slate-400 hover:text-white transition-colors">
              {copiedCode === 'init' ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              <span className="text-sm">{t('quickStart.copy')}</span>
            </button>
          </div>
          <pre className="text-slate-300 font-mono text-sm overflow-x-auto"><code>{initCode}</code></pre>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center">
          <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mr-3">3</span>
          {t('quickStart.firstApiCall')}
        </h2>
        <p className="text-slate-600">{t('quickStart.firstApiCallDesc')}</p>
        <div className="bg-slate-900 rounded-lg p-4 relative">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span className="text-slate-300 text-sm">{t('quickStart.example')}</span>
            </div>
            <button onClick={() => copyToClipboard(exampleCode, 'example')} className="flex items-center space-x-1 text-slate-400 hover:text-white transition-colors">
              {copiedCode === 'example' ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              <span className="text-sm">{t('quickStart.copy')}</span>
            </button>
          </div>
          <pre className="text-slate-300 font-mono text-sm overflow-x-auto"><code>{exampleCode}</code></pre>
        </div>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-lg p-6">
        <div className="flex items-center">
          <CheckCircle className="w-6 h-6 text-green-600 mr-3" />
          <div>
            <h3 className="text-lg font-semibold text-green-900 mb-1">{t('quickStart.congratulations')}</h3>
            <p className="text-green-800">{t('quickStart.congratulationsDesc')}</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="text-xl font-bold text-slate-900 mb-4">{t('quickStart.whatsNext')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a href="/docs/configuration" className="block p-4 border border-slate-200 rounded-lg hover:border-blue-300 transition-colors">
            <h4 className="font-semibold text-slate-900 mb-2">{t('quickStart.configurationTitle')}</h4>
            <p className="text-slate-600 text-sm">{t('quickStart.configurationDesc')}</p>
          </a>
          <a href="/docs/endpoints" className="block p-4 border border-slate-200 rounded-lg hover:border-blue-300 transition-colors">
            <h4 className="font-semibold text-slate-900 mb-2">{t('quickStart.apiReference')}</h4>
            <p className="text-slate-600 text-sm">{t('quickStart.apiReferenceDesc')}</p>
          </a>
          <a href="/docs/examples" className="block p-4 border border-slate-200 rounded-lg hover:border-blue-300 transition-colors">
            <h4 className="font-semibold text-slate-900 mb-2">{t('quickStart.examples')}</h4>
            <p className="text-slate-600 text-sm">{t('quickStart.examplesDesc')}</p>
          </a>
          <a href="/docs/best-practices" className="block p-4 border border-slate-200 rounded-lg hover:border-blue-300 transition-colors">
            <h4 className="font-semibold text-slate-900 mb-2">{t('quickStart.bestPractices')}</h4>
            <p className="text-slate-600 text-sm">{t('quickStart.bestPracticesDesc')}</p>
          </a>
        </div>
      </div>
    </div>
  );
};

export default QuickStart;
