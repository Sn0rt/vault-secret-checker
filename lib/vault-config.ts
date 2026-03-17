export interface AppConfig {
  title: string;
  endpoints: string[];
  namespaces: string[];
  email: {
    configured: boolean;
  };
}

export interface ConfigResponse {
  success: boolean;
  config?: AppConfig;
  error?: string;
}

export function normalizeConfiguredVaultEndpoint(endpoint: string): string {
  return endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
}

export function getK8sNamespaces(): string[] {
  const defaultNamespaces = ["default"];
  
  // Support both server and client side environment variables
  const namespaceList = process.env.K8S_NAMESPACE_LIST || process.env.NEXT_PUBLIC_K8S_NAMESPACE_LIST;
  
  if (!namespaceList) {
    return defaultNamespaces;
  }
  
  try {
    const namespaces = namespaceList
      .split(',')
      .map(ns => ns.trim())
      .filter(ns => ns && ns.length > 0);
    
    return namespaces.length > 0 ? namespaces : defaultNamespaces;
  } catch (error) {
    console.warn('Error parsing K8S_NAMESPACE_LIST:', error);
    return defaultNamespaces;
  }
}

export function getVaultEndpoints(): string[] {
  const defaultEndpoints = ["http://localhost:8200"];

  if (typeof window !== 'undefined') {
    // Client-side: use the environment variable directly
    const vaultEndpoints = process.env.NEXT_PUBLIC_VAULT_ENDPOINTS;
    if (!vaultEndpoints) {
      return defaultEndpoints;
    }

    try {
      const endpoints = vaultEndpoints
        .split(',')
        .map(endpoint => normalizeConfiguredVaultEndpoint(endpoint.trim()))
        .filter(endpoint => endpoint && endpoint.startsWith('http'));

      return endpoints.length > 0 ? endpoints : defaultEndpoints;
    } catch (error) {
      console.warn('Error parsing NEXT_PUBLIC_VAULT_ENDPOINTS:', error);
      return defaultEndpoints;
    }
  }

  // Server-side: use the same environment variable
  const vaultEndpoints = process.env.NEXT_PUBLIC_VAULT_ENDPOINTS;
  
  if (!vaultEndpoints) {
    return defaultEndpoints;
  }

  try {
    const endpoints = vaultEndpoints
      .split(',')
      .map(endpoint => normalizeConfiguredVaultEndpoint(endpoint.trim()))
      .filter(endpoint => endpoint && endpoint.startsWith('http'));

    return endpoints.length > 0 ? endpoints : defaultEndpoints;
  } catch (error) {
    console.warn('Error parsing NEXT_PUBLIC_VAULT_ENDPOINTS:', error);
    return defaultEndpoints;
  }
}

export function isAllowedVaultEndpoint(endpoint: string): boolean {
  if (!endpoint) {
    return false;
  }

  const normalizedEndpoint = normalizeConfiguredVaultEndpoint(endpoint.trim());
  return getVaultEndpoints().includes(normalizedEndpoint);
}

export function requireAllowedVaultEndpoint(endpoint: string): string {
  const normalizedEndpoint = normalizeConfiguredVaultEndpoint(endpoint.trim());

  if (!isAllowedVaultEndpoint(normalizedEndpoint)) {
    throw new Error('Vault endpoint is not allowed.');
  }

  return normalizedEndpoint;
}

export function getAppTitle(): string {
  const defaultTitle = "HashiCorp Vault Credential Validator";

  if (typeof window !== 'undefined') {
    // Client-side: use the environment variable directly
    const appTitle = process.env.NEXT_PUBLIC_APP_TITLE;
    return appTitle && appTitle.trim() ? appTitle.trim() : defaultTitle;
  }

  // Server-side: use the same environment variable
  const appTitle = process.env.NEXT_PUBLIC_APP_TITLE;
  return appTitle && appTitle.trim() ? appTitle.trim() : defaultTitle;
}
