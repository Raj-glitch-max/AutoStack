// supabase/functions/_shared/providers/factory.ts

import { CloudProvider } from './interface.ts';
import { AWSProvider } from './aws/index.ts';
import { GCPProvider } from './gcp/index.ts';
import { AzureProvider } from './azure/index.ts';

/**
 * Returns the appropriate CloudProvider implementation.
 * @param provider 'aws' | 'gcp' | 'azure'
 * @param credentials Configuration from cloud_credentials table
 */
export function getProvider(
  provider: 'aws' | 'gcp' | 'azure',
  credentials: Record<string, string>
): CloudProvider {
  switch (provider) {
    case 'aws':
      return new AWSProvider(credentials);
    case 'gcp':
      return new GCPProvider(credentials);
    case 'azure':
      return new AzureProvider(credentials);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
