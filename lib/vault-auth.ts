import { axiosInstance } from '@/lib/axios';

export interface VaultTokenLookupResponse {
  data?: {
    id?: string;
    ttl?: number;
    renewable?: boolean;
    policies?: string[];
    entity_id?: string;
    meta?: Record<string, unknown>;
    role_name?: string;
    display_name?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export function normalizeVaultEndpoint(endpoint: string): string {
  return endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
}

export async function lookupVaultToken(
  endpoint: string,
  token: string
): Promise<VaultTokenLookupResponse> {
  const vaultUrl = normalizeVaultEndpoint(endpoint);
  const lookupUrl = `${vaultUrl}/v1/auth/token/lookup-self`;

  const response = await axiosInstance.get<VaultTokenLookupResponse>(lookupUrl, {
    timeout: 10000,
    headers: {
      'X-Vault-Token': token,
      'Content-Type': 'application/json'
    }
  });

  return response.data;
}
