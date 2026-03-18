import { NextRequest, NextResponse } from 'next/server';
import { axiosInstance } from '@/lib/axios';
import { serverDebug, serverError, serverLog } from '@/lib/server-logger';
import { requireAllowedVaultEndpoint } from '@/lib/vault-config';
import * as k8s from '@kubernetes/client-node';

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();
  
  serverLog(`[LOGIN-${requestId}] Login request started.`);
  
  try {
    const body = await request.json();
    const {
      endpoint,
      accessId,
      k8sNamespace,
      k8sSecretName,
      secretKey
    } = body;

    serverDebug(`[LOGIN-${requestId}] Request parameters:`, {
      endpoint,
      accessId: accessId ? `${accessId.substring(0, 8)}...` : undefined,
      k8sNamespace,
      k8sSecretName,
      secretKey,
      hasBody: !!body
    });

    if (!endpoint || !accessId) {
      serverDebug(`[LOGIN-${requestId}] Validation failed: Missing required fields`);
      return NextResponse.json(
        { success: false, error: 'Missing required fields: endpoint, accessId' },
        { status: 400 }
      );
    }

    // For AppRole, always fetch secret from Kubernetes
    if (!k8sNamespace || !k8sSecretName || !secretKey) {
      serverDebug(`[LOGIN-${requestId}] Validation failed: Missing K8s secret fields`);
      return NextResponse.json(
        { success: false, error: 'Missing Kubernetes secret reference fields: namespace, secretName, secretKey' },
        { status: 400 }
      );
    }

    let finalAccessKey: string;

    // Fetch secret directly from Kubernetes (server-side only, no API call)
    serverDebug(`[LOGIN-${requestId}] Attempting to fetch secret from K8s:`, {
      namespace: k8sNamespace,
      secretName: k8sSecretName,
      secretKey
    });
    
    try {
      // Initialize Kubernetes client
      const kc = new k8s.KubeConfig();

      // Try to load from KUBECONFIG environment variable first, fallback to in-cluster
      try {
        if (process.env.KUBECONFIG) {
          serverDebug(`[LOGIN-${requestId}] Loading K8s config from KUBECONFIG: ${process.env.KUBECONFIG}`);
          kc.loadFromFile(process.env.KUBECONFIG);
        } else {
          serverDebug(`[LOGIN-${requestId}] Loading K8s config from in-cluster`);
          kc.loadFromCluster();
        }
      } catch (configError) {
        serverError(`[LOGIN-${requestId}] Failed to load Kubernetes config:`, configError);
        return NextResponse.json({
          success: false,
          error: 'Failed to initialize Kubernetes client. Ensure KUBECONFIG is set or running in cluster.'
        }, { status: 500 });
      }

      const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

      // Get the secret from Kubernetes
      serverDebug(`[LOGIN-${requestId}] Fetching secret from K8s API...`);
      const secret = await k8sApi.readNamespacedSecret({
        name: k8sSecretName,
        namespace: k8sNamespace
      });
      const secretData = secret.data;

      serverDebug(`[LOGIN-${requestId}] K8s secret fetched successfully, available keys:`, 
        secretData ? Object.keys(secretData) : 'none');

      if (!secretData || !secretData[secretKey]) {
        serverDebug(`[LOGIN-${requestId}] Secret key '${secretKey}' not found in secret data`);
        return NextResponse.json({
          success: false,
          error: `Secret key '${secretKey}' not found in secret '${k8sSecretName}' in namespace '${k8sNamespace}'`
        }, { status: 404 });
      }

      // Decode the base64 encoded secret value (stays on server)
      finalAccessKey = Buffer.from(secretData[secretKey], 'base64').toString('utf-8');
      serverDebug(`[LOGIN-${requestId}] Secret successfully decoded, length: ${finalAccessKey.length}`);

    } catch (k8sError: unknown) {
      serverError(`[LOGIN-${requestId}] Kubernetes secret fetch error:`, k8sError);

      // Handle structured Kubernetes API errors
      if (k8sError && typeof k8sError === 'object' && 'response' in k8sError) {
        const k8sApiError = k8sError as { response: { statusCode: number; statusMessage: string; body: unknown } };
        serverDebug(`[LOGIN-${requestId}] K8s API error details:`, {
          statusCode: k8sApiError.response.statusCode,
          statusMessage: k8sApiError.response.statusMessage,
          body: k8sApiError.response.body
        });

        if (k8sApiError.response.statusCode === 404) {
          return NextResponse.json({
            success: false,
            error: `Secret '${k8sSecretName}' not found in namespace '${k8sNamespace}'`
          }, { status: 404 });
        } else if (k8sApiError.response.statusCode === 403) {
          return NextResponse.json({
            success: false,
            error: `Access denied: insufficient permissions to read secrets in namespace '${k8sNamespace}'. Check RBAC configuration.`
          }, { status: 403 });
        } else if (k8sApiError.response.statusCode === 401) {
          return NextResponse.json({
            success: false,
            error: 'Authentication failed: invalid Kubernetes credentials'
          }, { status: 401 });
        }
      }

      // Handle network/connection errors
      const errorMessage = k8sError instanceof Error ? k8sError.message : 'Unknown Kubernetes error';
      if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ETIMEDOUT')) {
        return NextResponse.json({
          success: false,
          error: 'Unable to connect to Kubernetes API. Check cluster configuration.'
        }, { status: 503 });
      }

      // Fallback for other errors
      return NextResponse.json({
        success: false,
        error: `Failed to access Kubernetes secret: ${errorMessage}`
      }, { status: 500 });
    }

    // Validate that we have the final access key
    if (!finalAccessKey) {
      serverDebug(`[LOGIN-${requestId}] Final access key validation failed: empty or invalid`);
      return NextResponse.json(
        { success: false, error: `Secret key '${secretKey}' is empty or invalid in secret '${k8sSecretName}'` },
        { status: 400 }
      );
    }

    let vaultUrl: string;
    try {
      vaultUrl = requireAllowedVaultEndpoint(endpoint);
    } catch {
      serverDebug(`[LOGIN-${requestId}] Validation failed: Endpoint not allowed`, { endpoint });
      return NextResponse.json(
        { success: false, error: 'Vault endpoint is not allowed.' },
        { status: 400 }
      );
    }

    const loginUrl = `${vaultUrl}/v1/auth/approle/login`;

    serverDebug(`[LOGIN-${requestId}] Making Vault login request to: ${loginUrl}`);

    const loginPayload = {
      role_id: accessId,
      secret_id: finalAccessKey
    };

    const response = await axiosInstance.post(loginUrl, loginPayload, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    serverLog(`[LOGIN-${requestId}] Vault login successful.`, { status: response.status });
    serverDebug(`[LOGIN-${requestId}] Token received: ${!!response.data.auth?.client_token}, renewable: ${response.data.auth?.renewable}`);

    const duration = Date.now() - startTime;
    serverLog(`[LOGIN-${requestId}] Login request completed successfully in ${duration}ms.`);

    return NextResponse.json(response.data);

  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    serverError(`[LOGIN-${requestId}] Request failed after ${duration}ms:`, errorMessage);

    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response: { status: number; statusText: string; data: unknown } };
      serverDebug(`[LOGIN-${requestId}] Axios error details:`, {
        status: axiosError.response.status,
        statusText: axiosError.response.statusText,
        data: axiosError.response.data
      });
      
      return NextResponse.json({
        success: false,
        error: `Vault login failed: ${axiosError.response.status} ${axiosError.response.statusText}`,
        details: axiosError.response.data
      }, { status: axiosError.response.status });
    }

    return NextResponse.json({
      success: false,
      error: `Network error: ${errorMessage}`
    }, { status: 500 });
  }
}
