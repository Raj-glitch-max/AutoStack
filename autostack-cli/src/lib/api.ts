import { getCredentials } from './auth';

const API_BASE = process.env.AUTOSTACK_API_URL || 'http://localhost:54321/functions/v1';

export const apiClient = async (path: string, options: RequestInit = {}) => {
  let creds = getCredentials();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  };

  if (creds?.access_token) {
    headers['Authorization'] = `Bearer ${creds.access_token}`;
  }

  let response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errObj = await response.json().catch(() => ({}));
    throw new Error(errObj.error || `API Error: ${response.statusText}`);
  }

  return response.json();
};
