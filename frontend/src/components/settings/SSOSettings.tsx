import React, { useState, useEffect } from 'react';

// STUB IMPORTS FOR DEMONSTRATION
// import { supabase } from '@/lib/supabaseClient';
// import { Button, Input, Switch, Select } from '@/components/ui';

export default function SSOSettings() {
  const [protocol, setProtocol] = useState<'saml' | 'oidc'>('saml');
  const [config, setConfig] = useState<any>({
    status: 'inactive',
    enforced: false,
    default_role: 'developer',
    allowed_domains: '',
    attribute_map: { email: 'email', firstName: 'first_name', groups: 'groups' }
  });
  const [loading, setLoading] = useState(false);

  // Computed based on context (mock for UI)
  const spEntityId = `https://autostack.io/saml/org-uuid-placeholder`;
  const spAcsUrl = `https://autostack.io/functions/v1/saml-callback?org_id=org-uuid-placeholder`;

  const handleSave = async () => {
    setLoading(true);
    // STUB: await supabase.from('sso_configurations').upsert({ org_id: currentOrg.id, protocol, ...config });
    setTimeout(() => {
      setLoading(false);
      alert('SSO Settings Saved Successfully');
    }, 1000);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8 bg-gray-50 rounded-xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Enterprise SSO Configuration</h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure single sign-on via SAML 2.0 or OpenID Connect (OIDC) for your organization.
        </p>
      </div>

      {/* Protocol Selector */}
      <div className="flex items-center space-x-4">
        <button
          onClick={() => setProtocol('saml')}
          className={`px-4 py-2 rounded-lg font-medium ${protocol === 'saml' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          SAML 2.0
        </button>
        <button
          onClick={() => setProtocol('oidc')}
          className={`px-4 py-2 rounded-lg font-medium ${protocol === 'oidc' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          OpenID Connect
        </button>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
        {protocol === 'saml' ? (
          <>
            <h3 className="text-lg font-bold">IdP Configuration (SAML)</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">IdP Entity ID</label>
                <input type="text" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" placeholder="https://idp.example.com/metadata" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">IdP SSO URL</label>
                <input type="text" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" placeholder="https://idp.example.com/sso" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">X.509 Certificate</label>
                <textarea className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border font-mono text-sm" rows={4} placeholder="-----BEGIN CERTIFICATE-----..."></textarea>
              </div>
            </div>

            <div className="mt-8 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h4 className="text-sm font-bold text-gray-900 mb-2">Your AutoStack SP Metadata</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Entity ID:</span>
                  <code className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{spEntityId}</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">ACS URL:</span>
                  <code className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{spAcsUrl}</code>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold">IdP Configuration (OIDC)</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Client ID</label>
                <input type="text" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Client Secret</label>
                <input type="password" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" placeholder="Will be stored securely in Vault" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Discovery URL</label>
                <input type="text" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" placeholder="https://.../.well-known/openid-configuration" />
              </div>
            </div>
          </>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
        <h3 className="text-lg font-bold">Attribute Mapping & Options</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email Field</label>
            <input type="text" defaultValue={config.attribute_map.email} className="mt-1 w-full rounded-md border-gray-300 shadow-sm p-2 border" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">First Name Field</label>
            <input type="text" defaultValue={config.attribute_map.firstName} className="mt-1 w-full rounded-md border-gray-300 shadow-sm p-2 border" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Allowed Email Domains (comma-separated)</label>
          <input type="text" placeholder="example.com, corp.example.com" className="mt-1 w-full rounded-md border-gray-300 shadow-sm p-2 border" />
        </div>

        <div className="flex items-center justify-between py-2 border-t border-gray-100 mt-4">
          <div>
            <h4 className="text-sm font-bold text-gray-900">Enforce SSO</h4>
            <p className="text-xs text-gray-500">Block standard email/password logins for users in this organization.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={config.enforced} onChange={e => setConfig({...config, enforced: e.target.checked})} />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </div>

      <div className="flex justify-end space-x-4">
        <button className="px-4 py-2 text-gray-700 font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
          Test Connection
        </button>
        <button onClick={handleSave} disabled={loading} className="px-6 py-2 text-white font-medium bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

    </div>
  );
}
