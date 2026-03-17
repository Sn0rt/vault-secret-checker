import { NextRequest, NextResponse } from 'next/server';
import { axiosInstance } from '@/lib/axios';
import { serverDebug, serverError } from '@/lib/server-logger';
import { requireAllowedVaultEndpoint } from '@/lib/vault-config';

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();

  serverDebug(`[REVOKE-${requestId}] Request started at ${new Date().toISOString()}`);

  try {
    const body = await request.json();
    const { endpoint, token } = body;

    serverDebug(`[REVOKE-${requestId}] Request parameters:`, {
      endpoint,
      hasToken: !!token,
      tokenLength: token ? token.length : 0,
      hasBody: !!body
    });

    if (!endpoint || !token) {
      serverDebug(`[REVOKE-${requestId}] Validation failed: Missing required fields`);
      return NextResponse.json(
        { success: false, error: 'Missing required fields: endpoint, token' },
        { status: 400 }
      );
    }

    let vaultUrl: string;
    try {
      vaultUrl = requireAllowedVaultEndpoint(endpoint);
    } catch {
      serverDebug(`[REVOKE-${requestId}] Validation failed: Endpoint not allowed`, { endpoint });
      return NextResponse.json(
        { success: false, error: 'Vault endpoint is not allowed.' },
        { status: 400 }
      );
    }

    const revokeUrl = `${vaultUrl}/v1/auth/token/revoke-self`;

    serverDebug(`[REVOKE-${requestId}] Making Vault revoke request to: ${revokeUrl}`);

    const response = await axiosInstance.post(revokeUrl, {}, {
      timeout: 10000,
      headers: {
        'X-Vault-Token': token,
        'Content-Type': 'application/json'
      }
    });

    serverDebug(`[REVOKE-${requestId}] Vault revoke successful, response status: ${response.status}`);

    const duration = Date.now() - startTime;
    serverDebug(`[REVOKE-${requestId}] Request completed successfully in ${duration}ms`);

    return NextResponse.json(response.data);

  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    serverError(`[REVOKE-${requestId}] Request failed after ${duration}ms:`, errorMessage);

    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response: { status: number; statusText: string; data: unknown } };
      serverDebug(`[REVOKE-${requestId}] Axios error details:`, {
        status: axiosError.response.status,
        statusText: axiosError.response.statusText,
        data: axiosError.response.data
      });

      return NextResponse.json({
        success: false,
        error: `Token revoke failed: ${axiosError.response.status} ${axiosError.response.statusText}`,
        details: axiosError.response.data
      }, { status: axiosError.response.status });
    }

    return NextResponse.json({
      success: false,
      error: `Network error: ${errorMessage}`
    }, { status: 500 });
  }
}
