'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginTab } from '@/components/LoginTab';

interface AuthenticationCredentials {
  authMethod: 'approle';
  accessId: string;
  endpoint: string;
  k8sNamespace: string;
  k8sSecretName: string;
  secretKey: string;
}

interface AuthenticationMethodProps {
  credentials: AuthenticationCredentials;
  availableNamespaces: string[];
  onCredentialChange: (field: keyof AuthenticationCredentials, value: string) => void;
  onLogin: () => void;
  onLookup: () => void;
  onLogout: () => void;
  loading: { login?: boolean; lookup?: boolean; logout?: boolean };
  token: string;
}

export function AuthenticationMethod({
  credentials,
  availableNamespaces,
  onCredentialChange,
  onLogin,
  onLookup,
  onLogout,
  loading,
  token
}: AuthenticationMethodProps) {
  return (
    <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl font-semibold text-slate-700 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
            <span className="text-sm font-bold text-green-600">2</span>
          </div>
          Authentication Method
        </CardTitle>
      </CardHeader>
      <CardContent>
        <LoginTab
          credentials={credentials}
          availableNamespaces={availableNamespaces}
          onCredentialChange={onCredentialChange}
          onLogin={onLogin}
          onLookup={onLookup}
          onLogout={onLogout}
          loading={loading}
          token={token}
        />
      </CardContent>
    </Card>
  );
}
