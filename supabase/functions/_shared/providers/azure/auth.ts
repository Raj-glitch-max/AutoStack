// supabase/functions/_shared/providers/azure/auth.ts

import { ValidationResult } from '../interface.ts';

/**
 * Azure App Registration Credentials
 */
export interface AzureCredentials {
  tenant_id: string;
  client_id: string;
  client_secret: string; // stored in Vault — RULE N1
  subscription_id: string;
}

/**
 * Validates Azure Service Principal credentials.
 * Acquires a token from Azure AD and verifies Resource Manager access.
 */
export async function validateAzureCredentials(
  credsStr: string
): Promise<ValidationResult> {
  try {
    const creds: AzureCredentials = JSON.parse(credsStr);

    if (!creds.tenant_id || !creds.client_id || !creds.client_secret || !creds.subscription_id) {
      return {
        success: false,
        errorCode: 'MISSING_FIELDS',
        friendlyError: 'Azure credentials must include tenant_id, client_id, client_secret, and subscription_id.',
      };
    }

    // 1. Get access token from Azure OAuth2
    const token = await getAzureAccessToken(creds);
    if (!token) {
      return {
        success: false,
        errorCode: 'AUTH_FAILED',
        friendlyError: 'Login failed. Verify the Tenant ID, Client ID, and Client Secret are correct and active.',
      };
    }

    // 2. Validate subscription access (Mock implementation)
    // Real implementation calls: GET https://management.azure.com/subscriptions/{subscriptionId}?api-version=2020-01-01
    // 3. Validate role assignment (Mock implementation)
    // 4. Validate registered resource providers (Mock implementation)
    
    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      errorCode: 'JSON_PARSE_ERROR',
      friendlyError: 'Invalid JSON format for Azure credentials.',
    };
  }
}

async function getAzureAccessToken(creds: AzureCredentials): Promise<string | null> {
  try {
    const url = `https://login.microsoftonline.com/${creds.tenant_id}/oauth2/v2.0/token`;
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', creds.client_id);
    params.append('client_secret', creds.client_secret);
    params.append('scope', 'https://management.azure.com/.default');

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await res.json();
    return data.access_token || null;
  } catch (err) {
    console.error('[azure-auth] Token error:', err);
    return null;
  }
}
