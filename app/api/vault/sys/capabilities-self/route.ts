import { NextRequest, NextResponse } from 'next/server';
import { axiosInstance } from '@/lib/axios';
import { serverDebug, serverError } from '@/lib/server-logger';
import { requireAllowedVaultEndpoint } from '@/lib/vault-config';

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();

  serverDebug(`[VALIDATE-${requestId}] Request started at ${new Date().toISOString()}`);

  try {
    const body = await request.json();
    const { endpoint, token, secretPath } = body;

    serverDebug(`[VALIDATE-${requestId}] Request parameters:`, {
      endpoint,
      hasToken: !!token,
      tokenLength: token ? token.length : 0,
      secretPath,
      hasBody: !!body
    });

    if (!endpoint || !token || !secretPath) {
      serverDebug(`[VALIDATE-${requestId}] Validation failed: Missing required fields`);
      return NextResponse.json(
        { success: false, error: 'Missing required fields: endpoint, token, secretPath' },
        { status: 400 }
      );
    }

    let vaultUrl: string;
    try {
      vaultUrl = requireAllowedVaultEndpoint(endpoint);
    } catch {
      serverDebug(`[VALIDATE-${requestId}] Validation failed: Endpoint not allowed`, { endpoint });
      return NextResponse.json(
        { success: false, error: 'Vault endpoint is not allowed.' },
        { status: 400 }
      );
    }

    // Build the path for capabilities check - use secretPath directly
    const pathForCheck = secretPath.startsWith('/') ? secretPath.substring(1) : secretPath;
    serverDebug(`[VALIDATE-${requestId}] Using path for capabilities check: ${secretPath} -> ${pathForCheck}`);

    const capabilitiesUrl = `${vaultUrl}/v1/sys/capabilities-self`;

    serverDebug(`[VALIDATE-${requestId}] Making Vault capabilities request to: ${capabilitiesUrl}`);
    serverDebug(`[VALIDATE-${requestId}] Request payload:`, { path: pathForCheck });

    const response = await axiosInstance.post(capabilitiesUrl, {
      path: pathForCheck
    }, {
      timeout: 10000,
      headers: {
        'X-Vault-Token': token,
        'Content-Type': 'application/json'
      }
    });

    serverDebug(`[VALIDATE-${requestId}] Vault capabilities request successful, response status: ${response.status}`);

    const duration = Date.now() - startTime;
    serverDebug(`[VALIDATE-${requestId}] Request completed successfully in ${duration}ms`);

    return NextResponse.json(response.data);

  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    serverError(`[VALIDATE-${requestId}] Request failed after ${duration}ms:`, errorMessage);

    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response: { status: number; statusText: string; data: unknown } };
      serverDebug(`[VALIDATE-${requestId}] Axios error details:`, {
        status: axiosError.response.status,
        statusText: axiosError.response.statusText,
        data: axiosError.response.data
      });

      return NextResponse.json({
        success: false,
        error: `Permission validation failed: ${axiosError.response.status} ${axiosError.response.statusText}`,
        details: axiosError.response.data
      }, { status: axiosError.response.status });
    }

    return NextResponse.json({
      success: false,
      error: `Network error: ${errorMessage}`
    }, { status: 500 });
  }
}
