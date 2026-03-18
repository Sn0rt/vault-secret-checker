import { NextRequest, NextResponse } from 'next/server';
import { serverDebug, serverError, serverLog } from '@/lib/server-logger';
import { lookupVaultToken } from '@/lib/vault-auth';
import { requireAllowedVaultEndpoint } from '@/lib/vault-config';

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();

  serverLog(`[LOOKUP-${requestId}] Token lookup request started.`);

  try {
    const body = await request.json();
    const { endpoint, token } = body;

    serverDebug(`[LOOKUP-${requestId}] Request parameters:`, {
      endpoint,
      hasToken: !!token,
      tokenLength: token ? token.length : 0,
      hasBody: !!body
    });

    if (!endpoint || !token) {
      serverDebug(`[LOOKUP-${requestId}] Validation failed: Missing required fields`);
      return NextResponse.json(
        { success: false, error: 'Missing required fields: endpoint, token' },
        { status: 400 }
      );
    }

    let vaultUrl: string;
    try {
      vaultUrl = requireAllowedVaultEndpoint(endpoint);
    } catch {
      serverDebug(`[LOOKUP-${requestId}] Validation failed: Endpoint not allowed`, { endpoint });
      return NextResponse.json(
        { success: false, error: 'Vault endpoint is not allowed.' },
        { status: 400 }
      );
    }

    const lookupUrl = `${vaultUrl}/v1/auth/token/lookup-self`;

    serverDebug(`[LOOKUP-${requestId}] Making Vault lookup request to: ${lookupUrl}`);

    const result = await lookupVaultToken(vaultUrl, token);

    serverLog(`[LOOKUP-${requestId}] Vault lookup successful.`);
    serverDebug(`[LOOKUP-${requestId}] Token info:`, {
      id: result.data?.id ? `${result.data.id.substring(0, 8)}...` : undefined,
      ttl: result.data?.ttl,
      renewable: result.data?.renewable,
      policies: result.data?.policies,
      entityId: result.data?.entity_id ? `${result.data.entity_id.substring(0, 8)}...` : undefined
    });

    const duration = Date.now() - startTime;
    serverLog(`[LOOKUP-${requestId}] Token lookup request completed successfully in ${duration}ms.`);

    return NextResponse.json(result);

  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    serverError(`[LOOKUP-${requestId}] Request failed after ${duration}ms:`, errorMessage);

    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response: { status: number; statusText: string; data: unknown } };
      serverDebug(`[LOOKUP-${requestId}] Axios error details:`, {
        status: axiosError.response.status,
        statusText: axiosError.response.statusText,
        data: axiosError.response.data
      });

      return NextResponse.json({
        success: false,
        error: `Token lookup failed: ${axiosError.response.status} ${axiosError.response.statusText}`,
        details: axiosError.response.data
      }, { status: axiosError.response.status });
    }

    return NextResponse.json({
      success: false,
      error: `Network error: ${errorMessage}`
    }, { status: 500 });
  }
}
