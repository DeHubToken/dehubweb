import React, { useState } from 'react';
import { Code, Copy, CheckCircle, Globe, Lock, Zap } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const ApiEndpoints = () => {
  const { t } = useLanguage();
  const [copiedCode, setCopiedCode] = useState<string>('');

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(''), 2000);
  };

  const endpoints = [
    {
      method: 'GET', path: '/api/v1/users', description: 'Retrieve a list of users', auth: true,
      parameters: [
        { name: 'page', type: 'integer', required: false, description: 'Page number for pagination' },
        { name: 'limit', type: 'integer', required: false, description: 'Number of items per page (max 100)' },
        { name: 'filter', type: 'string', required: false, description: 'Filter users by status' }
      ],
      response: `{\n  "data": [\n    {\n      "id": "user_123",\n      "email": "user@example.com",\n      "name": "John Doe",\n      "status": "active",\n      "created_at": "2024-01-15T10:30:00Z"\n    }\n  ],\n  "pagination": {\n    "page": 1,\n    "limit": 10,\n    "total": 150,\n    "has_more": true\n  }\n}`,
      example: `curl -X GET "https://api.yourplatform.com/v1/users?page=1&limit=10" \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json"`
    },
    {
      method: 'POST', path: '/api/v1/users', description: 'Create a new user', auth: true,
      parameters: [
        { name: 'email', type: 'string', required: true, description: 'User email address' },
        { name: 'name', type: 'string', required: true, description: 'User full name' },
        { name: 'role', type: 'string', required: false, description: 'User role (default: user)' }
      ],
      response: `{\n  "data": {\n    "id": "user_124",\n    "email": "newuser@example.com",\n    "name": "Jane Smith",\n    "role": "user",\n    "status": "active",\n    "created_at": "2024-01-15T11:00:00Z"\n  }\n}`,
      example: `curl -X POST "https://api.yourplatform.com/v1/users" \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "email": "newuser@example.com",\n    "name": "Jane Smith",\n    "role": "user"\n  }'`
    },
    {
      method: 'GET', path: '/api/v1/data', description: 'Retrieve data with filters', auth: true,
      parameters: [
        { name: 'type', type: 'string', required: false, description: 'Data type filter' },
        { name: 'status', type: 'string', required: false, description: 'Status filter (active, inactive)' },
        { name: 'date_from', type: 'string', required: false, description: 'Start date filter (ISO 8601)' },
        { name: 'date_to', type: 'string', required: false, description: 'End date filter (ISO 8601)' }
      ],
      response: `{\n  "data": [\n    {\n      "id": "data_123",\n      "type": "analytics",\n      "value": 12500,\n      "status": "active",\n      "timestamp": "2024-01-15T10:30:00Z"\n    }\n  ],\n  "meta": {\n    "total_records": 45,\n    "filtered_records": 12,\n    "processing_time_ms": 156\n  }\n}`,
      example: `curl -X GET "https://api.yourplatform.com/v1/data?type=analytics&status=active" \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json"`
    }
  ];

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'GET': return 'bg-green-100 text-green-800 border-green-200';
      case 'POST': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'PUT': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'DELETE': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="max-w-4xl space-y-8">
      <div className="space-y-4">
        <div className="flex items-center space-x-2 text-sm text-slate-500">
          <span>{t('apiEndpoints.breadcrumbDocs')}</span>
          <span>/</span>
          <span>{t('apiEndpoints.breadcrumbApiRef')}</span>
          <span>/</span>
          <span className="text-slate-900">{t('apiEndpoints.breadcrumbEndpoints')}</span>
        </div>
        <h1 className="text-4xl font-bold text-slate-900">{t('apiEndpoints.title')}</h1>
        <p className="text-xl text-slate-600">{t('apiEndpoints.subtitle')}</p>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
        <div className="flex items-center mb-3">
          <Globe className="w-5 h-5 text-slate-600 mr-2" />
          <h3 className="text-lg font-semibold text-slate-900">{t('apiEndpoints.baseUrl')}</h3>
        </div>
        <div className="bg-slate-900 rounded p-3">
          <code className="text-green-400 font-mono">https://api.yourplatform.com</code>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-center mb-3">
          <Lock className="w-5 h-5 text-blue-600 mr-2" />
          <h3 className="text-lg font-semibold text-blue-900">{t('apiEndpoints.authentication')}</h3>
        </div>
        <p className="text-blue-800 mb-3">{t('apiEndpoints.authDesc')}</p>
        <div className="bg-slate-900 rounded p-3">
          <code className="text-green-400 font-mono text-sm">Authorization: Bearer YOUR_API_KEY</code>
        </div>
      </div>

      <div className="space-y-8">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center">
          <Zap className="w-6 h-6 mr-3 text-blue-600" />
          {t('apiEndpoints.availableEndpoints')}
        </h2>

        {endpoints.map((endpoint, index) => (
          <div key={index} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <span className={`px-3 py-1 rounded-md text-sm font-medium border ${getMethodColor(endpoint.method)}`}>{endpoint.method}</span>
                  <code className="text-lg font-mono text-slate-900">{endpoint.path}</code>
                </div>
                {endpoint.auth && (
                  <div className="flex items-center text-sm text-orange-600">
                    <Lock className="w-4 h-4 mr-1" />
                    {t('apiEndpoints.authRequired')}
                  </div>
                )}
              </div>
              <p className="text-slate-600">{endpoint.description}</p>
            </div>

            <div className="p-6 space-y-6">
              {endpoint.parameters && endpoint.parameters.length > 0 && (
                <div>
                  <h4 className="text-lg font-semibold text-slate-900 mb-3">{t('apiEndpoints.parameters')}</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-2 font-medium text-slate-900">{t('apiEndpoints.name')}</th>
                          <th className="text-left py-2 font-medium text-slate-900">{t('apiEndpoints.type')}</th>
                          <th className="text-left py-2 font-medium text-slate-900">{t('apiEndpoints.required')}</th>
                          <th className="text-left py-2 font-medium text-slate-900">{t('apiEndpoints.description')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {endpoint.parameters.map((param, paramIndex) => (
                          <tr key={paramIndex} className="border-b border-slate-100">
                            <td className="py-2 font-mono text-blue-600">{param.name}</td>
                            <td className="py-2 text-slate-600">{param.type}</td>
                            <td className="py-2">
                              <span className={`px-2 py-1 rounded text-xs ${param.required ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
                                {param.required ? t('apiEndpoints.required') : t('apiEndpoints.optional')}
                              </span>
                            </td>
                            <td className="py-2 text-slate-600">{param.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-lg font-semibold text-slate-900 mb-3">{t('apiEndpoints.exampleRequest')}</h4>
                <div className="bg-slate-900 rounded-lg p-4 relative">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <Code className="w-4 h-4 text-blue-400" />
                      <span className="text-slate-300 text-sm">cURL</span>
                    </div>
                    <button onClick={() => copyToClipboard(endpoint.example, `example-${index}`)} className="flex items-center space-x-1 text-slate-400 hover:text-white transition-colors">
                      {copiedCode === `example-${index}` ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                      <span className="text-sm">Copy</span>
                    </button>
                  </div>
                  <pre className="text-slate-300 font-mono text-sm overflow-x-auto"><code>{endpoint.example}</code></pre>
                </div>
              </div>

              <div>
                <h4 className="text-lg font-semibold text-slate-900 mb-3">{t('apiEndpoints.exampleResponse')}</h4>
                <div className="bg-slate-900 rounded-lg p-4 relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-300 text-sm">JSON</span>
                    <button onClick={() => copyToClipboard(endpoint.response, `response-${index}`)} className="flex items-center space-x-1 text-slate-400 hover:text-white transition-colors">
                      {copiedCode === `response-${index}` ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                      <span className="text-sm">Copy</span>
                    </button>
                  </div>
                  <pre className="text-slate-300 font-mono text-sm overflow-x-auto"><code>{endpoint.response}</code></pre>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="text-xl font-bold text-slate-900 mb-4">{t('apiEndpoints.commonErrorCodes')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex justify-between"><code className="text-red-600 font-mono">400</code><span className="text-slate-600">{t('apiEndpoints.badRequest')}</span></div>
            <div className="flex justify-between"><code className="text-red-600 font-mono">401</code><span className="text-slate-600">{t('apiEndpoints.unauthorized')}</span></div>
            <div className="flex justify-between"><code className="text-red-600 font-mono">403</code><span className="text-slate-600">{t('apiEndpoints.forbidden')}</span></div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between"><code className="text-red-600 font-mono">404</code><span className="text-slate-600">{t('apiEndpoints.notFound')}</span></div>
            <div className="flex justify-between"><code className="text-red-600 font-mono">429</code><span className="text-slate-600">{t('apiEndpoints.rateLimited')}</span></div>
            <div className="flex justify-between"><code className="text-red-600 font-mono">500</code><span className="text-slate-600">{t('apiEndpoints.serverError')}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiEndpoints;
