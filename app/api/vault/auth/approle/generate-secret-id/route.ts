import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { parseEmailAddresses, sendEmail } from '@/lib/email';
import { axiosInstance } from '@/lib/axios';
import { serverDebug, serverError, serverWarn } from '@/lib/server-logger';
import { lookupVaultToken } from '@/lib/vault-auth';
import { requireAllowedVaultEndpoint } from '@/lib/vault-config';

interface GenerateSecretIdRequest {
  email?: string;
  endpoint?: string;
  roleId?: string;
}

const DEFAULT_GENERATE_SECRET_ID_PATH = '/v1/auth/approle/role/{approle}/secret-id';

function buildGenerateSecretIdUrl(vaultUrl: string, roleName: string) {
  const overridePath = process.env.VAULT_V1_GENERATE_SECRET_ID?.trim();
  const configuredPath = overridePath || DEFAULT_GENERATE_SECRET_ID_PATH;
  const resolvedPath = configuredPath.replace('{approle}', encodeURIComponent(roleName));

  return {
    overridePath: overridePath || null,
    configuredPath,
    secretIdUrl: `${vaultUrl}${resolvedPath}`,
  };
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
  let requestStage: 'lookup-role' | 'generate-secret-id' = 'lookup-role';
  let resolvedRoleName: string | null = null;
  let activeGenerateSecretIdPath: string | null = null;
  let activeGenerateSecretIdUrl: string | null = null;

  try {
    const { email, endpoint, roleId }: GenerateSecretIdRequest = await req.json();
    const vaultAddress = endpoint || process.env.VAULT_ADDR;
    const token = req.headers.get('x-vault-token');
    const recipients = parseEmailAddresses(email || '');

    if (recipients.length === 0) {
      return NextResponse.json({ error: 'At least one valid recipient email is required.' }, { status: 400 });
    }

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
    serverDebug('[generate-secret-id] Looking up AppRole metadata.', { lookupUrl, recipientCount: recipients.length });

    const lookupResponse = await lookupVaultToken(vaultUrl, token);

    const roleName = resolveRoleName(lookupResponse);
    resolvedRoleName = roleName;
    serverDebug('[generate-secret-id] Role resolved from token metadata.', { roleNameFound: !!roleName });

    if (!roleName) {
      serverWarn('[generate-secret-id] Unable to resolve role name from token lookup response.');
      return NextResponse.json({ error: 'Unable to resolve AppRole name from the current token.' }, { status: 400 });
    }

    requestStage = 'generate-secret-id';
    const { overridePath, configuredPath, secretIdUrl } = buildGenerateSecretIdUrl(vaultUrl, roleName);
    activeGenerateSecretIdPath = configuredPath;
    activeGenerateSecretIdUrl = secretIdUrl;
    serverDebug('[generate-secret-id] Creating Secret ID.', {
      overridePath,
      configuredPath,
      usingOverride: !!overridePath,
      secretIdUrl,
      roleName,
    });

    const secretIdResponse = await axiosInstance.post(
      secretIdUrl,
      {},
      {
        headers: {
          'X-Vault-Token': token,
        },
      }
    );

    const secretId =
      secretIdResponse.data?.data?.secret_id ||
      secretIdResponse.data?.secret_id ||
      secretIdResponse.data?.data?.secretId ||
      secretIdResponse.data?.secretId;
    if (!secretId) {
      serverError('[generate-secret-id] Vault response did not include a secret ID.', {
        roleName,
        response: secretIdResponse.data
      });
      return NextResponse.json({ error: 'Vault did not return a Secret ID.' }, { status: 502 });
    }

    const generatedAt = new Date().toISOString();
    const subject = `Vault Secret ID Generated for AppRole ${roleName}`;
    const responseJson = JSON.stringify(secretIdResponse.data, null, 2);
    const secretIdAccessor =
      secretIdResponse.data?.data?.secret_id_accessor ||
      secretIdResponse.data?.secret_id_accessor ||
      secretIdResponse.data?.data?.secretIdAccessor ||
      secretIdResponse.data?.secretIdAccessor ||
      'Not provided';
    const secretIdTtl =
      secretIdResponse.data?.data?.secret_id_ttl ??
      secretIdResponse.data?.secret_id_ttl ??
      secretIdResponse.data?.data?.secretIdTtl ??
      secretIdResponse.data?.secretIdTtl ??
      'Not provided';
    const secretIdNumUses =
      secretIdResponse.data?.data?.secret_id_num_uses ??
      secretIdResponse.data?.secret_id_num_uses ??
      secretIdResponse.data?.data?.secretIdNumUses ??
      secretIdResponse.data?.secretIdNumUses ??
      'Not provided';
    const text = `A new Vault Secret ID has been generated.

AppRole: ${roleName}
AppRole Role ID: ${roleId || 'Not provided'}
Vault Endpoint: ${vaultUrl}
Generated At: ${generatedAt}
Secret ID Accessor: ${secretIdAccessor}
Secret ID TTL: ${secretIdTtl}
Secret ID Num Uses: ${secretIdNumUses}

Raw Vault Response:
${responseJson}

Store it securely and rotate any previous references if needed.`;

    const emailSent = await sendEmail({
      to: recipients,
      subject,
      text,
    });

    if (!emailSent) {
      serverError('[generate-secret-id] Secret ID created, but email delivery failed.', { recipientCount: recipients.length, roleName });
      return NextResponse.json({ error: 'Secret ID created, but email delivery failed.' }, { status: 502 });
    }

    serverDebug('[generate-secret-id] Secret ID generated and email sent.', { recipientCount: recipients.length, roleName });
    return NextResponse.json({ success: true });
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
        message = 'The current Vault token cannot look up its own metadata. Grant access to auth/token/lookup-self or skip role lookup.';
      } else if (status === 403 && isPermissionDenied && requestStage === 'generate-secret-id') {
        message = activeGenerateSecretIdPath && activeGenerateSecretIdPath !== DEFAULT_GENERATE_SECRET_ID_PATH
          ? `The current Vault token is not allowed to generate a Secret ID for AppRole '${resolvedRoleName || 'unknown'}' using the configured override path '${activeGenerateSecretIdPath}'.`
          : `The current Vault token is not allowed to generate a Secret ID for AppRole '${resolvedRoleName || 'unknown'}'. Grant access to auth/approle/role/${resolvedRoleName || '<role-name>'}/secret-id.`;
      }

      serverError('[generate-secret-id] Vault request failed.', {
        status,
        statusText,
        stage: requestStage,
        roleName: resolvedRoleName,
        secretIdUrl: activeGenerateSecretIdUrl,
        data: error.response.data
      });

      return NextResponse.json({
        error: message,
        stage: requestStage,
        roleName: resolvedRoleName,
        secretIdUrl: activeGenerateSecretIdUrl,
        details: error.response.data
      }, { status });
    }

    const message = error instanceof Error ? error.message : 'Internal server error';
    serverError('[generate-secret-id] Request failed.', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
