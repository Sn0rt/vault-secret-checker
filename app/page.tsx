'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import JsonView from '@uiw/react-json-view';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getVaultEndpoints, getAppTitle, type ConfigResponse } from '@/lib/vault-config';
import { EndpointList } from '@/components/EndpointList';
import { AuthenticationMethod } from '@/components/AuthenticationMethod';
import { PermissionValidation } from '@/components/PermissionValidation';
import { WrappingTab } from '@/components/WrappingTab';

interface VaultCredentials {
  endpoint: string;
  accessId: string;
  secretPath: string;
  authMethod: 'approle';
  k8sNamespace: string; // Kubernetes namespace
  k8sSecretName: string; // Kubernetes secret name
  secretKey: string; // Key name within the Kubernetes secret
}

interface UnwrapCredentials {
  wrappedToken: string;
  notificationEmail?: string;
}

// Custom hook for localStorage persistence
function useLocalStorage(key: string, initialValue: string) {
  const [storedValue, setStoredValue] = useState<string>(initialValue);

  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        setStoredValue(item);
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
    }
  }, [key]);

  const setValue = (value: string) => {
    try {
      setStoredValue(value);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, value);
      }
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue] as const;
}

export default function Home() {
  // Get default title (will be overridden by config API)
  const defaultAppTitle = getAppTitle();
  const [appTitle, setAppTitle] = useState<string>(defaultAppTitle);

  // Get endpoints from environment variable
  const vaultEndpoints = getVaultEndpoints();
  const defaultEndpoint = vaultEndpoints[0];

  const [availableEndpoints, setAvailableEndpoints] = useState<string[]>(vaultEndpoints);
  const [availableNamespaces, setAvailableNamespaces] = useState<string[]>(['default']);
  const [emailConfigured, setEmailConfigured] = useState<boolean>(false);
  const [endpoint, setEndpoint] = useState<string>('');

  // Use localStorage for non-sensitive fields
  const [storedEndpoint, setStoredEndpoint] = useLocalStorage('vault-endpoint', defaultEndpoint);
  const [storedAccessId, setStoredAccessId] = useLocalStorage('vault-accessId', '');
  const [storedSecretPath, setStoredSecretPath] = useLocalStorage('vault-secretPath', '');
  const [storedK8sNamespace, setStoredK8sNamespace] = useLocalStorage('vault-k8sNamespace', '');
  const [storedK8sSecretName, setStoredK8sSecretName] = useLocalStorage('vault-k8sSecretName', '');
  const [storedSecretKey, setStoredSecretKey] = useLocalStorage('vault-secretKey', 'secret-id');

  const [credentials, setCredentials] = useState<VaultCredentials>({
    endpoint: storedEndpoint || defaultEndpoint,
    accessId: storedAccessId,
    secretPath: storedSecretPath,
    authMethod: 'approle',
    k8sNamespace: storedK8sNamespace,
    k8sSecretName: storedK8sSecretName,
    secretKey: storedSecretKey
  });

  // Initialize endpoint state
  useEffect(() => {
    setEndpoint(storedEndpoint || defaultEndpoint);
  }, [storedEndpoint, defaultEndpoint]);

  const [loading, setLoading] = useState<{
    login?: boolean;
    lookup?: boolean;
    logout?: boolean;
    unwrap?: boolean;
    validateAccess?: boolean;
  }>({});

  const [token, setToken] = useState<string>('');

  const [unwrapCredentials, setUnwrapCredentials] = useState<UnwrapCredentials>({
    wrappedToken: '',
    notificationEmail: ''
  });

  // Load application config (title, endpoints, and namespaces) from server
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await axios.get<ConfigResponse>('/api/config');
        if (response.data.success && response.data.config) {
          setAppTitle(response.data.config.title);
          setAvailableEndpoints(response.data.config.endpoints);
          setAvailableNamespaces(response.data.config.namespaces);
          setEmailConfigured(response.data.config.email?.configured || false);
          
          // Update default endpoint to use the first endpoint from backend
          // Only if no endpoint was previously stored in localStorage
          if (response.data.config.endpoints.length > 0 && !storedEndpoint) {
            const backendDefaultEndpoint = response.data.config.endpoints[0];
            setStoredEndpoint(backendDefaultEndpoint);
            setEndpoint(backendDefaultEndpoint);
            setCredentials(prev => ({
              ...prev,
              endpoint: backendDefaultEndpoint
            }));
          }
        }
      } catch (error) {
        console.warn('Failed to load config from server, using defaults:', error);
      }
    };
    loadConfig();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync credentials with localStorage values when they change
  useEffect(() => {
    setCredentials(prev => ({
      ...prev,
      endpoint: endpoint,
      accessId: storedAccessId,
      secretPath: storedSecretPath,
      authMethod: 'approle',
      k8sNamespace: storedK8sNamespace,
      k8sSecretName: storedK8sSecretName,
      secretKey: storedSecretKey
    }));
  }, [endpoint, storedAccessId, storedSecretPath, storedK8sNamespace, storedK8sSecretName, storedSecretKey]);

  const handleEndpointChange = (value: string) => {
    setEndpoint(value);
    setStoredEndpoint(value);
  };

  const showJsonToast = (title: string, data: unknown, isSuccess: boolean = true) => {
    if (isSuccess) {
      toast.success(title, {
        description: (
          <div className="max-w-md max-h-64 overflow-auto">
            <JsonView
              value={data as object}
              style={{
                backgroundColor: 'transparent',
                fontSize: '12px',
                '--w-rjv-font-family': 'var(--font-geist-mono), Monaco, Menlo, monospace',
                '--w-rjv-color-default': '#374151',
                '--w-rjv-color-string': '#059669',
                '--w-rjv-color-number': '#dc2626',
                '--w-rjv-color-boolean': '#7c2d12',
                '--w-rjv-color-null': '#6b7280',
                '--w-rjv-color-undefined': '#6b7280',
                '--w-rjv-color-key': '#1f2937',
              } as React.CSSProperties}
              collapsed={false}
              displayDataTypes={false}
              displayObjectSize={false}
            />
          </div>
        )
      });
    } else {
      toast.error(title);
    }
  };

  const handleInputChange = (field: keyof VaultCredentials, value: string) => {
    setCredentials(prev => ({
      ...prev,
      [field]: value
    }));

    // Persist non-sensitive fields to localStorage
    switch (field) {
      case 'endpoint':
        setStoredEndpoint(value);
        break;
      case 'accessId':
        setStoredAccessId(value);
        break;
      case 'secretPath':
        setStoredSecretPath(value);
        break;
      case 'k8sNamespace':
        setStoredK8sNamespace(value);
        break;
      case 'k8sSecretName':
        setStoredK8sSecretName(value);
        break;
      case 'secretKey':
        setStoredSecretKey(value);
        break;
    }
  };

  const handleUnwrapCredentialChange = (field: keyof UnwrapCredentials, value: string) => {
    setUnwrapCredentials(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const testUnwrap = async () => {
    if (!endpoint || !unwrapCredentials.wrappedToken) {
      toast.error('Please fill in endpoint and wrapped token');
      return;
    }

    setLoading(prev => ({ ...prev, unwrap: true }));
    try {
      const response = await axios.post('/api/vault/sys/wrapping/unwrap', {
        endpoint: endpoint,
        wrappedToken: unwrapCredentials.wrappedToken,
        notificationEmail: unwrapCredentials.notificationEmail
      });

      showJsonToast('Token unwrapped successfully!', response.data);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const axiosError = error && typeof error === 'object' && 'response' in error
        ? error as { response: { data: { error?: string } } }
        : null;

      toast.error('Unwrap failed: ' + (axiosError?.response?.data?.error || errorMessage));
    } finally {
      setLoading(prev => ({ ...prev, unwrap: false }));
    }
  };

  const testLogin = async () => {
    if (!endpoint || !credentials.accessId) {
      toast.error('Please fill in endpoint and access ID');
      return;
    }

    // For AppRole, validate K8s secret fields
    if (!credentials.k8sNamespace || !credentials.k8sSecretName || !credentials.secretKey) {
      toast.error('Please fill in all Kubernetes secret reference fields');
      return;
    }

    setLoading(prev => ({ ...prev, login: true }));
    try {
      const response = await axios.post('/api/vault/auth/approle/login', {
        endpoint: endpoint,
        accessId: credentials.accessId,
        authMethod: credentials.authMethod,
        k8sNamespace: credentials.k8sNamespace,
        k8sSecretName: credentials.k8sSecretName,
        secretKey: credentials.secretKey
      });

      const result = response.data;

      if (result.auth?.client_token) {
        setToken(result.auth.client_token);
        toast.success('Login successful! Token retrieved.');
      } else {
        toast.error('Login failed: No token received from Vault');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const axiosError = error && typeof error === 'object' && 'response' in error
        ? error as { response: { data: { error?: string } } }
        : null;

      toast.error('Login failed: ' + (axiosError?.response?.data?.error || errorMessage));
    } finally {
      setLoading(prev => ({ ...prev, login: false }));
    }
  };

  const testLookup = async () => {
    if (!endpoint || !token) {
      toast.error('Please login first to get a token');
      return;
    }

    setLoading(prev => ({ ...prev, lookup: true }));
    try {
      const response = await axios.post('/api/vault/auth/token/lookup-self', {
        endpoint: endpoint,
        token: token
      });

      const result = response.data;
      if (result.data) {
        showJsonToast('Token lookup successful!', result.data);
      } else {
        toast.error('Token lookup failed: No data received from Vault');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const axiosError = error && typeof error === 'object' && 'response' in error
        ? error as { response: { data: { error?: string } } }
        : null;

      toast.error('Token lookup failed: ' + (axiosError?.response?.data?.error || errorMessage));
    } finally {
      setLoading(prev => ({ ...prev, lookup: false }));
    }
  };

  const testLogout = async () => {
    if (!endpoint || !token) {
      toast.error('No token to revoke');
      return;
    }

    setLoading(prev => ({ ...prev, logout: true }));
    try {
      await axios.post('/api/vault/auth/token/revoke-self', {
        endpoint: endpoint,
        token: token
      });

      // Vault revoke-self returns 204 No Content on success
      setToken('');
      toast.success('Logout successful! Token revoked.');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const axiosError = error && typeof error === 'object' && 'response' in error
        ? error as { response: { data: { error?: string } } }
        : null;

      toast.error('Logout failed: ' + (axiosError?.response?.data?.error || errorMessage));
    } finally {
      setLoading(prev => ({ ...prev, logout: false }));
    }
  };

  const testValidateAccess = async () => {
    if (!endpoint || !token || !credentials.secretPath) {
      toast.error('Please login first and fill in secret path');
      return;
    }

    setLoading(prev => ({ ...prev, validateAccess: true }));
    try {
      const response = await axios.post('/api/vault/sys/capabilities-self', {
        endpoint: endpoint,
        token: token,
        secretPath: credentials.secretPath
      });

      const result = response.data;
      if (result.capabilities) {
        showJsonToast('Permission validation successful!', result);
      } else {
        toast.error('Permission validation failed: No capabilities data received from Vault');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const axiosError = error && typeof error === 'object' && 'response' in error
        ? error as { response: { data: { error?: string } } }
        : null;

      toast.error('Permission validation failed: ' + (axiosError?.response?.data?.error || errorMessage));
    } finally {
      setLoading(prev => ({ ...prev, validateAccess: false }));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="container mx-auto py-12 px-4">
        <div className="flex justify-center">
          <Card className="w-full max-w-5xl shadow-xl border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="text-left pb-8">
              <CardTitle className="text-4xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                {appTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              {/* Step 1: Vault Endpoint */}
              <EndpointList
                availableEndpoints={availableEndpoints}
                currentEndpoint={endpoint}
                onEndpointChange={handleEndpointChange}
                emailConfigured={emailConfigured}
              />

              {/* Step 2: Authentication Method */}
              <AuthenticationMethod
                credentials={{
                  endpoint: credentials.endpoint,
                  authMethod: credentials.authMethod,
                  accessId: credentials.accessId,
                  k8sNamespace: credentials.k8sNamespace,
                  k8sSecretName: credentials.k8sSecretName,
                  secretKey: credentials.secretKey
                }}
                availableNamespaces={availableNamespaces}
                onCredentialChange={handleInputChange}
                onLogin={testLogin}
                onLookup={testLookup}
                onLogout={testLogout}
                loading={loading}
                token={token}
              />

              <PermissionValidation
                secretPath={credentials.secretPath}
                onSecretPathChange={(path) => handleInputChange('secretPath', path)}
                onValidateAccess={testValidateAccess}
                loading={loading}
                disabled={!token}
              />

              <WrappingTab
                credentials={unwrapCredentials}
                onCredentialChange={handleUnwrapCredentialChange}
                onUnwrap={testUnwrap}
                loading={loading}
                emailConfigured={emailConfigured}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
