import { Method } from 'axios';
import { NextRequest, NextResponse } from 'next/server';
import { axiosInstance } from '@/lib/axios';
import { serverDebug, serverError, serverLog, serverWarn } from '@/lib/server-logger';
import { lookupVaultToken } from '@/lib/vault-auth';
import { requireAllowedVaultEndpoint } from '@/lib/vault-config';

interface ListSecretIdAccessorsRequest {
  endpoint?: string;
}

function resolveRoleName(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const data = 'data' in payload && payload.data && typeof payload.data === 'object'
    ? payload.data as Record<string, unknown>
    : null;

  if (!data) {
    return null;
  }

  const meta = data.meta && typeof data.meta === 'object'
    ? data.meta as Record<string, unknown>
    : null;

  const metaRoleName = typeof meta?.role_name === 'string' ? meta.role_name : null;
  if (metaRoleName) {
    return metaRoleName;
  }

  const directRoleName = typeof data.role_name === 'string' ? data.role_name : null;
  if (directRoleName) {
    return directRoleName;
  }

  const displayName = typeof data.display_name === 'string' ? data.display_name : null;
  if (!displayName) {
    return null;
  }

  return displayName.startsWith('approle-') ? displayName.slice('approle-'.length) : displayName;
}

export async function POST(req: NextRequest) {
  let requestStage: 'lookup-role' | 'list-secret-id-accessors' = 'lookup-role';
  let resolvedRoleName: string | null = null;

  try {
    const { endpoint }: ListSecretIdAccessorsRequest = await req.json();
    const vaultAddress = endpoint || process.env.VAULT_ADDR;
    const token = req.headers.get('x-vault-token');

    if (!token) {
      return NextResponse.json({ error: 'Vault token is required.' }, { status: 401 });
    }

    if (!vaultAddress) {
      return NextResponse.json({ error: 'Vault endpoint is required.' }, { status: 400 });
    }

    let vaultUrl: string;
    try {
      vaultUrl = requireAllowedVaultEndpoint(vaultAddress);
    } catch {
      return NextResponse.json({ error: 'Vault endpoint is not allowed.' }, { status: 400 });
    }

    const lookupUrl = `${vaultUrl}/v1/auth/token/lookup-self`;
    serverLog('[list-secret-id-accessors] Secret ID accessor listing request started.', { lookupUrl });

    const lookupResponse = await lookupVaultToken(vaultUrl, token);
    const roleName = resolveRoleName(lookupResponse);
    resolvedRoleName = roleName;

    serverDebug('[list-secret-id-accessors] Role resolved from token metadata.', { roleName });

    if (!roleName) {
      serverWarn('[list-secret-id-accessors] Unable to resolve role name from token lookup response.');
      return NextResponse.json({ error: 'Unable to resolve AppRole name from the current token.' }, { status: 400 });
    }

    requestStage = 'list-secret-id-accessors';
    const accessorsUrl = `${vaultUrl}/v1/auth/approle/role/${encodeURIComponent(roleName)}/secret-id`;
    serverLog('[list-secret-id-accessors] Listing Secret ID accessors.', { accessorsUrl, roleName });

    const response = await axiosInstance.request({
      url: accessorsUrl,
      method: 'LIST' as Method,
      headers: {
        'X-Vault-Token': token,
      },
    });

    const accessors = Array.isArray(response.data?.data?.keys) ? response.data.data.keys : [];
    serverLog('[list-secret-id-accessors] Secret ID accessor listing completed.', { roleName, accessorCount: accessors.length });
    return NextResponse.json({
      success: true,
      roleName,
      accessors,
      raw: response.data,
    });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response: { status: number; statusText: string; data: unknown } };
      let message = `Vault request failed: ${axiosError.response.status} ${axiosError.response.statusText}`;

      const responseData = axiosError.response.data as { errors?: unknown };
      const isPermissionDenied =
        Array.isArray(responseData?.errors) &&
        responseData.errors.some((item: unknown) => typeof item === 'string' && item.toLowerCase().includes('permission denied'));

      if (axiosError.response.status === 403 && isPermissionDenied && requestStage === 'lookup-role') {
        message = 'The current Vault token cannot look up its own metadata. Grant access to auth/token/lookup-self.';
      } else if (axiosError.response.status === 403 && isPermissionDenied && requestStage === 'list-secret-id-accessors') {
        message = `The current Vault token is not allowed to list Secret ID accessors for AppRole '${resolvedRoleName || 'unknown'}'. Grant list access to auth/approle/role/${resolvedRoleName || '<role-name>'}/secret-id.`;
      }

      serverError('[list-secret-id-accessors] Vault request failed.', {
        stage: requestStage,
        roleName: resolvedRoleName,
        status: axiosError.response.status,
        statusText: axiosError.response.statusText,
        data: axiosError.response.data,
      });

      return NextResponse.json({
        error: message,
        stage: requestStage,
        roleName: resolvedRoleName,
        details: axiosError.response.data,
      }, { status: axiosError.response.status });
    }

    const message = error instanceof Error ? error.message : 'Internal server error';
    serverError('[list-secret-id-accessors] Request failed.', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
