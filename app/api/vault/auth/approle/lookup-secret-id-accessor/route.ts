import axios from 'axios';
import { NextRequest, NextResponse } from 'next/server';
import { axiosInstance } from '@/lib/axios';
import { serverDebug, serverError, serverLog, serverWarn } from '@/lib/server-logger';
import { lookupVaultToken } from '@/lib/vault-auth';
import { requireAllowedVaultEndpoint } from '@/lib/vault-config';

interface LookupSecretIdAccessorRequest {
  endpoint?: string;
  secretIdAccessor?: string;
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
  let requestStage: 'lookup-role' | 'lookup-secret-id-accessor' = 'lookup-role';
  let resolvedRoleName: string | null = null;
  let requestedAccessor: string | null = null;

  try {
    const { endpoint, secretIdAccessor }: LookupSecretIdAccessorRequest = await req.json();
    const vaultAddress = endpoint || process.env.VAULT_ADDR;
    const token = req.headers.get('x-vault-token');
    requestedAccessor = secretIdAccessor?.trim() || null;

    if (!token) {
      return NextResponse.json({ error: 'Vault token is required.' }, { status: 401 });
    }

    if (!vaultAddress) {
      return NextResponse.json({ error: 'Vault endpoint is required.' }, { status: 400 });
    }

    if (!requestedAccessor) {
      return NextResponse.json({ error: 'Secret ID accessor is required.' }, { status: 400 });
    }

    let vaultUrl: string;
    try {
      vaultUrl = requireAllowedVaultEndpoint(vaultAddress);
    } catch {
      return NextResponse.json({ error: 'Vault endpoint is not allowed.' }, { status: 400 });
    }

    const lookupUrl = `${vaultUrl}/v1/auth/token/lookup-self`;
    serverLog('[lookup-secret-id-accessor] Accessor metadata lookup started.', {
      lookupUrl,
      hasAccessor: !!requestedAccessor,
    });

    const lookupResponse = await lookupVaultToken(vaultUrl, token);
    const roleName = resolveRoleName(lookupResponse);
    resolvedRoleName = roleName;

    serverDebug('[lookup-secret-id-accessor] Role resolved from token metadata.', { roleName });

    if (!roleName) {
      serverWarn('[lookup-secret-id-accessor] Unable to resolve role name from token lookup response.');
      return NextResponse.json({ error: 'Unable to resolve AppRole name from the current token.' }, { status: 400 });
    }

    requestStage = 'lookup-secret-id-accessor';
    const accessorLookupUrl = `${vaultUrl}/v1/auth/approle/role/${encodeURIComponent(roleName)}/secret-id-accessor/lookup`;
    serverLog('[lookup-secret-id-accessor] Looking up Secret ID accessor metadata.', {
      accessorLookupUrl,
      roleName,
    });

    const response = await axiosInstance.post(
      accessorLookupUrl,
      { secret_id_accessor: requestedAccessor },
      {
        headers: {
          'X-Vault-Token': token,
          'Content-Type': 'application/json',
        },
      }
    );

    serverLog('[lookup-secret-id-accessor] Accessor metadata lookup completed.', {
      roleName,
      accessor: requestedAccessor,
    });

    return NextResponse.json({
      success: true,
      roleName,
      accessor: requestedAccessor,
      metadata: response.data?.data ?? response.data,
      raw: response.data,
    });
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      const status = error.response.status;
      const statusText = error.response.statusText;
      const responseData = error.response.data as { errors?: unknown };
      const isPermissionDenied =
        Array.isArray(responseData?.errors) &&
        responseData.errors.some((item: unknown) => typeof item === 'string' && item.toLowerCase().includes('permission denied'));

      let message = `Vault request failed: ${status} ${statusText}`;
      if (status === 403 && isPermissionDenied && requestStage === 'lookup-role') {
        message = 'The current Vault token cannot look up its own metadata. Grant access to auth/token/lookup-self.';
      } else if (status === 403 && isPermissionDenied && requestStage === 'lookup-secret-id-accessor') {
        message = `The current Vault token is not allowed to look up Secret ID accessor metadata for AppRole '${resolvedRoleName || 'unknown'}'. Grant update access to auth/approle/role/${resolvedRoleName || '<role-name>'}/secret-id-accessor/lookup.`;
      }

      serverError('[lookup-secret-id-accessor] Vault request failed.', {
        stage: requestStage,
        roleName: resolvedRoleName,
        accessor: requestedAccessor,
        status,
        statusText,
        data: error.response.data,
      });

      return NextResponse.json({
        error: message,
        stage: requestStage,
        roleName: resolvedRoleName,
        accessor: requestedAccessor,
        details: error.response.data,
      }, { status });
    }

    const message = error instanceof Error ? error.message : 'Internal server error';
    serverError('[lookup-secret-id-accessor] Request failed.', {
      stage: requestStage,
      roleName: resolvedRoleName,
      accessor: requestedAccessor,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
