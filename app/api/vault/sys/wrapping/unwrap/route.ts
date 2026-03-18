import { NextRequest, NextResponse } from 'next/server';
import { axiosInstance } from '@/lib/axios';
import { serverDebug, serverError, serverLog, serverWarn } from '@/lib/server-logger';
import { sendUnwrapNotification } from '@/lib/email';
import { requireAllowedVaultEndpoint } from '@/lib/vault-config';

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();

  serverLog(`[UNWRAP-${requestId}] Unwrap request started.`);

  let notificationEmail = ''; // Store this at the top level for error handling

  try {
    const body = await request.json();
    const { endpoint, wrappedToken, notificationEmail: bodyNotificationEmail } = body;
    notificationEmail = bodyNotificationEmail; // Store for error handling

    serverDebug(`[UNWRAP-${requestId}] Request parameters:`, {
      endpoint,
      hasWrappedToken: !!wrappedToken,
      wrappedTokenLength: wrappedToken ? wrappedToken.length : 0,
      notificationEmail: bodyNotificationEmail,
      hasBody: !!body
    });

    if (!endpoint || !wrappedToken) {
      serverDebug(`[UNWRAP-${requestId}] Validation failed: Missing required fields`);
      return NextResponse.json(
        { success: false, error: 'Missing required fields: endpoint, wrappedToken' },
        { status: 400 }
      );
    }

    let vaultUrl: string;
    try {
      vaultUrl = requireAllowedVaultEndpoint(endpoint);
    } catch {
      serverDebug(`[UNWRAP-${requestId}] Validation failed: Endpoint not allowed`, { endpoint });
      return NextResponse.json(
        { success: false, error: 'Vault endpoint is not allowed.' },
        { status: 400 }
      );
    }

    const unwrapUrl = `${vaultUrl}/v1/sys/wrapping/unwrap`;

    const payload: { token?: string } = {};
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // For wrapped token unwrapping, we can either:
    // 1. Use X-Vault-Token header with the wrapped token
    // 2. Or send the token in the request body
    // Vault documentation suggests using the header approach
    headers['X-Vault-Token'] = wrappedToken;

    serverDebug(`[UNWRAP-${requestId}] Making Vault unwrap request to: ${unwrapUrl}`);

    const response = await axiosInstance.post(unwrapUrl, payload, {
      timeout: 10000,
      headers
    });

    serverLog(`[UNWRAP-${requestId}] Vault unwrap successful.`, { status: response.status });

    const duration = Date.now() - startTime;
    serverLog(`[UNWRAP-${requestId}] Unwrap request completed successfully in ${duration}ms.`);

    // Send notification email if provided
    if (notificationEmail) {
      serverLog(`[UNWRAP-${requestId}] Scheduling notification email delivery.`);
      serverDebug(`[UNWRAP-${requestId}] Sending notification email to: ${notificationEmail}`);
      
      // Send notification asynchronously (don't block the response)
      sendUnwrapNotification(notificationEmail, {
        timestamp: new Date().toISOString(),
        endpoint: vaultUrl,
        success: true,
        userAgent: request.headers.get('user-agent') || undefined,
        ipAddress: request.headers.get('x-forwarded-for') || 
                  request.headers.get('x-real-ip') || 
                  'unknown',
        response: response.data // Include the actual response data
      }).catch(error => {
        serverWarn(`[UNWRAP-${requestId}] Notification email delivery failed.`, error);
      });
    }

    return NextResponse.json(response.data);

  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    serverError(`[UNWRAP-${requestId}] Request failed after ${duration}ms:`, errorMessage);

    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response: { status: number; statusText: string; data: unknown } };
      serverDebug(`[UNWRAP-${requestId}] Axios error details:`, {
        status: axiosError.response.status,
        statusText: axiosError.response.statusText,
        data: axiosError.response.data
      });

      // Send failure notification email if provided
      if (notificationEmail) {
        sendUnwrapNotification(notificationEmail, {
          timestamp: new Date().toISOString(),
          endpoint: request.url,
          success: false,
          userAgent: request.headers.get('user-agent') || undefined,
          ipAddress: request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown',
          response: {
            error: `Token unwrap failed: ${axiosError.response.status} ${axiosError.response.statusText}`,
            details: axiosError.response.data,
            status: axiosError.response.status,
            statusText: axiosError.response.statusText
          }
        }).catch(emailError => {
          serverWarn(`[UNWRAP-${requestId}] Failure notification email delivery failed.`, emailError);
        });
      }

      return NextResponse.json({
        success: false,
        error: `Token unwrap failed: ${axiosError.response.status} ${axiosError.response.statusText}`,
        details: axiosError.response.data
      }, { status: axiosError.response.status });
    }

    // Send failure notification email for network errors
    if (notificationEmail) {
      sendUnwrapNotification(notificationEmail, {
        timestamp: new Date().toISOString(),
        endpoint: request.url,
        success: false,
        userAgent: request.headers.get('user-agent') || undefined,
        ipAddress: request.headers.get('x-forwarded-for') || 
                  request.headers.get('x-real-ip') || 
                  'unknown',
        response: {
          error: `Network error: ${errorMessage}`,
          type: 'network_error'
        }
      }).catch(emailError => {
        serverWarn(`[UNWRAP-${requestId}] Failure notification email delivery failed.`, emailError);
      });
    }

    return NextResponse.json({
      success: false,
      error: `Network error: ${errorMessage}`
    }, { status: 500 });
  }
}
